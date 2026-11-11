import { Hono, type Context } from "hono";
import { z } from "zod";
import { AnswerSchema, stepOf, SteeringSchema, TailorSectionSchema } from "@resumora/shared";
import type { Preferences } from "@resumora/shared";
import type { ModelDeps } from "../ai/call-model.ts";
import type { AppEnv } from "../app.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError, type LogFn } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import { AcceptBodySchema, acceptSection } from "./accept.ts";
import { runLayoutPass } from "./layout-pass.ts";
import { askQuestions, MAX_RUN_QUESTIONS, saveAnswers } from "./questions.ts";
import { finishedRole, RedoBodySchema, redoRole } from "./redo.ts";
import type { TailorRepo } from "./repo.ts";
import { restartWithSteering } from "./retailor.ts";
import { runSectionPass } from "./section-pass.ts";
import { jobNotFound, startTailoring } from "./start.ts";
import { toneExamples } from "./tone-examples.ts";

const AnswersBodySchema = z.object({ answers: z.array(AnswerSchema).min(1).max(MAX_RUN_QUESTIONS) });
const isUuid = (id: string) => z.uuid().safeParse(id).success;
/** Experience steps name the role they are about. */
const RoleBodySchema = z.object({ roleId: z.string().optional() });
const roleBody = async (c: Context<AppEnv>) => RoleBodySchema.parse(await c.req.json().catch(() => ({}))).roleId;

/** Mounted at /v1: POST /jobs/:id/tailor, GET /tailor-runs/:id, and the run's questions and answers. */
export function tailorRoutes(deps: {
  jobsFor(c: Context<AppEnv>): JobRepo;
  cvFor(c: Context<AppEnv>): CvRepo;
  tailorFor(c: Context<AppEnv>): TailorRepo;
  modelFor(c: Context<AppEnv>): ModelDeps;
  /** The person's saved defaults; without it a new tailored CV starts from the built-in ones. */
  preferencesFor?(c: Context<AppEnv>): Promise<Preferences>;
  now(): Date;
  log?: LogFn;
}) {
  const app = new Hono<AppEnv>();

  app.post("/jobs/:id/tailor", async (c) => {
    const id = c.req.param("id");
    // The full steering (round 2); the old { tone, instruction } body is a subset of it.
    const { instruction, ...steering } = SteeringSchema.parse(await c.req.json().catch(() => ({})));
    if (!isUuid(id)) throw jobNotFound();
    const result = await startTailoring(
      { jobs: deps.jobsFor(c), cv: deps.cvFor(c), tailor: deps.tailorFor(c), now: deps.now, preferences: deps.preferencesFor && (() => deps.preferencesFor!(c)) },
      id, { ...steering, ...(instruction?.trim() ? { instruction: instruction.trim() } : {}) },
    );
    return c.json(result);
  });

  /** The steering screen's tone cards: one of the person's bullets in each tone (cached on the job). */
  app.post("/jobs/:id/tone-examples", async (c) => {
    const id = c.req.param("id");
    const job = isUuid(id) ? await deps.jobsFor(c).get(id) : null;
    if (!job) throw jobNotFound();
    return c.json(await toneExamples({ model: deps.modelFor(c), tailor: deps.tailorFor(c) },
      { userId: c.get("user").id, jobId: id, cv: (await deps.cvFor(c).get()).content }));
  });

  /** The run with its job; a missing run or a deleted job is 404 job_not_found. */
  async function runWithJob(c: Context<AppEnv>) {
    const id = c.req.param("id") ?? "";
    const run = isUuid(id) ? await deps.tailorFor(c).getRun(id) : null;
    // A deleted job takes its runs with it; check the job too so both stores agree.
    const job = run ? await deps.jobsFor(c).get(run.jobId) : null;
    if (!run || !job) throw jobNotFound();
    return { run, job };
  }

  app.get("/tailor-runs/:id", async (c) => c.json((await runWithJob(c)).run));

  app.post("/tailor-runs/:id/sections/:section/questions", async (c) => {
    const section = TailorSectionSchema.parse(c.req.param("section"));
    const roleId = await roleBody(c);
    const { run, job } = await runWithJob(c);
    if (!job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
    const questions = await askQuestions({ model: deps.modelFor(c), tailor: deps.tailorFor(c) }, {
      userId: c.get("user").id, run, job: job.extracted, cv: (await deps.cvFor(c).get()).content, section, roleId,
    });
    return c.json({ questions });
  });

  app.post("/tailor-runs/:id/sections/:section/run", async (c) => {
    const section = TailorSectionSchema.parse(c.req.param("section"));
    const roleId = await roleBody(c);
    const { run, job } = await runWithJob(c);
    if (!job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
    if (section === "layout") {
      return c.json(await runLayoutPass({ model: deps.modelFor(c), tailor: deps.tailorFor(c) }, { userId: c.get("user").id, run, job: job.extracted }));
    }
    return c.json(await runSectionPass({ model: deps.modelFor(c), tailor: deps.tailorFor(c), log: deps.log }, {
      userId: c.get("user").id, run, job: job.extracted, cv: (await deps.cvFor(c).get()).content, section, roleId,
    }));
  });

  app.post("/tailor-runs/:id/sections/:section/accept", async (c) => {
    const section = TailorSectionSchema.parse(c.req.param("section"));
    const body = AcceptBodySchema.parse(await c.req.json().catch(() => ({})));
    const { run, job } = await runWithJob(c);
    return c.json(await acceptSection(
      { model: deps.modelFor(c), tailor: deps.tailorFor(c), cv: deps.cvFor(c), jobs: deps.jobsFor(c), now: deps.now },
      { userId: c.get("user").id, run, job, section, body },
    ));
  });

  /** Going back (BackA): new answers for a finished role, and its proposals made again for review. */
  app.post("/tailor-runs/:id/roles/:roleId/redo", async (c) => {
    const { answers } = RedoBodySchema.parse(await c.req.json().catch(() => ({})));
    const { run, job } = await runWithJob(c);
    if (!job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
    return c.json(await redoRole({ model: deps.modelFor(c), tailor: deps.tailorFor(c), cv: deps.cvFor(c), now: deps.now, log: deps.log }, {
      userId: c.get("user").id, run, job: job.extracted, roleId: c.req.param("roleId"), answers,
    }));
  });

  /** Accepts a redone role; the run stays on its current step. */
  app.post("/tailor-runs/:id/roles/:roleId/accept", async (c) => {
    const body = AcceptBodySchema.parse(await c.req.json().catch(() => ({})));
    const { run, job } = await runWithJob(c);
    const roleId = finishedRole(run, c.req.param("roleId"));
    return c.json(await acceptSection(
      { model: deps.modelFor(c), tailor: deps.tailorFor(c), cv: deps.cvFor(c), jobs: deps.jobsFor(c), now: deps.now },
      { userId: c.get("user").id, run, job, section: stepOf((await deps.cvFor(c).get()).content, roleId) ?? "experience", body: { ...body, roleId }, redo: true },
    ));
  });

  /** The stored steering, so the Tone and questions screens start from it when changed. */
  app.get("/tailor-runs/:id/steering", async (c) => {
    const { run } = await runWithJob(c);
    const stored = run.tailoredCvId ? await deps.tailorFor(c).getSteering(run.tailoredCvId) : null;
    if (!stored) throw jobNotFound();
    return c.json({ steering: stored.steering });
  });

  /** Changing the steering redoes every step with the stored answers. */
  app.post("/tailor-runs/:id/steering", async (c) => {
    const { instruction, ...steering } = SteeringSchema.parse(await c.req.json().catch(() => ({})));
    const { run } = await runWithJob(c);
    return c.json(await restartWithSteering({ tailor: deps.tailorFor(c), cv: deps.cvFor(c) }, run,
      { ...steering, ...(instruction?.trim() ? { instruction: instruction.trim() } : {}) }));
  });

  app.post("/tailor-runs/:id/answers", async (c) => {
    const { answers } = AnswersBodySchema.parse(await c.req.json().catch(() => ({})));
    const { run } = await runWithJob(c);
    await saveAnswers({ cv: deps.cvFor(c), tailor: deps.tailorFor(c), now: deps.now }, run, answers);
    return c.json({ ok: true });
  });

  return app;
}

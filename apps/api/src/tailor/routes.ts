import { Hono, type Context } from "hono";
import { z } from "zod";
import { AnswerSchema, TailorSectionSchema, ToneSchema } from "@resumora/shared";
import type { ModelDeps } from "../ai/call-model.ts";
import type { AppEnv } from "../app.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import { askQuestions, MAX_RUN_QUESTIONS, saveAnswers } from "./questions.ts";
import type { TailorRepo } from "./repo.ts";
import { jobNotFound, startTailoring } from "./start.ts";

const StartBodySchema = z.object({ tone: ToneSchema.default("neutral"), instruction: z.string().max(500).optional() });
const AnswersBodySchema = z.object({ answers: z.array(AnswerSchema).min(1).max(MAX_RUN_QUESTIONS) });
const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Mounted at /v1: POST /jobs/:id/tailor, GET /tailor-runs/:id, and the run's questions and answers. */
export function tailorRoutes(deps: {
  jobsFor(c: Context<AppEnv>): JobRepo;
  cvFor(c: Context<AppEnv>): CvRepo;
  tailorFor(c: Context<AppEnv>): TailorRepo;
  modelFor(c: Context<AppEnv>): ModelDeps;
  now(): Date;
}) {
  const app = new Hono<AppEnv>();

  app.post("/jobs/:id/tailor", async (c) => {
    const id = c.req.param("id");
    const body = StartBodySchema.parse(await c.req.json().catch(() => ({})));
    if (!isUuid(id)) throw jobNotFound();
    const result = await startTailoring(
      { jobs: deps.jobsFor(c), cv: deps.cvFor(c), tailor: deps.tailorFor(c), now: deps.now },
      id, { tone: body.tone, instruction: body.instruction?.trim() || null },
    );
    return c.json(result);
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
    const { run, job } = await runWithJob(c);
    if (!job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
    const questions = await askQuestions({ model: deps.modelFor(c), tailor: deps.tailorFor(c) }, {
      userId: c.get("user").id, run, job: job.extracted, cv: (await deps.cvFor(c).get()).content, section,
    });
    return c.json({ questions });
  });

  app.post("/tailor-runs/:id/answers", async (c) => {
    const { answers } = AnswersBodySchema.parse(await c.req.json().catch(() => ({})));
    const { run } = await runWithJob(c);
    await saveAnswers({ cv: deps.cvFor(c), tailor: deps.tailorFor(c), now: deps.now }, run, answers);
    return c.json({ ok: true });
  });

  return app;
}

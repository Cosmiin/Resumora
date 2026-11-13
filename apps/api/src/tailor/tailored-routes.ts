import { Hono, type Context } from "hono";
import { z } from "zod";
import { CvContentSchema, TailoredCvSchema } from "@resumora/shared";
import type { AppEnv } from "../app.ts";
import { readJson, saveResponse } from "../cv/routes.ts";
import { ApiError } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import type { CvRepo } from "../cv/repo.ts";
import { jobScore, type TailorRepo } from "./repo.ts";
import { scoreTailored } from "./accept.ts";
import { RetailorBodySchema, startRetailor } from "./retailor.ts";
import { TranslateBodySchema, translateTailored } from "./translate.ts";
import { editCoverLetter, LetterBodySchema, LetterEditSchema, writeCoverLetter } from "./letter.ts";
import type { ModelDeps } from "../ai/call-model.ts";
import { jobNotFound } from "./start.ts";
import { reviewItem, ReviewItemBodySchema } from "./review-item.ts";

const SaveBody = z.object({ content: CvContentSchema, expectedVersion: z.number().int().min(1) });
const TemplateBody = z.object({ template: TailoredCvSchema.shape.template });
const isUuid = (id: string) => z.uuid().safeParse(id).success;
const notFound = () => new ApiError(404, "not_found", "This tailored CV no longer exists.");

/** Mounted at /v1: GET /jobs/:id/tailored, GET/PUT/PATCH /tailored/:id and POST /tailored/:id/score. RLS keeps other users' rows invisible (404). */
export function tailoredRoutes(deps: {
  jobsFor(c: Context<AppEnv>): JobRepo;
  cvFor(c: Context<AppEnv>): CvRepo;
  tailorFor(c: Context<AppEnv>): TailorRepo;
  modelFor(c: Context<AppEnv>): ModelDeps;
  now(): Date;
}) {
  const app = new Hono<AppEnv>();
  const id = (c: Context<AppEnv>) => {
    const value = c.req.param("id") ?? "";
    if (!isUuid(value)) throw notFound();
    return value;
  };

  app.get("/jobs/:id/tailored", async (c) => {
    const jobId = c.req.param("id");
    if (!isUuid(jobId) || !(await deps.jobsFor(c).get(jobId))) throw jobNotFound();
    return c.json({ items: await deps.tailorFor(c).listTailoredCvs(jobId) });
  });

  app.get("/tailored/:id", async (c) => {
    const cv = await deps.tailorFor(c).readTailoredCv(id(c));
    if (!cv) throw notFound();
    return c.json(cv);
  });

  app.put("/tailored/:id", async (c) => {
    const tailoredId = id(c);
    const { content, expectedVersion } = SaveBody.parse(await readJson(c));
    const result = await deps.tailorFor(c).saveTailoredContent(tailoredId, expectedVersion, content);
    if (!result) throw notFound();
    return saveResponse(c, result);
  });

  /** Re-check: scores the copy as it stands now. Nothing else re-scores a copy edited by hand. */
  app.post("/tailored/:id/score", async (c) => {
    const tailor = deps.tailorFor(c);
    const cv = await tailor.readTailoredCv(id(c));
    if (!cv) throw notFound();
    const job = await deps.jobsFor(c).get(cv.jobId);
    if (!job) throw jobNotFound();
    if (!job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
    const score = await scoreTailored({ model: deps.modelFor(c), tailor }, { userId: c.get("user").id, cv, job: job.extracted });
    await tailor.saveScore(cv.jobId, "tailored", cv.id, score);
    return c.json(await jobScore(tailor, cv.jobId, cv.id));
  });

  app.patch("/tailored/:id", async (c) => {
    const tailoredId = id(c);
    const { template } = TemplateBody.parse(await c.req.json().catch(() => ({})));
    if (!(await deps.tailorFor(c).setTemplate(tailoredId, template))) throw notFound();
    return c.json({ template });
  });

  // The guided review's decision on one AI guess (GuideA).
  app.patch("/tailored/:id/review", async (c) => {
    const tailoredId = id(c);
    const body = ReviewItemBodySchema.parse(await c.req.json().catch(() => ({})));
    const cv = await reviewItem(deps.tailorFor(c), tailoredId, body);
    if (!cv) throw notFound();
    return c.json(cv);
  });

  app.post("/tailored/:id/retailor", async (c) => {
    const tailoredId = id(c);
    const { sections } = RetailorBodySchema.parse(await c.req.json().catch(() => ({})));
    const started = await startRetailor({ jobs: deps.jobsFor(c), tailor: deps.tailorFor(c), cv: deps.cvFor(c) }, tailoredId, sections);
    if (!started) throw notFound();
    return c.json(started);
  });

  app.post("/tailored/:id/translate", async (c) => {
    const tailoredId = id(c);
    const { language } = TranslateBodySchema.parse(await c.req.json().catch(() => ({})));
    const result = await translateTailored({ model: deps.modelFor(c), tailor: deps.tailorFor(c), now: deps.now },
      { userId: c.get("user").id, id: tailoredId, language });
    if (!result) throw notFound();
    return c.json(result);
  });

  app.post("/tailored/:id/cover-letter", async (c) => {
    const tailoredId = id(c);
    const body = LetterBodySchema.parse(await c.req.json().catch(() => ({})));
    const result = await writeCoverLetter({ model: deps.modelFor(c), tailor: deps.tailorFor(c), jobs: deps.jobsFor(c), now: deps.now },
      { userId: c.get("user").id, id: tailoredId, ...body });
    if (!result) throw notFound();
    return c.json(result);
  });

  app.put("/tailored/:id/cover-letter", async (c) => {
    const tailoredId = id(c);
    const edit = LetterEditSchema.parse(await c.req.json().catch(() => ({})));
    const coverLetter = await editCoverLetter(deps.tailorFor(c), tailoredId, edit);
    if (!coverLetter) throw notFound();
    return c.json({ coverLetter });
  });

  return app;
}

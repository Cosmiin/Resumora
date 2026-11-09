import { Hono, type Context } from "hono";
import { z } from "zod";
import { CvContentSchema, TailoredCvSchema } from "@resumora/shared";
import type { AppEnv } from "../app.ts";
import { readJson, saveResponse } from "../cv/routes.ts";
import { ApiError } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import type { TailorRepo } from "./repo.ts";
import { RetailorBodySchema, startRetailor } from "./retailor.ts";
import { TranslateBodySchema, translateTailored } from "./translate.ts";
import type { ModelDeps } from "../ai/call-model.ts";
import { jobNotFound } from "./start.ts";

const SaveBody = z.object({ content: CvContentSchema, expectedVersion: z.number().int().min(1) });
const TemplateBody = z.object({ template: TailoredCvSchema.shape.template });
const isUuid = (id: string) => z.uuid().safeParse(id).success;
const notFound = () => new ApiError(404, "not_found", "This tailored CV no longer exists.");

/** Mounted at /v1: GET /jobs/:id/tailored, and GET/PUT/PATCH /tailored/:id. RLS keeps other users' rows invisible (404). */
export function tailoredRoutes(deps: {
  jobsFor(c: Context<AppEnv>): JobRepo;
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

  app.patch("/tailored/:id", async (c) => {
    const tailoredId = id(c);
    const { template } = TemplateBody.parse(await c.req.json().catch(() => ({})));
    if (!(await deps.tailorFor(c).setTemplate(tailoredId, template))) throw notFound();
    return c.json({ template });
  });

  app.post("/tailored/:id/retailor", async (c) => {
    const tailoredId = id(c);
    const { sections } = RetailorBodySchema.parse(await c.req.json().catch(() => ({})));
    const started = await startRetailor({ jobs: deps.jobsFor(c), tailor: deps.tailorFor(c) }, tailoredId, sections);
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

  return app;
}

import { Hono, type Context } from "hono";
import { z } from "zod";
import { ToneSchema } from "@resumora/shared";
import type { AppEnv } from "../app.ts";
import type { CvRepo } from "../cv/repo.ts";
import type { JobRepo } from "../jobs/repo.ts";
import type { TailorRepo } from "./repo.ts";
import { jobNotFound, startTailoring } from "./start.ts";

const StartBodySchema = z.object({ tone: ToneSchema.default("neutral"), instruction: z.string().max(500).optional() });
const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Mounted at /v1: POST /jobs/:id/tailor and GET /tailor-runs/:id. */
export function tailorRoutes(deps: {
  jobsFor(c: Context<AppEnv>): JobRepo;
  cvFor(c: Context<AppEnv>): CvRepo;
  tailorFor(c: Context<AppEnv>): TailorRepo;
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

  app.get("/tailor-runs/:id", async (c) => {
    const id = c.req.param("id");
    const run = isUuid(id) ? await deps.tailorFor(c).getRun(id) : null;
    // A deleted job takes its runs with it; check the job too so both stores agree.
    if (!run || !(await deps.jobsFor(c).get(run.jobId))) throw jobNotFound();
    return c.json(run);
  });

  return app;
}

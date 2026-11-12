import { Hono, type Context } from "hono";
import { z } from "zod";
import { CreateJobBodySchema, JobListQuerySchema, JobPatchBodySchema, findJobPosting, normalizeJobUrl } from "@resumora/shared";
import type { ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { jobScore, type TailorRepo } from "../tailor/repo.ts";
import { scoreMatch } from "../tailor/score.ts";
import type { AppEnv } from "../app.ts";
import { ApiError } from "../errors.ts";
import { JOBS_PER_DAY, decodeJobCursor, encodeJobCursor, type JobMessage, type JobRepo } from "./repo.ts";

const MAX_BODY_BYTES = 100 * 1024;
const DAY_MS = 24 * 60 * 60_000;
const isUuid = (id: string) => z.uuid().safeParse(id).success;
const tooLarge = () => new ApiError(413, "payload_too_large", "This page is too large to send.");
const tooShort = () => new ApiError(400, "text_too_short", "Not enough text on this page. Select the job description and try again.");
const notFound = () => new ApiError(404, "not_found", "That job doesn't exist.");

export function jobRoutes(deps: {
  repoFor(c: Context<AppEnv>): JobRepo;
  tailorRepoFor(c: Context<AppEnv>): TailorRepo;
  cvFor(c: Context<AppEnv>): CvRepo;
  modelFor(c: Context<AppEnv>): ModelDeps;
  queue: { send(message: JobMessage): Promise<void> };
  now(): Date;
}) {
  const app = new Hono<AppEnv>();

  app.post("/", async (c) => {
    if (Number(c.req.header("content-length") ?? 0) > MAX_BODY_BYTES) throw tooLarge();
    const bytes = await c.req.arrayBuffer();
    if (bytes.byteLength > MAX_BODY_BYTES) throw tooLarge();
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      input = {};
    }
    const parsed = CreateJobBodySchema.safeParse(input);
    if (!parsed.success) {
      if (parsed.error.issues.some((issue) => issue.path[0] === "url")) {
        throw new ApiError(400, "invalid_url", "This doesn't look like a job link.");
      }
      if (parsed.error.issues.some((issue) => issue.path[0] === "pageText" && issue.code === "too_small")) throw tooShort();
      throw parsed.error;
    }
    const body = parsed.data;
    if (!body.pageText) throw tooShort();

    const repo = deps.repoFor(c);
    const urlNormalized = normalizeJobUrl(body.url);
    const existing = await repo.findByUrl(urlNormalized);
    if (existing) return c.json({ id: existing, existing: true });
    const since = new Date(deps.now().getTime() - DAY_MS).toISOString();
    if ((await repo.countRunsSince(since)) >= JOBS_PER_DAY) {
      throw new ApiError(429, "job_limit", `You can add up to ${JOBS_PER_DAY} jobs per day.`);
    }
    const created = await repo.create({
      id: crypto.randomUUID(), source: body.source ?? "extension", url: body.url, urlNormalized,
      rawText: body.pageText.slice(0, 30_000), jsonLd: findJobPosting(body.jsonLd ?? []),
    });
    if (created.existing) return c.json({ id: created.id, existing: true });
    try {
      await deps.queue.send({ jobId: created.id, userId: c.get("user").id });
    } catch (err) {
      await repo.remove(created.id);
      throw err;
    }
    return c.json({ id: created.id }, 202);
  });

  app.get("/", async (c) => {
    const invalid = () => new ApiError(400, "invalid_request", "Something went wrong loading your jobs. Reload the page.");
    const parsed = JobListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) throw invalid();
    const { limit, cursor, source } = parsed.data;
    const after = cursor === undefined ? null : decodeJobCursor(cursor);
    if (cursor !== undefined && !after) throw invalid();
    const { items, next } = await deps.repoFor(c).list({ limit, after, source });
    return c.json({ items, nextCursor: next ? encodeJobCursor(next) : null });
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const found = isUuid(id) ? await deps.repoFor(c).get(id) : null;
    if (!found) throw notFound();
    return c.json(found);
  });

  app.get("/:id/score", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id) || !(await deps.repoFor(c).get(id))) throw notFound();
    // ?cv= picks one of the job's tailored CVs; anything else counts as absent.
    return c.json(await jobScore(deps.tailorRepoFor(c), id, c.req.query("cv")));
  });

  /** Score 1 for a ready job that has none yet (saved before scoring existed, or scoring failed once); never rescores. */
  app.post("/:id/score", async (c) => {
    const id = c.req.param("id");
    const job = isUuid(id) ? await deps.repoFor(c).get(id) : null;
    if (!job) throw notFound();
    if (job.status !== "ready" || !job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
    const tailor = deps.tailorRepoFor(c);
    if (!(await tailor.getScore(id, "base"))) {
      const base = await scoreMatch({ model: deps.modelFor(c) }, {
        userId: c.get("user").id, cv: (await deps.cvFor(c).get()).content, job: job.extracted, keptInferred: new Set(),
      });
      await tailor.saveScore(id, "base", null, base);
    }
    return c.json(await jobScore(tailor, id));
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const { version, extracted, ...fields } = JobPatchBodySchema.parse(await c.req.json().catch(() => ({})));
    const repo = deps.repoFor(c);
    const result = isUuid(id) ? await repo.patch(id, version, extracted, fields) : "not_found";
    if (result === "not_found") throw notFound();
    if (result === "conflict") throw new ApiError(409, "version_conflict", "This job changed elsewhere. Reload to see the latest.");
    if (result === "wrong_status") throw new ApiError(409, "wrong_status", "This job can't be changed right now.");
    const updated = await repo.get(id);
    if (!updated) throw notFound();
    return c.json(updated);
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id) || !(await deps.repoFor(c).remove(id))) throw notFound();
    return c.body(null, 204);
  });

  return app;
}

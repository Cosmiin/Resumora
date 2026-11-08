import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AuthUser } from "./env.ts";
import type { CvRepo } from "./cv/repo.ts";
import { ApiError, errorBody, toErrorResponse, type LogFn } from "./errors.ts";
import { cvRoutes } from "./cv/routes.ts";
import type { ImportMessage, ImportRepo } from "./imports/repo.ts";
import { importRoutes } from "./imports/routes.ts";
import type { JobMessage, JobRepo } from "./jobs/repo.ts";
import { jobRoutes } from "./jobs/routes.ts";
import type { TailorRepo } from "./tailor/repo.ts";
import { tailorRoutes } from "./tailor/routes.ts";
import { tailoredRoutes } from "./tailor/tailored-routes.ts";
import type { ModelDeps } from "./ai/call-model.ts";
import type { VoiceDeps } from "./ai/voice-session.ts";
import type { InsightsRepo } from "./enrich/repo.ts";
import { enrichRoutes } from "./enrich/routes.ts";

export type AppDeps = {
  /** The only browser origin allowed to call the API cross-origin. */
  appOrigin: string;
  /** Returns the user for a valid access token, null for an invalid one. */
  verifyToken(token: string): Promise<AuthUser | null>;
  cvRepo(user: AuthUser): CvRepo;
  importRepo(user: AuthUser): ImportRepo;
  jobRepo(user: AuthUser): JobRepo;
  tailorRepo?(user: AuthUser): TailorRepo;
  insightsRepo(user: AuthUser): InsightsRepo;
  /** Model access for request handlers, logging each call as this user. */
  model(user: AuthUser): ModelDeps;
  /** Live voice sessions (OpenAI key and logging). */
  voice?(user: AuthUser): VoiceDeps;
  /** Where new imports are sent for processing. */
  queue: { send(message: ImportMessage): Promise<void> };
  jobQueue: { send(message: JobMessage): Promise<void> };
  /** Injectable clock for the daily import and job limits. */
  now?: () => Date;
  log: LogFn;
};

export type AppEnv = { Variables: { requestId: string; user: AuthUser } };

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    await next();
    c.header("x-request-id", requestId);
  });

  app.use(
    "*",
    cors({
      origin: (origin) => (origin === deps.appOrigin ? origin : null),
      allowHeaders: ["authorization", "content-type"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["x-request-id"],
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.use("/v1/*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const user = token ? await deps.verifyToken(token) : null;
    if (!user) throw new ApiError(401, "unauthorized", "Please sign in again.");
    c.set("user", user);
    await next();
  });

  app.route("/v1/cv", cvRoutes((c) => deps.cvRepo(c.get("user"))));
  app.route(
    "/v1/imports",
    importRoutes({ repoFor: (c) => deps.importRepo(c.get("user")), cvRepoFor: (c) => deps.cvRepo(c.get("user")), queue: deps.queue, now: deps.now ?? (() => new Date()) }),
  );

  app.route("/v1/enrich", enrichRoutes({ cvRepo: deps.cvRepo, insightsRepo: deps.insightsRepo, model: deps.model, voice: deps.voice }));
  app.route(
    "/v1/jobs",
    jobRoutes({
      repoFor: (c) => deps.jobRepo(c.get("user")),
      tailorRepoFor: (c) => {
        if (!deps.tailorRepo) throw new Error("Score repository is not configured");
        return deps.tailorRepo(c.get("user"));
      },
      queue: deps.jobQueue, now: deps.now ?? (() => new Date()),
    }),
  );
  app.route(
    "/v1",
    tailorRoutes({
      jobsFor: (c) => deps.jobRepo(c.get("user")),
      cvFor: (c) => deps.cvRepo(c.get("user")),
      tailorFor: (c) => {
        if (!deps.tailorRepo) throw new Error("Tailor repository is not configured");
        return deps.tailorRepo(c.get("user"));
      },
      modelFor: (c) => deps.model(c.get("user")),
      now: deps.now ?? (() => new Date()),
    }),
  );

  app.route(
    "/v1",
    tailoredRoutes({
      jobsFor: (c) => deps.jobRepo(c.get("user")),
      tailorFor: (c) => {
        if (!deps.tailorRepo) throw new Error("Tailor repository is not configured");
        return deps.tailorRepo(c.get("user"));
      },
      modelFor: (c) => deps.model(c.get("user")),
      now: deps.now ?? (() => new Date()),
    }),
  );

  app.notFound((c) => c.json(errorBody("not_found", "Not found.", c.get("requestId")), 404));

  app.onError((err, c) => {
    const { status, body } = toErrorResponse(err, {
      requestId: c.get("requestId"),
      path: c.req.path,
      log: deps.log,
    });
    return c.json(body, status);
  });

  return app;
}

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import type { ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import type { AuthUser } from "../env.ts";
import { ApiError } from "../errors.ts";
import type { InsightsRepo } from "./repo.ts";
import { scoreRole } from "./score.ts";

const ScoreBody = z.object({ roleId: z.string().min(1).max(64), fingerprint: z.string().min(1).max(64) });

export function enrichRoutes(deps: {
  cvRepo(user: AuthUser): CvRepo;
  insightsRepo(user: AuthUser): InsightsRepo;
  model(user: AuthUser): ModelDeps;
}) {
  const app = new Hono<AppEnv>();

  app.get("/scores", async (c) => c.json({ items: await deps.insightsRepo(c.get("user")).list() }));

  app.post("/score", async (c) => {
    const body = ScoreBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError(400, "invalid_request", "Send a roleId and a fingerprint.");
    const user = c.get("user");
    const result = await scoreRole(
      { cv: deps.cvRepo(user), insights: deps.insightsRepo(user), model: deps.model(user), userId: user.id },
      body.data,
    );
    return c.json(result);
  });

  return app;
}

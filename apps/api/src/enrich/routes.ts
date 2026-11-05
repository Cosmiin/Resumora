import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { RewriteEventSchemas, type RewriteEvent } from "@resumora/shared";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import type { ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import type { AuthUser } from "../env.ts";
import { ApiError } from "../errors.ts";
import type { InsightsRepo } from "./repo.ts";
import { scoreRole } from "./score.ts";
import { streamModel } from "../ai/stream-model.ts";
import { checkProposal, checkSummary, keepAsIsIds, rewriteEvents } from "./rewrite.ts";
import { rewriteRoleSystemPrompt, rewriteRoleUserMessage, rewriteSummarySystemPrompt, rewriteSummaryUserMessage } from "./rewrite-prompts.ts";

const RoleBody = z.object({ roleId: z.string().min(1).max(64) });
const notSaved = () => new ApiError(409, "not_saved", "Your latest changes aren't saved yet. Try again in a moment.");

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

  /** Streams rewrite events. Everything that can still fail with plain JSON happens before this is called. */
  const sendEvents = (c: Context<AppEnv>, events: AsyncIterable<RewriteEvent>) =>
    streamSSE(c, async (stream) => {
      for await (const e of events) {
        if (stream.aborted) return;
        await stream.writeSSE({ event: e.event, data: JSON.stringify(RewriteEventSchemas[e.event].parse(e.data)) });
      }
    });

  app.post("/rewrite-role", async (c) => {
    const body = RoleBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError(400, "invalid_request", "Send a roleId.");
    const user = c.get("user");
    const cv = deps.cvRepo(user);
    const { content } = await cv.get();
    const role = content.experience.find((r) => r.id === body.data.roleId);
    if (!role) throw notSaved();
    const keep = await keepAsIsIds(role, content.locale, deps.insightsRepo(user));
    await cv.snapshot("ai");
    const chunks = streamModel(deps.model(user), {
      userId: user.id,
      task: "enrich_rewrite_role",
      system: rewriteRoleSystemPrompt(content.locale),
      user: rewriteRoleUserMessage(role, keep),
      maxOutputTokens: 2500,
      signal: c.req.raw.signal,
    });
    return sendEvents(c, rewriteEvents(chunks, (key, text) => checkProposal(role, key, text, role.notes, keep)));
  });

  app.post("/rewrite-summary", async (c) => {
    const user = c.get("user");
    const cv = deps.cvRepo(user);
    const { content } = await cv.get();
    await cv.snapshot("ai");
    const chunks = streamModel(deps.model(user), {
      userId: user.id,
      task: "enrich_rewrite_summary",
      system: rewriteSummarySystemPrompt(content.locale),
      user: rewriteSummaryUserMessage(content.basics.summary, content.experience),
      maxOutputTokens: 800,
      signal: c.req.raw.signal,
    });
    return sendEvents(c, rewriteEvents(chunks, (key, text) => checkSummary(content, key, text)));
  });

  return app;
}

import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { RewriteEventSchemas, VOICE, type Locale, type RewriteEvent } from "@resumora/shared";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import type { ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import type { AuthUser } from "../env.ts";
import { ApiError } from "../errors.ts";
import { createVoiceSession, VoiceUnavailableError, VOICE_TASK, type VoiceDeps } from "../ai/voice-session.ts";
import type { InsightsRepo } from "./repo.ts";
import { scoreRole } from "./score.ts";
import { suggestSkills } from "./skills.ts";
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
  /** Not set in tests that never use voice. */
  voice?(user: AuthUser): VoiceDeps;
  now?: () => Date;
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
    return sendEvents(c, rewriteEvents(chunks, (key, text) => checkProposal(role, key, text, keep)));
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

  app.post("/skills", async (c) => {
    const user = c.get("user");
    return c.json(await suggestSkills({ cv: deps.cvRepo(user), model: deps.model(user), userId: user.id }));
  });

  app.post("/voice-session", async (c) => {
    const user = c.get("user");
    if (!deps.voice) throw new ApiError(503, "ai_unavailable", "Voice answers aren't available right now.");
    const since = new Date((deps.now?.() ?? new Date()).getTime() - 24 * 3600_000).toISOString();
    if ((await deps.insightsRepo(user).countAiCallsSince(VOICE_TASK, since)) >= VOICE.perDay) {
      throw new ApiError(429, "voice_limit", "You've used today's voice answers. You can still type or pick.");
    }
    const locale: Locale = (await deps.cvRepo(user).get()).content.locale;
    try {
      return c.json(await createVoiceSession(deps.voice(user), { userId: user.id, locale }));
    } catch (e) {
      if (e instanceof VoiceUnavailableError) throw new ApiError(503, "ai_unavailable", "Voice answers aren't available right now. You can still type or pick.");
      throw e;
    }
  });

  return app;
}

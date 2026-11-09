import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { RewriteEventSchemas, VOICE, type Locale, type RewriteEvent } from "@resumora/shared";
import { z } from "zod";
import type { AppEnv } from "../app.ts";
import type { ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import type { AuthUser } from "../env.ts";
import { ApiError } from "../errors.ts";
import { createVoiceSession, VoiceUnavailableError, type VoiceDeps } from "../ai/voice-session.ts";
import type { InsightsRepo } from "./repo.ts";
import { scoreRole } from "./score.ts";
import { improveBullet } from "./improve.ts";
import { brainDump } from "./brain-dump.ts";
import { roleFacts } from "./role-facts.ts";
import { suggestSkills } from "./skills.ts";
import { streamModel } from "../ai/stream-model.ts";
import { checkSummary, rewriteEvents } from "./rewrite.ts";
import { rewriteSummarySystemPrompt, rewriteSummaryUserMessage } from "./rewrite-prompts.ts";

const RoleBody = z.object({ roleId: z.string().min(1).max(64) });

const ScoreBody = z.object({ roleId: z.string().min(1).max(64), fingerprint: z.string().min(1).max(64) });
const ImproveBody = ScoreBody.extend({ bulletId: z.string().min(1).max(64) });
/** fresh: ask the model again with the notes in view, instead of returning the stored result. */
const ScoreRequestBody = ScoreBody.extend({ fresh: z.boolean().optional() });
const BrainDumpBody = ScoreBody.extend({ source: z.enum(["ramble", "answers"]).default("ramble") });

/** Enrich bodies are tiny ({ roleId, fingerprint } or nothing), so anything bigger is refused before it is read. */
const MAX_BODY_BYTES = 16 * 1024;

export function enrichRoutes(deps: {
  cvRepo(user: AuthUser): CvRepo;
  insightsRepo(user: AuthUser): InsightsRepo;
  model(user: AuthUser): ModelDeps;
  /** Not set in tests that never use voice. */
  voice?(user: AuthUser): VoiceDeps;
}) {
  const app = new Hono<AppEnv>();
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new ApiError(413, "content_too_large", "This request is too large.");
      },
    }),
  );

  app.get("/scores", async (c) => c.json({ items: await deps.insightsRepo(c.get("user")).list() }));

  app.post("/score", async (c) => {
    const body = ScoreRequestBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError(400, "invalid_request", "Send a roleId and a fingerprint.");
    const user = c.get("user");
    const result = await scoreRole(
      { cv: deps.cvRepo(user), insights: deps.insightsRepo(user), model: deps.model(user), userId: user.id },
      body.data,
    );
    return c.json(result);
  });

  app.post("/improve-bullet", async (c) => {
    const body = ImproveBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError(400, "invalid_request", "Send a roleId, bulletId and a fingerprint.");
    const user = c.get("user");
    try {
      const result = await improveBullet(
        { cv: deps.cvRepo(user), insights: deps.insightsRepo(user), model: deps.model(user), userId: user.id },
        body.data,
      );
      return c.json(result);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 500) {
        console.error(JSON.stringify({ msg: "improve bullet failed", code: err.code, requestId: c.get("requestId") }));
      }
      throw err;
    }
  });

  app.post("/brain-dump", async (c) => {
    const body = BrainDumpBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError(400, "invalid_request", "Send a roleId and a fingerprint.");
    const user = c.get("user");
    try {
      return c.json(await brainDump(
        { cv: deps.cvRepo(user), insights: deps.insightsRepo(user), model: deps.model(user), userId: user.id },
        body.data,
      ));
    } catch (err) {
      if (err instanceof ApiError && err.status >= 500) {
        console.error(JSON.stringify({ msg: "brain dump failed", code: err.code, requestId: c.get("requestId") }));
      }
      throw err;
    }
  });

  app.post("/role-facts", async (c) => {
    const body = RoleBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError(400, "invalid_request", "Send a roleId.");
    const user = c.get("user");
    try {
      return c.json(await roleFacts(
        { cv: deps.cvRepo(user), insights: deps.insightsRepo(user), model: deps.model(user), userId: user.id },
        body.data,
      ));
    } catch (err) {
      if (err instanceof ApiError && err.status >= 500) {
        console.error(JSON.stringify({ msg: "role facts failed", code: err.code, requestId: c.get("requestId") }));
      }
      throw err;
    }
  });

  /** Streams rewrite events. Everything that can still fail with plain JSON happens before this is called. */
  const sendEvents = (c: Context<AppEnv>, events: AsyncIterable<RewriteEvent>) =>
    streamSSE(c, async (stream) => {
      for await (const e of events) {
        if (stream.aborted) return;
        await stream.writeSSE({ event: e.event, data: JSON.stringify(RewriteEventSchemas[e.event].parse(e.data)) });
      }
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
    const locale: Locale = (await deps.cvRepo(user).get()).content.locale;
    // Counts and records the session in one step; a failed OpenAI call below still uses it up.
    if (!(await deps.insightsRepo(user).reserveVoiceSession(VOICE.model, VOICE.perDay))) {
      throw new ApiError(429, "voice_limit", "You've used today's voice answers. You can still type or pick.");
    }
    try {
      return c.json(await createVoiceSession(deps.voice(user), { userId: user.id, locale }));
    } catch (e) {
      if (e instanceof VoiceUnavailableError) throw new ApiError(503, "ai_unavailable", "Voice answers aren't available right now. You can still type or pick.");
      throw e;
    }
  });

  return app;
}

import { describe, expect, it, vi } from "vitest";
import { emptyCv } from "@resumora/shared";
import { createApp } from "../app.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { memoryInsightsRepo, type MemoryAiCalls } from "../enrich/memory-repo.ts";
import type { AiCallLog } from "./call-model.ts";
import { createVoiceSession, type VoiceDeps } from "./voice-session.ts";

const KEY = "sk-real-key-123";
const okAnswer = () => Response.json({ value: "ek_temp", expires_at: 1_800_000_060, session: { expires_at: 0, type: "transcription" } });

type Sent = { url: string; headers: Headers; body: { session: { audio: { input: { transcription: { language: string } } } } } };

function deps(answer: () => Response | Promise<Response> = okAnswer) {
  const requests: Sent[] = [];
  const calls: AiCallLog[] = [];
  const d: VoiceDeps = {
    apiKey: KEY,
    fetch: (async (url: string, init: RequestInit) => {
      requests.push({ url, headers: new Headers(init.headers), body: JSON.parse(init.body as string) });
      return answer();
    }) as unknown as typeof fetch,
    logCall: async (e) => void calls.push(e),
  };
  return { d, requests, calls };
}

describe("createVoiceSession", () => {
  it("asks the confirmed endpoint with the model and the CV language", async () => {
    const { d, requests } = deps();
    await createVoiceSession(d, { userId: "u1", locale: "ro" });
    expect(requests[0]!.url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(requests[0]!.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(requests[0]!.body).toEqual({
      expires_after: { anchor: "created_at", seconds: 10 },
      session: {
        type: "transcription",
        audio: { input: { transcription: { model: "gpt-4o-mini-transcribe", language: "ro" }, turn_detection: { type: "server_vad" } } },
      },
    });
  });

  it("returns only the secret, its expiry and the model, and never our key", async () => {
    const { d } = deps();
    const out = await createVoiceSession(d, { userId: "u1", locale: "en" });
    expect(out).toEqual({ clientSecret: "ek_temp", expiresAt: new Date(1_800_000_060_000).toISOString(), model: "gpt-4o-mini-transcribe" });
    expect(JSON.stringify(out)).not.toContain(KEY);
  });

  it("logs nothing on success: the route's reservation is the success log", async () => {
    const { d, calls } = deps();
    await createVoiceSession(d, { userId: "u1", locale: "en" });
    expect(calls).toHaveLength(0);
  });

  it("an OpenAI 500 throws and logs an error row", async () => {
    const { d, calls } = deps(() => new Response("boom", { status: 500 }));
    await expect(createVoiceSession(d, { userId: "u1", locale: "en" })).rejects.toThrow(/unavailable/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ task: "enrich_voice", status: "error" });
    expect(JSON.stringify(calls[0])).not.toContain(KEY);
  });

  it("a failed log on an error answer still throws unavailable", async () => {
    const bad = deps(() => new Response("x", { status: 500 }));
    bad.d.logCall = async () => { throw new Error("db down"); };
    await expect(createVoiceSession(bad.d, { userId: "u1", locale: "en" })).rejects.toThrow(/unavailable/);
  });

  it("a network error throws and logs an error row", async () => {
    const { d, calls } = deps(() => Promise.reject(new TypeError("fetch failed")));
    await expect(createVoiceSession(d, { userId: "u1", locale: "en" })).rejects.toThrow(/unavailable/);
    expect(calls[0]).toMatchObject({ status: "error" });
  });
});

describe("POST /v1/enrich/voice-session", () => {
  const auth = { authorization: "Bearer good" };
  function setup(opts: { locale?: "en" | "ro"; answer?: () => Response; recent?: number } = {}) {
    const { d, requests, calls } = deps(opts.answer);
    const aiCalls: MemoryAiCalls = [];
    for (let i = 0; i < (opts.recent ?? 0); i++) {
      aiCalls.push({ userId: "user-1", task: "enrich_voice", status: "ok" as const, createdAt: new Date(Date.now() - 60_000).toISOString() });
    }
    const cv = memoryCvRepo();
    const ready = opts.locale ? cv.save(emptyCv(opts.locale), 0) : Promise.resolve();
    const app = createApp({
      appOrigin: "http://127.0.0.1:5173",
      verifyToken: async (t) => (t === "good" ? { id: "user-1", token: t } : null),
      cvRepo: () => cv,
      importRepo: () => {
        throw new Error("not used");
      },
      insightsRepo: (u) => memoryInsightsRepo(u.id, new Map(), aiCalls),
      model: () => {
        throw new Error("not used");
      },
      voice: () => ({
        ...d,
        logCall: async (e) => {
          await d.logCall(e);
          aiCalls.push({ userId: e.userId, task: e.task, status: e.status, createdAt: new Date().toISOString() });
        },
      }),
      queue: { send: async () => {} },
      log: vi.fn(),
    });
    const post = async () => {
      await ready;
      return app.request("/v1/enrich/voice-session", { method: "POST", headers: auth });
    };
    return { post, requests, calls, app, aiCalls };
  }
  const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

  it("needs sign-in", async () => {
    const { app } = setup();
    expect((await app.request("/v1/enrich/voice-session", { method: "POST" })).status).toBe(401);
  });

  it("uses the saved CV's language, and English when there is no CV", async () => {
    const ro = setup({ locale: "ro" });
    expect((await ro.post()).status).toBe(200);
    expect(ro.requests[0]!.body.session.audio.input.transcription.language).toBe("ro");
    const none = setup();
    const res = await none.post();
    expect(none.requests[0]!.body.session.audio.input.transcription.language).toBe("en");
    expect(Object.keys((await res.json()) as object).sort()).toEqual(["clientSecret", "expiresAt", "model"]);
  });

  it("allows the 20th session and refuses the 21st with 429 voice_limit before calling OpenAI", async () => {
    const nineteen = setup({ recent: 19 });
    expect((await nineteen.post()).status).toBe(200);
    const next = await nineteen.post();
    expect(next.status).toBe(429);
    expect(await code(next)).toBe("voice_limit");
    expect(nineteen.requests).toHaveLength(1);
  });

  it("lets only one of many parallel requests at 19 through", async () => {
    const s = setup({ recent: 19 });
    const all = await Promise.all(Array.from({ length: 5 }, () => s.post()));
    expect(all.map((r) => r.status).sort()).toEqual([200, 429, 429, 429, 429]);
    expect(s.requests).toHaveLength(1);
    expect(s.aiCalls.filter((c) => c.status === "ok")).toHaveLength(20);
  });

  it("does not count rows older than 24 hours, other users' rows, or error rows", async () => {
    const old = new Date(Date.now() - 25 * 3600_000).toISOString();
    const now = new Date().toISOString();
    const rows: MemoryAiCalls = [
      ...Array.from({ length: 25 }, () => ({ userId: "u", task: "enrich_voice", status: "ok" as const, createdAt: old })),
      ...Array.from({ length: 25 }, () => ({ userId: "other", task: "enrich_voice", status: "ok" as const, createdAt: now })),
      ...Array.from({ length: 25 }, () => ({ userId: "u", task: "enrich_voice", status: "error" as const, createdAt: now })),
    ];
    const repo = memoryInsightsRepo("u", new Map(), rows);
    for (let i = 0; i < 20; i++) expect(await repo.reserveVoiceSession("m", 20)).toBe(true);
    expect(await repo.reserveVoiceSession("m", 20)).toBe(false);
  });

  it("503 ai_unavailable when OpenAI fails; an error row is logged and the session stays used", async () => {
    const s = setup({ answer: () => new Response("x", { status: 500 }) });
    const res = await s.post();
    expect(res.status).toBe(503);
    expect(await code(res)).toBe("ai_unavailable");
    expect(s.calls[0]).toMatchObject({ task: "enrich_voice", status: "error" });
    expect(s.aiCalls.filter((c) => c.status === "ok")).toHaveLength(1);
  });
});

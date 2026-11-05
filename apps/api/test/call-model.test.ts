import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiOutputTooLongError, AiUnavailableError, callModel, providersFromEnv, type AiCallLog, type ModelDeps } from "../src/ai/call-model.ts";

const Answer = z.object({ answer: z.string() }).strict();

const providers: ModelDeps["providers"] = [
  { name: "openrouter", url: "https://openrouter.test/v1", apiKey: "or-key", model: "or-model" },
  { name: "openai", url: "https://openai.test/v1", apiKey: "oa-key", model: "oa-model" },
];

const SYSTEM = "SECRET SYSTEM PROMPT";
const USER = "Ștefan's private CV text";
const request = { userId: "u1", task: "test_task", schema: Answer, system: SYSTEM, user: USER, maxOutputTokens: 100 };

function ok(content: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
const status = (code: number) => new Response(JSON.stringify({ error: { message: `upstream ${code}` } }), { status: code });

/** A fetch that answers with the given responses in order, recording which URL was called. */
function fakeFetch(...responses: Array<Response | (() => Promise<Response>)>) {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      auth: new Headers(init?.headers).get("authorization"),
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return typeof next === "function" ? next() : next;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function deps(f: typeof fetch, extra: Partial<ModelDeps> = {}) {
  const logs: AiCallLog[] = [];
  const d: ModelDeps = { providers, fetch: f, logCall: async (e) => void logs.push(e), ...extra };
  return { d, logs };
}

describe("callModel", () => {
  it("returns parsed output", async () => {
    const { fetch, calls } = fakeFetch(ok({ answer: "yes" }));
    const { d, logs } = deps(fetch);
    await expect(callModel(d, request)).resolves.toEqual({ answer: "yes" });

    expect(calls[0]!.url).toBe("https://openrouter.test/v1/chat/completions");
    expect(calls[0]!.auth).toBe("Bearer or-key");
    expect(calls[0]!.body).toMatchObject({
      model: "or-model",
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { name: "test_task", strict: true } },
    });
    expect(logs).toEqual([
      expect.objectContaining({ userId: "u1", task: "test_task", provider: "openrouter", model: "or-model", status: "ok", inputTokens: 12, outputTokens: 3 }),
    ]);
  });

  it("asks OpenRouter not to store or train on the data", async () => {
    const { fetch, calls } = fakeFetch(ok({ answer: "yes" }));
    await callModel(deps(fetch).d, request);
    expect(calls[0]!.body).toMatchObject({
      max_tokens: 100,
      provider: { data_collection: "deny", zdr: true, require_parameters: true },
    });
  });

  it("uses OpenAI's own token-limit field, which its GPT-5 models require", async () => {
    const { fetch, calls } = fakeFetch(status(400), ok({ answer: "from openai" }));
    await expect(callModel(deps(fetch).d, request)).resolves.toEqual({ answer: "from openai" });
    expect(calls[1]!.body).toMatchObject({ max_completion_tokens: 100, store: false });
    expect(calls[1]!.body).not.toHaveProperty("max_tokens");
    expect(calls[1]!.body).not.toHaveProperty("provider");
  });

  it("retries once on 429 then succeeds", async () => {
    const { fetch, calls } = fakeFetch(status(429), ok({ answer: "second" }));
    const { d } = deps(fetch);
    await expect(callModel(d, request)).resolves.toEqual({ answer: "second" });
    expect(calls.map((c) => c.url)).toEqual([
      "https://openrouter.test/v1/chat/completions",
      "https://openrouter.test/v1/chat/completions",
    ]);
  });

  it("falls back to OpenAI", async () => {
    const { fetch, calls } = fakeFetch(status(500), status(503), ok({ answer: "from openai" }));
    const { d, logs } = deps(fetch);
    await expect(callModel(d, request)).resolves.toEqual({ answer: "from openai" });
    expect(calls[2]!.url).toBe("https://openai.test/v1/chat/completions");
    expect(calls[2]!.body.model).toBe("oa-model");
    expect(logs.map((l) => `${l.provider}:${l.status}`)).toEqual(["openrouter:error", "openrouter:error", "openai:ok"]);
  });

  it("treats schema-invalid output as a retry", async () => {
    const { fetch } = fakeFetch(ok({ wrong: 1 }), ok({ answer: "fixed" }));
    const { d } = deps(fetch);
    await expect(callModel(d, request)).resolves.toEqual({ answer: "fixed" });
  });

  it("treats non-JSON output as a retry", async () => {
    const { fetch } = fakeFetch(ok("not json at all"), ok({ answer: "fixed" }));
    const { d } = deps(fetch);
    await expect(callModel(d, request)).resolves.toEqual({ answer: "fixed" });
  });

  it("throws AiUnavailableError when all fail", async () => {
    const { fetch } = fakeFetch(status(500), status(500), status(500), status(500));
    const { d, logs } = deps(fetch);
    await expect(callModel(d, request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(logs).toHaveLength(4);
    expect(logs.every((l) => l.status === "error")).toBe(true);
  });

  it("does not retry 400", async () => {
    const { fetch, calls } = fakeFetch(status(400), ok({ answer: "openai" }));
    const { d } = deps(fetch);
    await expect(callModel(d, request)).resolves.toEqual({ answer: "openai" });
    expect(calls.map((c) => c.url)).toEqual([
      "https://openrouter.test/v1/chat/completions",
      "https://openai.test/v1/chat/completions",
    ]);
  });

  it("times out", async () => {
    const never = () =>
      new Promise<Response>(() => {
        /* never resolves */
      });
    const { fetch } = fakeFetch(never, ok({ answer: "after timeout" }));
    // A fetch that ignores the abort signal must still be given up on.
    const { d, logs } = deps(fetch, { timeoutMs: 20 });
    await expect(callModel(d, request)).resolves.toEqual({ answer: "after timeout" });
    expect(logs[0]).toMatchObject({ status: "error", error: expect.stringMatching(/timeout/i) });
  });

  it("logs never include the prompt or CV text", async () => {
    const { fetch } = fakeFetch(ok(`{"answer": ${JSON.stringify(USER)}, "x": 1}`), status(500), status(500), status(500));
    const { d, logs } = deps(fetch);
    await expect(callModel(d, request)).rejects.toBeInstanceOf(AiUnavailableError);
    for (const log of logs) {
      expect(JSON.stringify(log)).not.toContain(SYSTEM);
      expect(JSON.stringify(log)).not.toContain(USER);
    }
  });

  it("a failed log write does not fail the call", async () => {
    const { fetch } = fakeFetch(ok({ answer: "yes" }));
    const { d } = deps(fetch, { logCall: async () => Promise.reject(new Error("db down")) });
    await expect(callModel(d, request)).resolves.toEqual({ answer: "yes" });
  });
});

describe("callModel limits", () => {
  it("a cut-off answer is not retried", async () => {
    const cut = new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{\"answer\": \"trunc" } }] }), { status: 200 });
    const { fetch, calls } = fakeFetch(cut);
    const { d, logs } = deps(fetch);
    await expect(callModel(d, request)).rejects.toBeInstanceOf(AiOutputTooLongError);
    expect(calls).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: "error", error: expect.stringMatching(/length/) });
  });

  it("a per-request timeout overrides the default", async () => {
    const slow = () => new Promise<Response>((resolve) => setTimeout(() => resolve(ok({ answer: "slow but fine" })), 60));
    const { fetch } = fakeFetch(slow);
    const { d } = deps(fetch, { timeoutMs: 20 });
    await expect(callModel(d, { ...request, timeoutMs: 500 })).resolves.toEqual({ answer: "slow but fine" });
  });
});

describe("providersFromEnv", () => {
  it("skips a provider whose key is empty", () => {
    const list = providersFromEnv({ OPENROUTER_API_KEY: "", OPENROUTER_MODEL: "m1", OPENAI_API_KEY: "k", OPENAI_MODEL: "m2" });
    expect(list).toEqual([{ name: "openai", url: "https://api.openai.com/v1", apiKey: "k", model: "m2" }]);
  });
});

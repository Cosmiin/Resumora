import { describe, expect, it, vi } from "vitest";
import { AiUnavailableError, type AiCallLog, type ModelDeps } from "./call-model.ts";
import { AiStreamBrokenError, streamModel } from "./stream-model.ts";

const providers: ModelDeps["providers"] = [
  { name: "openrouter", url: "https://openrouter.test/v1", apiKey: "or-key", model: "or-model" },
  { name: "openai", url: "https://openai.test/v1", apiKey: "oa-key", model: "oa-model" },
];
const request = { userId: "u1", task: "enrich_rewrite_role", system: "SYS", user: "USER", maxOutputTokens: 100 };

const enc = new TextEncoder();
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const finish = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`;
const usage = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 5 } })}\n\n`;

/** An SSE response from the given pieces; `fail` makes the body error after the pieces. */
function sse(pieces: string[], opts: { fail?: boolean; hang?: boolean } = {}) {
  const queue = [...pieces];
  const body = new ReadableStream<Uint8Array>({
    // One piece per pull, so an error after the pieces is seen only once they were read.
    pull(controller) {
      const next = queue.shift();
      if (next !== undefined) controller.enqueue(enc.encode(next));
      else if (opts.fail) controller.error(new Error("connection reset"));
      else if (!opts.hang) controller.close();
      else return new Promise<void>(() => {});
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
const status = (code: number) => new Response("nope", { status: code });
const goodStream = (...texts: string[]) => sse([": keep-alive\n\n", ...texts.map(delta), finish, usage, "data: [DONE]\n\n"]);

function setup(...responses: Array<Response | (() => Response)>) {
  const calls: { url: string; body: Record<string, unknown>; signal?: AbortSignal | null }[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown>, signal: init?.signal });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return typeof next === "function" ? next() : next;
  });
  const logs: AiCallLog[] = [];
  const deps: ModelDeps = { providers, fetch: fetchFn as unknown as typeof fetch, logCall: async (e) => void logs.push(e) };
  return { deps, calls, logs };
}
async function collect(it: AsyncIterable<string>) {
  const out: string[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe("streamModel", () => {
  it("yields chunks in order and logs once with tokens", async () => {
    const { deps, calls, logs } = setup(goodStream("Hel", "lo ", "world"));
    expect(await collect(streamModel(deps, request))).toEqual(["Hel", "lo ", "world"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({ stream: true, max_tokens: 100, provider: { data_collection: "deny", zdr: true } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: "u1", task: "enrich_rewrite_role", provider: "openrouter", status: "ok", inputTokens: 12, outputTokens: 5 });
  });

  it("asks OpenAI for usage and keeps its privacy settings", async () => {
    const { deps, calls } = setup(status(500), goodStream("ok"));
    await collect(streamModel(deps, request));
    expect(calls[1]!.url).toBe("https://openai.test/v1/chat/completions");
    expect(calls[1]!.body).toMatchObject({ stream: true, stream_options: { include_usage: true }, store: false, max_completion_tokens: 100 });
  });

  it("falls back to the next provider when the first fails before any chunk", async () => {
    const { deps, calls, logs } = setup(status(500), goodStream("from second"));
    expect(await collect(streamModel(deps, request))).toEqual(["from second"]);
    expect(calls.map((c) => c.url)).toEqual(["https://openrouter.test/v1/chat/completions", "https://openai.test/v1/chat/completions"]);
    expect(logs.map((l) => [l.provider, l.status])).toEqual([["openrouter", "error"], ["openai", "ok"]]);
    expect(logs[0]!.error).toBe("HTTP 500");
  });

  it("throws AiStreamBrokenError after the first chunk and does not try the second provider", async () => {
    const { deps, calls, logs } = setup(sse([delta("half")], { fail: true }), goodStream("never"));
    const got: string[] = [];
    await expect(
      (async () => {
        for await (const c of streamModel(deps, request)) got.push(c);
      })(),
    ).rejects.toBeInstanceOf(AiStreamBrokenError);
    expect(got).toEqual(["half"]);
    expect(calls).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: "error" });
  });

  it("treats a stream that stops without finishing as broken", async () => {
    const { deps } = setup(sse([delta("half")]));
    await expect(collect(streamModel(deps, request))).rejects.toBeInstanceOf(AiStreamBrokenError);
  });

  it("treats a content_filter finish after the first chunk as broken", async () => {
    const filtered = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "content_filter" }] })}\n\n`;
    const { deps } = setup(sse([delta("half"), filtered, "data: [DONE]\n\n"]));
    await expect(collect(streamModel(deps, request))).rejects.toBeInstanceOf(AiStreamBrokenError);
  });

  it("throws AiUnavailableError when every provider fails before the first chunk", async () => {
    const { deps, logs } = setup(status(500), sse([": only a comment\n\n", "data: [DONE]\n\n"]));
    await expect(collect(streamModel(deps, request))).rejects.toBeInstanceOf(AiUnavailableError);
    expect(logs).toHaveLength(2);
  });

  it("gives up on a provider that sends nothing within the first-chunk timeout", async () => {
    const { deps } = setup(sse([], { hang: true }), goodStream("late answer"));
    expect(await collect(streamModel({ ...deps, timeoutMs: 30 }, request))).toEqual(["late answer"]);
  });

  it("stops and logs an aborted call when the signal fires", async () => {
    const controller = new AbortController();
    const { deps, calls, logs } = setup(sse([delta("one")], { hang: true }), goodStream("never"));
    const got: string[] = [];
    for await (const c of streamModel(deps, { ...request, signal: controller.signal })) {
      got.push(c);
      controller.abort();
    }
    expect(got).toEqual(["one"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.signal).toBeDefined();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: "error", error: "aborted" });
  });
});

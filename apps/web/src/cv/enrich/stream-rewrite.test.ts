import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RewriteEvent } from "@resumora/shared";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }));
vi.mock("../../lib/supabase.ts", () => ({ supabase: { auth } }));

import { streamRewrite } from "./enrich-api.ts";

const enc = new TextEncoder();

/** An event-stream response whose body arrives as these byte chunks, then closes (or breaks). */
function sse(chunks: (string | Uint8Array)[], fail = false) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(typeof ch === "string" ? enc.encode(ch) : ch);
      if (fail) c.error(new Error("connection reset"));
      else c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Runs one stream to its `done` or `error` event and returns every event it emitted. */
async function run(response: Response | (() => Response)) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => (typeof response === "function" ? response() : response));
  vi.stubGlobal("fetch", fetchMock);
  const events: RewriteEvent[] = [];
  let finish = () => {};
  const ended = new Promise<void>((r) => (finish = r));
  streamRewrite("/v1/enrich/rewrite-role", { roleId: "r1" }, (e) => {
    events.push(e);
    if (e.event === "done" || e.event === "error") finish();
  });
  await ended;
  return { events, fetchMock };
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } }, error: null });
  auth.refreshSession.mockResolvedValue({ data: { session: { access_token: "token-2" } }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

afterEach(() => vi.unstubAllGlobals());

describe("streamRewrite", () => {
  it("reads frames split across chunks, skips invalid ones, and sends the token", async () => {
    const { events, fetchMock } = await run(
      sse([
        'event: start\ndata: {"index":0,"replaces":"b1"}\n\nevent: del',
        'ta\ndata: {"index":0,"text":"Hi"}\n\n',
        'event: delta\ndata: {"index":"x"}\n\nevent: nonsense\ndata: {}\n\nevent: ready\ndata: not json\n\n',
        'event: ready\r\ndata: {"index":0,"text":"Hi there"}\r\n\r\nevent: done\ndata: {}\n\n',
      ]),
    );
    expect(events).toEqual([
      { event: "start", data: { index: 0, replaces: "b1" } },
      { event: "delta", data: { index: 0, text: "Hi" } },
      { event: "ready", data: { index: 0, text: "Hi there" } },
      { event: "done", data: {} },
    ]);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer token-1");
    expect(init.body).toBe(JSON.stringify({ roleId: "r1" }));
  });

  it("joins a multi-byte character split across chunks", async () => {
    const bytes = enc.encode('event: delta\ndata: {"index":0,"text":"Ședință €"}\n\nevent: done\ndata: {}\n\n');
    const cut = bytes.indexOf(0xc8) + 1; // inside "Ș", a two-byte character
    const { events } = await run(sse([bytes.slice(0, cut), bytes.slice(cut)]));
    expect(events[0]).toEqual({ event: "delta", data: { index: 0, text: "Ședință €" } });
  });

  it("joins multi-line data and skips comment lines", async () => {
    const { events } = await run(
      sse([': keep-alive\n\nevent: ready\n: a comment\ndata: {"index":0,\ndata: "text":"Two lines"}\n\nevent: done\ndata: {}\n\n']),
    );
    expect(events).toEqual([
      { event: "ready", data: { index: 0, text: "Two lines" } },
      { event: "done", data: {} },
    ]);
  });

  it("a reader error after the start becomes stream_broken", async () => {
    const { events } = await run(sse(['event: start\ndata: {"index":0,"replaces":null}\n\n'], true));
    expect(events.at(-1)).toEqual({ event: "error", data: { code: "stream_broken", message: expect.any(String) } });
  });

  it("a stream that ends without done becomes stream_broken", async () => {
    const { events } = await run(sse(['event: start\ndata: {"index":0,"replaces":null}\n\n']));
    expect(events.at(-1)?.event).toBe("error");
    expect(events.at(-1)?.data).toMatchObject({ code: "stream_broken" });
  });

  it("a JSON error before the stream maps to the server's code", async () => {
    const body = { error: { code: "not_saved", message: "Save first.", requestId: "req-1" } };
    const { events } = await run(new Response(JSON.stringify(body), { status: 409, headers: { "content-type": "application/json" } }));
    expect(events).toEqual([{ event: "error", data: { code: "not_saved", message: "Save first." } }]);
  });

  it("refreshes an expired token once, like every other call", async () => {
    let calls = 0;
    const { events, fetchMock } = await run(() => (++calls === 1 ? new Response(null, { status: 401 }) : sse(["event: done\ndata: {}\n\n"])));
    expect(events).toEqual([{ event: "done", data: {} }]);
    expect(new Headers(fetchMock.mock.calls[1]![1]!.headers).get("authorization")).toBe("Bearer token-2");
  });

  it("aborting is silent", async () => {
    let cancel = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('event: start\ndata: {"index":0,"replaces":null}\n\n'));
        cancel = () => c.error(new DOMException("aborted", "AbortError"));
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const events: RewriteEvent[] = [];
    const ctrl = streamRewrite("/v1/enrich/rewrite-role", { roleId: "r1" }, (e) => events.push(e));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    ctrl.abort();
    cancel();
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toHaveLength(1);
  });
});

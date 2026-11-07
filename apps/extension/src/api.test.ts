import { afterEach, describe, expect, it, vi } from "vitest";
import { postJob } from "./api";

const body = { url: "https://jobs.example.test/ad", pageText: "x".repeat(200) };
const deps = { apiUrl: "https://api.example.test", token: "test-token", body };
const errorBody = { error: { code: "job_limit", message: "Daily limit", requestId: "body-id" } };
afterEach(() => vi.useRealTimers());

describe("postJob", () => {
  it("saves with a fetch that requires a plain function call", async () => {
    const fetch = function (this: unknown) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify({ id: "j1" }), { status: 202 }));
    };
    expect(await postJob({ ...deps, fetch })).toEqual({ kind: "saved", id: "j1" });
  });

  it.each<[number, unknown, unknown]>([
    [202, { id: "job-id" }, { kind: "saved", id: "job-id" }],
    [200, { id: "job-id", existing: true }, { kind: "existing", id: "job-id" }],
    [401, null, { kind: "unauthorized" }],
    ...[400, 413, 429, 500].map((status): [number, unknown, unknown] => [status, errorBody, {
      kind: "failed", status, ...errorBody.error,
    }]),
  ])("maps HTTP %s", async (status, responseBody, expected) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(responseBody, { status: status as number }),
    );
    expect(await postJob({ ...deps, fetch })).toEqual(expected);
  });

  it("posts JSON with the bearer token to the jobs endpoint", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ id: "id" }, { status: 202 }));
    await postJob({ ...deps, fetch });
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/v1/jobs");
    expect(options).toMatchObject({ method: "POST", body: JSON.stringify(body) });
    expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer test-token");
    expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
  });

  it("prefers the body request id over the header", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(errorBody, {
      status: 500, headers: { "x-request-id": "header-id" },
    }));
    expect(await postJob({ ...deps, fetch })).toMatchObject({ requestId: "body-id" });
  });

  it("uses the header when the error body has no request id", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      error: { code: "job_limit", message: "Daily limit" },
    }, { status: 429, headers: { "x-request-id": "header-id" } }));
    expect(await postJob({ ...deps, fetch })).toEqual({
      kind: "failed", status: 429, code: "job_limit", message: "Daily limit", requestId: "header-id",
    });
  });

  it.each([null, "not JSON", JSON.stringify({ error: { code: 123 } })])(
    "uses the header request id without a valid error body: %s", async (body) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(body, {
        status: 502, headers: { "x-request-id": "header-id" },
      }));
      expect(await postJob({ ...deps, fetch })).toEqual({
        kind: "failed", status: 502, code: null, message: null, requestId: "header-id",
      });
    },
  );

  it.each([[200, { id: "id" }], [202, {}], [500, {}]])(
    "handles an unexpected response safely", async (status, body) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(body, { status }));
      expect(await postJob({ ...deps, fetch })).toEqual({
        kind: "failed", status, code: null, message: null, requestId: null,
      });
    },
  );

  it("maps a thrown fetch to network", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("Private network detail"));
    expect(await postJob({ ...deps, fetch })).toEqual({ kind: "network" });
  });

  it.each([undefined, 50])("aborts a fetch that never resolves after its timeout (%s)", async (timeoutMs) => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
    const result = postJob({ ...deps, fetch, timeoutMs });
    await vi.advanceTimersByTimeAsync(timeoutMs ?? 20_000);
    expect(await result).toEqual({ kind: "network" });
    expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

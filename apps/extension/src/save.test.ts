import { describe, expect, it, vi } from "vitest";
import type { Auth } from "./auth";
import { environmentsFrom, type EnvId } from "./environments";
import { createSaver } from "./save";

function setup(envId: EnvId = "local") {
  const env = environmentsFrom({
    VITE_HOSTED_API_URL: "https://api.resumora.test",
    VITE_HOSTED_WEB_URL: "https://resumora.test",
  })[envId];
  const read = { url: "https://jobs.example.test/ad?title=a&b=c", pageText: "x".repeat(300), jsonLd: [] as unknown[] };
  const activeTab = vi.fn(async () => ({ id: 7, url: "https://jobs.example.test/ad?title=a&b=c" }));
  const runReader = vi.fn(async () => read);
  const auth = {
    accessToken: vi.fn<Auth["accessToken"]>().mockResolvedValue({ token: "old-token" }),
    refresh: vi.fn<Auth["refresh"]>().mockResolvedValue("new-token"),
    signOut: vi.fn<Auth["signOut"]>().mockResolvedValue(undefined),
  };
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json({ id: "job-id" }, { status: 202 }));
  const saver = createSaver({ activeTab, runReader, auth, fetch, environment: async () => env });
  const sent = () => JSON.parse(fetch.mock.calls[0]![1]?.body as string);
  const couldntRead = { kind: "couldntRead", pasteUrl: `${env.webUrl}/jobs?add=${encodeURIComponent(read.url)}` };
  return { ...saver, activeTab, runReader, auth, fetch, env, read, sent, couldntRead };
}
const expired = { kind: "signedOut", message: "Your sign-in expired. Sign in again." };

describe("saveActiveTab", () => {
  it.each(["chrome://extensions", "file:///cv.pdf", "not a URL", ""])("cannot read %s", async (url) => {
    const s = setup();
    s.activeTab.mockResolvedValue({ id: 7, url });
    expect(await s.saveActiveTab()).toEqual({ kind: "cantRead" });
    expect(s.fetch).not.toHaveBeenCalled();
    expect(s.runReader).not.toHaveBeenCalled();
  });

  it("cannot read when there is no active tab", async () => {
    const s = setup();
    const saver = createSaver({ ...s, activeTab: async () => null, environment: async () => s.env });
    expect(await saver.saveActiveTab()).toEqual({ kind: "cantRead" });
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it("cannot read when injection fails", async () => {
    const s = setup();
    s.runReader.mockRejectedValue(new Error("Chrome denied access"));
    expect(await s.saveActiveTab()).toEqual({ kind: "cantRead" });
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it("offers the encoded paste URL for 199 trimmed characters without reading a token", async () => {
    const s = setup();
    s.read.pageText = `  ${"x".repeat(199)}  `;
    expect(await s.saveActiveTab()).toEqual(s.couldntRead);
    expect(s.fetch).not.toHaveBeenCalled();
    expect(s.auth.accessToken).not.toHaveBeenCalled();
  });

  it("caps text at 30,000 characters and JSON-LD at 20 items", async () => {
    const s = setup();
    s.read.pageText = "x".repeat(40_000);
    s.read.jsonLd = Array.from({ length: 25 }, (_, id) => ({ id }));
    await s.saveActiveTab();
    expect(s.sent().pageText).toBe("x".repeat(30_000));
    expect(s.sent().jsonLd).toEqual(s.read.jsonLd.slice(0, 20));
  });

  it("drops JSON-LD when capped Japanese text and JSON-LD exceed 100,000 bytes", async () => {
    const s = setup();
    s.read.pageText = "日".repeat(30_000);
    s.read.jsonLd = Array(20).fill({ text: "日".repeat(1000) });
    expect(await s.saveActiveTab()).toEqual({ kind: "saved", openUrl: `${s.env.webUrl}/jobs/job-id` });
    expect(s.sent()).not.toHaveProperty("jsonLd");
    expect(s.sent().pageText).toHaveLength(30_000);
  });

  it("rejects a body still over the byte limit without fetching", async () => {
    const s = setup();
    s.read.pageText = "\u0000".repeat(30_000);
    expect(await s.saveActiveTab()).toEqual({ kind: "error", message: "This page is too large to send.", requestId: null });
    expect(s.fetch).not.toHaveBeenCalled();
    expect(s.auth.accessToken).not.toHaveBeenCalled();
  });

  it("rejects a body that fails shared validation", async () => {
    const s = setup();
    s.read.url = "invalid";
    expect(await s.saveActiveTab()).toEqual({ kind: "error", message: "Something went wrong. Try again.", requestId: null });
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it.each<[number, unknown, unknown]>([
    [202, { id: "job-id" }, { kind: "saved", openUrl: "http://127.0.0.1:5173/jobs/job-id" }],
    [200, { id: "job-id", existing: true }, { kind: "existing", openUrl: "http://127.0.0.1:5173/jobs/job-id" }],
    ...([
      [400, "invalid_url", "This doesn't look like a job link."],
      [413, "payload_too_large", "This page is too large to send."],
      [429, "job_limit", "You can add up to 30 jobs per day."],
      [500, "unknown", "Something went wrong. Try again."],
    ] as const).map(([status, code, message]): [number, unknown, unknown] => [status, { error: { code, message, requestId: "req-id" } }, {
      kind: "error", message, requestId: code === "unknown" ? "req-id" : null,
    }]),
  ])("maps HTTP %s to the exact user result", async (status, body, expected) => {
    const s = setup();
    s.fetch.mockResolvedValueOnce(Response.json(body, { status: status as number }));
    expect(await s.saveActiveTab()).toEqual(expected);
  });

  it("offers paste when the API reports text_too_short", async () => {
    const s = setup();
    s.fetch.mockResolvedValueOnce(Response.json({ error: {
      code: "text_too_short", message: "Too short", requestId: "req-id",
    } }, { status: 400 }));
    expect(await s.saveActiveTab()).toEqual(s.couldntRead);
  });

  it("refreshes once after 401 and retries with the refreshed token", async () => {
    const s = setup();
    s.fetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(await s.saveActiveTab()).toEqual({ kind: "saved", openUrl: `${s.env.webUrl}/jobs/job-id` });
    expect(s.auth.refresh).toHaveBeenCalledExactlyOnceWith("local");
    expect(new Headers(s.fetch.mock.calls[1]![1]?.headers).get("Authorization")).toBe("Bearer new-token");
    expect(s.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["twice", "failed refresh", "thrown refresh"])("signs out after %s", async (failure) => {
    const s = setup("hosted");
    s.fetch.mockImplementation(async () => new Response(null, { status: 401 }));
    if (failure === "failed refresh") s.auth.refresh.mockResolvedValue(null);
    if (failure === "thrown refresh") s.auth.refresh.mockRejectedValue(new Error("Private details"));
    expect(await s.saveActiveTab()).toEqual(expired);
    expect(s.auth.signOut).toHaveBeenCalledExactlyOnceWith("hosted");
    expect(s.fetch).toHaveBeenCalledTimes(failure === "twice" ? 2 : 1);
  });

  it.each([
    [null, { kind: "signedOut", message: null }],
    [{ expired: true }, expired],
    [{ offline: true }, { kind: "error", message: "Can't reach Resumora. Is the app running?", requestId: null }],
  ] as const)("handles accessToken %s without fetching", async (access, expected) => {
    const s = setup();
    s.auth.accessToken.mockResolvedValue(access);
    expect(await s.saveActiveTab()).toEqual(expected);
    expect(s.fetch).not.toHaveBeenCalled();
    expect(s.auth.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ["local", "Can't reach Resumora. Is the app running?"],
    ["hosted", "Can't reach Resumora. Check your connection."],
  ] as const)("shows the %s network message and keeps the session", async (env, message) => {
    const s = setup(env);
    s.fetch.mockRejectedValue(new Error("Private details"));
    expect(await s.saveActiveTab()).toEqual({ kind: "error", message, requestId: null });
    expect(s.auth.signOut).not.toHaveBeenCalled();
  });

  it("starts a separate save after switching environments on the same tab", async () => {
    const s = setup();
    const hosted = setup("hosted").env;
    let environment = s.env;
    const saver = createSaver({ ...s, environment: async () => environment });
    let finish!: (response: Response) => void;
    s.fetch.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const localSave = saver.saveActiveTab();
    await vi.waitFor(() => expect(s.fetch).toHaveBeenCalledTimes(1));
    environment = hosted;
    const hostedSave = saver.saveActiveTab();
    try {
      await vi.waitFor(() => expect(s.fetch).toHaveBeenCalledTimes(2));
      expect(s.fetch.mock.calls[0]![0]).toBe("http://127.0.0.1:8788/v1/jobs");
      expect(s.fetch.mock.calls[1]![0]).toBe("https://api.resumora.test/v1/jobs");
      expect(await hostedSave).toEqual({ kind: "saved", openUrl: "https://resumora.test/jobs/job-id" });
    } finally {
      finish(Response.json({ id: "job-id" }, { status: 202 }));
      await localSave;
    }
  });

  it("joins an in-progress save, including a reopened popup, and reads again after completion", async () => {
    const s = setup();
    let finish!: (response: Response) => void;
    s.fetch.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const first = s.saveActiveTab();
    const second = s.saveActiveTab();
    await vi.waitFor(() => expect(s.fetch).toHaveBeenCalledTimes(1));
    const reopened = s.saveActiveTab();
    finish(Response.json({ id: "job-id" }, { status: 202 }));
    const results = await Promise.all([first, second, reopened]);
    expect(results[0]).toEqual({ kind: "saved", openUrl: `${s.env.webUrl}/jobs/job-id` });
    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
    expect(s.runReader).toHaveBeenCalledTimes(1);
    await s.saveActiveTab();
    expect(s.fetch).toHaveBeenCalledTimes(2);
    expect(s.runReader).toHaveBeenCalledTimes(2);
  });
});

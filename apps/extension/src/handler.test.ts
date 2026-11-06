import { describe, expect, it, vi } from "vitest";
import type { Auth } from "./auth";
import { environmentsFrom, type EnvId } from "./environments";
import { createHandler } from "./handler";
import { chromeStorage, memoryStorage } from "./storage";

function setup(hostedConfigured = false) {
  const storage = memoryStorage();
  const environments = environmentsFrom({});
  environments.hosted.configured = hostedConfigured;
  const emails = new Map<EnvId, string>();
  const auth = {
    email: vi.fn<Auth["email"]>(async (env) => emails.get(env) ?? null),
    signIn: vi.fn<Auth["signIn"]>(async (env, email) => {
      emails.set(env, email);
      return { ok: true, email };
    }),
    signOut: vi.fn<Auth["signOut"]>(async (env) => { emails.delete(env); }),
    accessToken: vi.fn<Auth["accessToken"]>(async () => null),
    refresh: vi.fn<Auth["refresh"]>(async () => null),
  };
  const saver = { saveActiveTab: vi.fn().mockResolvedValue({ kind: "saved", openUrl: "http://127.0.0.1:5173/jobs/id" }) };
  return { storage, auth, emails, saver, handler: createHandler({ storage, auth, environments, saver }) };
}

describe("popup message handler", () => {
  it("defaults to Local and lists environment availability", async () => {
    const { handler } = setup();
    expect(await handler({ type: "getState" })).toEqual({
      env: "local",
      email: null,
      environments: [
        { id: "local", label: "Local", configured: false },
        { id: "hosted", label: "Hosted", configured: false },
      ],
    });
  });

  it("defaults an unknown stored environment to Local", async () => {
    const { handler, storage } = setup();
    await storage.set("env", "unknown");
    expect(await handler({ type: "getState" })).toMatchObject({ env: "local" });
  });

  it("keeps Local when Hosted is not configured", async () => {
    const { handler, storage } = setup();
    expect(await handler({ type: "setEnvironment", env: "hosted" }))
      .toMatchObject({ env: "local", email: null });
    expect(await storage.get("env")).toBeNull();
  });

  it("switches to configured Hosted with its email and remembers the choice", async () => {
    const { handler, storage, emails } = setup(true);
    emails.set("local", "local@example.test");
    emails.set("hosted", "hosted@example.test");
    expect(await handler({ type: "setEnvironment", env: "hosted" }))
      .toMatchObject({ env: "hosted", email: "hosted@example.test" });
    expect(await storage.get("env")).toBe("hosted");
    expect(await handler({ type: "getState" }))
      .toMatchObject({ env: "hosted", email: "hosted@example.test" });
  });

  it("signs in on the stored environment and returns the updated state", async () => {
    const { handler, auth } = setup(true);
    await handler({ type: "setEnvironment", env: "hosted" });
    expect(await handler({ type: "signIn", email: "a@example.test", password: "test-password" }))
      .toMatchObject({ ok: true, state: { env: "hosted", email: "a@example.test" } });
    expect(auth.signIn).toHaveBeenCalledWith("hosted", "a@example.test", "test-password");
  });

  it("returns a sign-in failure without showing raw errors", async () => {
    const { handler, auth } = setup();
    auth.signIn.mockResolvedValue({ ok: false, message: "Wrong email or password." });
    expect(await handler({ type: "signIn", email: "a@example.test", password: "wrong" }))
      .toEqual({ ok: false, message: "Wrong email or password." });
  });

  it("signs out on the stored environment and returns no email", async () => {
    const { handler, auth, emails } = setup(true);
    emails.set("local", "local@example.test");
    emails.set("hosted", "hosted@example.test");
    await handler({ type: "setEnvironment", env: "hosted" });
    expect(await handler({ type: "signOut" })).toMatchObject({ env: "hosted", email: null });
    expect(auth.signOut).toHaveBeenCalledWith("hosted");
    expect(emails.get("local")).toBe("local@example.test");
  });

  it("returns the saver's result for saving", async () => {
    const { handler, saver } = setup();
    expect(await handler({ type: "saveActiveTab" })).toEqual({
      kind: "saved", openUrl: "http://127.0.0.1:5173/jobs/id",
    });
    expect(saver.saveActiveTab).toHaveBeenCalledTimes(1);
  });
});

describe("Chrome storage adapter", () => {
  it("reads, writes and removes strings in Chrome local storage", async () => {
    const values: Record<string, unknown> = { invalid: 123 };
    const chromeApi = { storage: { local: {
      get: async (key: string) => ({ [key]: values[key] }),
      set: async (items: Record<string, string>) => { Object.assign(values, items); },
      remove: async (key: string) => { delete values[key]; },
    } } };
    const storage = chromeStorage(chromeApi);
    expect(await storage.get("missing")).toBeNull();
    expect(await storage.get("invalid")).toBeNull();
    await storage.set("env", "hosted");
    expect(values.env).toBe("hosted");
    expect(await storage.get("env")).toBe("hosted");
    await storage.remove("env");
    expect(await storage.get("env")).toBeNull();
  });
});

describe("background messages", () => {
  it("queries the active tab and injects the reader in two calls before saving", async () => {
    vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: vi.fn() } }, storage: { local: {} } });
    try {
      const { createBackground } = await import("./background");
      const read = { url: "https://jobs.example.test/ad", pageText: "x".repeat(300), jsonLd: [] };
      const query = vi.fn(async () => [{ id: 7, url: read.url }]);
      const executeScript = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ result: read }]);
      const fetch = vi.fn<typeof globalThis.fetch>();
      const handler = createBackground({
        runtime: chrome.runtime,
        storage: { local: { get: async () => ({}) } },
        tabs: { query }, scripting: { executeScript },
      }, fetch);
      expect(await handler({ type: "saveActiveTab" })).toEqual({ kind: "signedOut", message: null });
      expect(query).toHaveBeenCalledExactlyOnceWith({ active: true, currentWindow: true });
      expect(executeScript).toHaveBeenNthCalledWith(1, { target: { tabId: 7 }, files: ["reader.js"] });
      expect(executeScript).toHaveBeenNthCalledWith(2, { target: { tabId: 7 }, func: expect.any(Function) });
      vi.stubGlobal("__resumoraReadPage", () => read);
      expect(executeScript.mock.calls[1]![0].func()).toEqual(read);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the response channel open and answers failures with safe copy", async () => {
    const addListener = vi.fn();
    vi.stubGlobal("chrome", { runtime: { onMessage: { addListener } }, storage: { local: {} } });
    try {
      const { registerMessages } = await import("./background");
      const handler = vi.fn().mockResolvedValue({ env: "local", email: null });
      registerMessages(chrome, handler);
      const listener = addListener.mock.lastCall![0];
      const sendResponse = vi.fn();
      expect(listener({ type: "getState" }, {}, sendResponse)).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ env: "local", email: null }));
      sendResponse.mockClear();
      handler.mockRejectedValueOnce(new Error("Private exception details"));
      expect(listener({ type: "getState" }, {}, sendResponse)).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({
        kind: "error", message: "Something went wrong. Try again.", requestId: null,
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

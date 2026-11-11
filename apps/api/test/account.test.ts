import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES, type Preferences } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import type { AccountRepo } from "../src/account/repo.ts";

const USERS: Record<string, string> = { "token-a": "user-a", "token-b": "user-b" };
let saved: Map<string, Preferences>;
let deleted: string[];
let app: ReturnType<typeof createApp>;

function repoFor(userId: string): AccountRepo {
  return {
    getPreferences: async () => saved.get(userId) ?? DEFAULT_PREFERENCES,
    savePreferences: async (patch) => {
      const next = { ...(saved.get(userId) ?? DEFAULT_PREFERENCES), ...patch };
      saved.set(userId, next);
      return next;
    },
    exportAll: async (now) => ({ exportedAt: now.toISOString(), userId, tables: { jobs: [{ id: `job-of-${userId}` }] }, files: [] }),
  };
}

beforeEach(() => {
  saved = new Map();
  deleted = [];
  const unused = () => {
    throw new Error("not used");
  };
  const deps: AppDeps = {
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (USERS[token] ? { id: USERS[token], token } : null),
    cvRepo: unused, importRepo: unused, jobRepo: unused, insightsRepo: unused, model: unused,
    account: { repo: (user) => repoFor(user.id), admin: () => ({ deleteUser: async (id) => void deleted.push(id) }) },
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
    now: () => new Date("2026-11-11T09:00:00Z"),
    log: vi.fn(),
  };
  app = createApp(deps);
});

const call = (path: string, init: RequestInit = {}, token = "token-a") =>
  app.request(`/v1/account${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } });

describe("account preferences", () => {
  it("returns the defaults before anything is saved", async () => {
    const res = await call("/preferences");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULT_PREFERENCES);
  });

  it("saves a subset and keeps the rest", async () => {
    const res = await call("/preferences", { method: "PATCH", body: JSON.stringify({ defaultTemplate: "modern" }) });
    expect(await res.json()).toEqual({ ...DEFAULT_PREFERENCES, defaultTemplate: "modern" });
    const again = await call("/preferences", { method: "PATCH", body: JSON.stringify({ displayName: "  Ana Popescu " }) });
    expect(await again.json()).toEqual({ displayName: "Ana Popescu", defaultTemplate: "modern", tailoringLanguage: "job" });
  });

  it("stores an empty name as no name", async () => {
    const res = await call("/preferences", { method: "PATCH", body: JSON.stringify({ displayName: "   " }) });
    expect(await res.json()).toMatchObject({ displayName: null });
  });

  it.each([
    ["an unknown template", { defaultTemplate: "fancy" }],
    ["an unknown language", { tailoringLanguage: "xx" }],
    ["an unknown field", { isAdmin: true }],
    ["nothing", {}],
  ])("rejects %s", async (_name, body) => {
    const res = await call("/preferences", { method: "PATCH", body: JSON.stringify(body) });
    expect(res.status).toBe(400);
    expect(saved.size).toBe(0);
  });

  it("keeps each user's preferences apart", async () => {
    await call("/preferences", { method: "PATCH", body: JSON.stringify({ tailoringLanguage: "ro" }) });
    expect(await (await call("/preferences", {}, "token-b")).json()).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("account export", () => {
  it("downloads the caller's data as a dated file", async () => {
    const res = await call("/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="resumora-data-2026-11-11.json"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ exportedAt: "2026-11-11T09:00:00.000Z", userId: "user-a", tables: { jobs: [{ id: "job-of-user-a" }] }, files: [] });
  });
});

describe("account deletion", () => {
  it("deletes the signed-in user and nobody else", async () => {
    const res = await call("", { method: "DELETE", body: JSON.stringify({ userId: "user-b" }) }, "token-a");
    expect(res.status).toBe(204);
    expect(deleted).toEqual(["user-a"]);
  });

  it("needs a valid token", async () => {
    const res = await call("", { method: "DELETE" }, "nope");
    expect(res.status).toBe(401);
    expect(deleted).toEqual([]);
  });
});

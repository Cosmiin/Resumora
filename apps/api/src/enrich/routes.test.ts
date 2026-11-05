import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleResultSchema, emptyCv, fingerprint } from "@resumora/shared";
import { createApp } from "../app.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { memoryInsightsRepo, type MemoryInsightsStore } from "./memory-repo.ts";
import { allSpecific, fakeModel, roleWith } from "./fake-model.ts";

const auth = { authorization: "Bearer good", "content-type": "application/json" };
const role = roleWith(["Prepared employment contracts for temporary workers."]);
const fp = fingerprint(role, "en");

let store: MemoryInsightsStore;
let model: ReturnType<typeof fakeModel>;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  store = new Map();
  model = fakeModel(() => allSpecific(role));
  const cv = memoryCvRepo();
  await cv.save({ ...emptyCv("en"), experience: [role] }, 0);
  app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "good" ? { id: "user-1", token } : null),
    cvRepo: () => cv,
    importRepo: () => {
      throw new Error("not used");
    },
    insightsRepo: (user) => memoryInsightsRepo(user.id, store),
    model: () => model.deps,
    queue: { send: async () => {} },
    log: vi.fn(),
  });
});

const score = (body: unknown) => app.request("/v1/enrich/score", { method: "POST", headers: auth, body: JSON.stringify(body) });
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("/v1/enrich", () => {
  it("needs sign-in", async () => {
    expect((await app.request("/v1/enrich/scores")).status).toBe(401);
  });

  it("POST /rewrite-role returns 404", async () => {
    const res = await app.request("/v1/enrich/rewrite-role", {
      method: "POST", headers: auth, body: JSON.stringify({ roleId: role.id }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /score returns a result and GET /scores lists it", async () => {
    const res = await score({ roleId: role.id, fingerprint: fp });
    expect(res.status).toBe(200);
    const result = RoleResultSchema.parse(await res.json());
    const list = (await (await app.request("/v1/enrich/scores", { headers: auth })).json()) as { items: unknown[] };
    expect(list.items).toEqual([result]);
  });

  it("GET /scores is scoped to the signed-in user", async () => {
    await score({ roleId: role.id, fingerprint: fp });
    expect(await memoryInsightsRepo("user-1", store).list()).toHaveLength(1);
    expect(await memoryInsightsRepo("user-2", store).list()).toEqual([]);
    const app2 = createApp({
      appOrigin: "http://127.0.0.1:5173",
      verifyToken: async (token) => (token === "other" ? { id: "user-2", token } : null),
      cvRepo: () => memoryCvRepo(),
      importRepo: () => {
        throw new Error("not used");
      },
      insightsRepo: (user) => memoryInsightsRepo(user.id, store),
      model: () => model.deps,
      queue: { send: async () => {} },
      log: vi.fn(),
    });
    const res = await app2.request("/v1/enrich/scores", { headers: { authorization: "Bearer other" } });
    expect(await res.json()).toEqual({ items: [] });
  });

  it("409 not_saved for a stale fingerprint", async () => {
    const res = await score({ roleId: role.id, fingerprint: "old" });
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("not_saved");
    expect(model.requests).toHaveLength(0);
  });

  it("502 ai_bad_answer when the model skips a bullet, and nothing is stored", async () => {
    model = fakeModel(() => ({ bullets: [], nextStepId: null }));
    const res = await score({ roleId: role.id, fingerprint: fp });
    expect(res.status).toBe(502);
    expect(await code(res)).toBe("ai_bad_answer");
    expect(store.size).toBe(0);
  });

  it("503 when the AI is unavailable", async () => {
    model = fakeModel(() => ({}), 500);
    expect((await score({ roleId: role.id, fingerprint: fp })).status).toBe(503);
  });

  it("POST /skills returns checked suggestions and needs sign-in", async () => {
    expect((await app.request("/v1/enrich/skills", { method: "POST" })).status).toBe(401);
    model = fakeModel(() => ({
      suggestions: [
        { name: "payroll", group: "professionalSkills", evidence: "Payroll for 40 staff" },
        { name: "Python", group: "technicalSkills", evidence: "Payroll for 40 staff" },
      ],
      sort: [],
    }));
    const res = await app.request("/v1/enrich/skills", { method: "POST", headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [{ name: "payroll", group: "professionalSkills", evidence: "Payroll for 40 staff" }], sort: [] });
  });

  it("413 content_too_large for a 20 KB body, before any repo or model call", async () => {
    const big = JSON.stringify({ roleId: role.id, fingerprint: fp, pad: "x".repeat(20 * 1024) });
    const declared = await app.request("/v1/enrich/score", {
      method: "POST",
      headers: { ...auth, "content-length": String(big.length) },
      body: big,
    });
    expect(declared.status).toBe(413);
    expect(await code(declared)).toBe("content_too_large");
    const streamed = await app.request("/v1/enrich/rewrite-summary", { method: "POST", headers: auth, body: big });
    expect(streamed.status).toBe(413);
    expect(model.requests).toHaveLength(0);
    expect(store.size).toBe(0);
  });

  it("400 for a malformed body", async () => {
    expect((await score({ roleId: 5 })).status).toBe(400);
  });
});

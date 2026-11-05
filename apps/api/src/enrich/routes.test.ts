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

  it("400 for a malformed body", async () => {
    expect((await score({ roleId: 5 })).status).toBe(400);
  });
});

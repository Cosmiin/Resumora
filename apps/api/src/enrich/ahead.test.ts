import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompaniesAnswerSchema, RoleResultSchema, ToolsAnswerSchema, emptyCv, fingerprint, type Experience } from "@resumora/shared";
import { createApp } from "../app.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { memoryImports } from "../imports/memory-repo.ts";
import { memoryInsightsRepo, type MemoryInsightsStore } from "./memory-repo.ts";
import { allSpecific, fakeModel, roleWith } from "./fake-model.ts";

/** An import that is read but not used yet: its roles are scored ahead, so the questions are ready when it is used. */

const saved = roleWith(["Prepared employment contracts for temporary workers."]);
const found = roleWith(["Ran payroll in SAP for 40 staff."], { company: "Robert Half", title: "Payroll Lead" });
const fp = (r: Experience) => fingerprint(r, "en");
const IMPORT_ID = "2f1c6c1e-6a34-4b6e-9a53-0f6f0a3b9d11";
const OTHER_ID = "7a0f2f7e-1f0c-4c59-8f7c-3a1d8a2f5b22";
const headers = (token = "user-1") => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

let store: MemoryInsightsStore;
let model: ReturnType<typeof fakeModel>;
let answer: () => unknown;
let imports: ReturnType<typeof memoryImports>;
let app: ReturnType<typeof createApp>;
const cvs = new Map<string, ReturnType<typeof memoryCvRepo>>();
const cvOf = (userId: string) => cvs.get(userId) ?? cvs.set(userId, memoryCvRepo()).get(userId)!;

async function upload(userId: string, id: string, ready = true) {
  await imports.repoFor(userId).create({ id, fileName: "cv.pdf", format: "pdf", bytes: new Uint8Array([1]) });
  if (ready) {
    await imports.admin.start(id);
    await imports.admin.finish(id, { content: { ...emptyCv("en"), experience: [found] }, warnings: [], sourceHeadings: [], unsourcedLines: [], isScan: false });
  }
}

beforeEach(async () => {
  cvs.clear();
  store = new Map();
  answer = () => allSpecific(found);
  model = fakeModel(() => answer());
  vi.spyOn(console, "error").mockImplementation(() => {});
  imports = memoryImports({ cvRepo: cvOf });
  await cvOf("user-1").save({ ...emptyCv("en"), experience: [saved] }, 0);
  app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token.startsWith("user-") ? { id: token, token } : null),
    cvRepo: (user) => cvOf(user.id),
    importRepo: (user) => imports.repoFor(user.id),
    jobRepo: () => { throw new Error("not used"); },
    insightsRepo: (user) => memoryInsightsRepo(user.id, store),
    model: () => model.deps,
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
    log: vi.fn(),
  });
  await upload("user-1", IMPORT_ID);
});

const post = (path: string, body: unknown, token?: string) =>
  app.request(`/v1/enrich/${path}`, { method: "POST", headers: headers(token), body: JSON.stringify(body) });
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("POST /v1/enrich/score with an importId", () => {
  it("scores a role of the import and keeps the scores of the saved CV", async () => {
    answer = () => allSpecific(saved);
    expect((await post("score", { roleId: saved.id, fingerprint: fp(saved) })).status).toBe(200);
    answer = () => allSpecific(found);
    const calls = model.requests.length;
    const res = await post("score", { roleId: found.id, fingerprint: fp(found), importId: IMPORT_ID });
    expect(res.status).toBe(200);
    expect(RoleResultSchema.parse(await res.json())).toMatchObject({ roleId: found.id, fingerprint: fp(found) });
    expect(model.requests).toHaveLength(calls + 1);
    const list = (await (await app.request("/v1/enrich/scores", { headers: headers() })).json()) as { items: { roleId: string }[] };
    expect(list.items.map((i) => i.roleId).sort()).toEqual([saved.id, found.id].sort());
  });

  it("once the import is used, the same role is answered from the stored result, with no model call", async () => {
    expect((await post("score", { roleId: found.id, fingerprint: fp(found), importId: IMPORT_ID })).status).toBe(200);
    const calls = model.requests.length;
    const applied = await app.request(`/v1/imports/${IMPORT_ID}/apply`, { method: "POST", headers: headers(), body: JSON.stringify({ version: 1 }) });
    expect(applied.status).toBe(200);
    const res = await post("score", { roleId: found.id, fingerprint: fp(found) });
    expect(res.status).toBe(200);
    expect(model.requests).toHaveLength(calls);
  });

  it("409 not_saved, with no model call, for an import that is not ready, is someone else's, or does not exist", async () => {
    await upload("user-1", OTHER_ID, false);
    const body = { roleId: found.id, fingerprint: fp(found) };
    for (const res of [
      await post("score", { ...body, importId: OTHER_ID }),
      await post("score", { ...body, importId: IMPORT_ID }, "user-2"),
      await post("score", { ...body, importId: "0b0e6a3c-5a4f-4f0e-8a44-6f2c1d9e7c33" }),
    ]) {
      expect(res.status).toBe(409);
      expect(await code(res)).toBe("not_saved");
    }
    expect(model.requests).toHaveLength(0);
  });

  it("409 not_saved for a role or a fingerprint the import does not have", async () => {
    expect((await post("score", { roleId: saved.id, fingerprint: fp(saved), importId: IMPORT_ID })).status).toBe(409);
    expect((await post("score", { roleId: found.id, fingerprint: "other", importId: IMPORT_ID })).status).toBe(409);
    expect(model.requests).toHaveLength(0);
  });

  it("400 for an importId that is not an id", async () => {
    expect((await post("score", { roleId: found.id, fingerprint: fp(found), importId: "nope" })).status).toBe(400);
  });
});

describe("POST /v1/enrich/companies and /tools with an importId", () => {
  it("companies reads the import's companies, not the saved CV's", async () => {
    answer = () => ({ companies: [{ key: "robert half", proposal: "Staffing and recruitment firm." }] });
    const res = await post("companies", { importId: IMPORT_ID });
    expect(res.status).toBe(200);
    expect(CompaniesAnswerSchema.parse(await res.json()).companies).toEqual([{ key: "robert half", proposal: "Staffing and recruitment firm." }]);
    const sent = JSON.stringify(model.requests[0]?.messages);
    expect(sent).toContain("Robert Half");
    expect(sent).not.toContain("Acme Payroll");
  });

  it("tools reads the import's roles", async () => {
    answer = () => ({ roles: [{ roleId: found.id, tools: ["SAP"] }, { roleId: saved.id, tools: ["Excel"] }] });
    const res = await post("tools", { importId: IMPORT_ID });
    expect(res.status).toBe(200);
    expect(ToolsAnswerSchema.parse(await res.json()).roles).toEqual([{ roleId: found.id, tools: ["SAP"] }]);
  });

  it("409 not_saved for an import that cannot be read, 400 for a bad id, and the saved CV without one", async () => {
    expect((await post("companies", { importId: IMPORT_ID }, "user-2")).status).toBe(409);
    expect((await post("tools", { importId: "nope" })).status).toBe(400);
    expect(model.requests).toHaveLength(0);
    answer = () => ({ companies: [{ key: "acme payroll", proposal: null }] });
    expect(CompaniesAnswerSchema.parse(await (await post("companies", {})).json()).companies).toEqual([{ key: "acme payroll", proposal: null }]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleFactsAnswerSchema, emptyCv, hashText, type Experience } from "@resumora/shared";
import { createApp } from "../app.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";

const headers = { authorization: "Bearer user-a", "content-type": "application/json" };
let role: Experience;
let cv: ReturnType<typeof memoryCvRepo>;
let model: ReturnType<typeof fakeModel>;
let app: ReturnType<typeof createApp>;
let log: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
const post = (body: unknown = { roleId: role.id }, auth = headers) =>
  app.request("/v1/enrich/role-facts", { method: "POST", headers: auth, body: JSON.stringify(body) });
const result = async () => {
  const res = await post();
  expect(res.status).toBe(200);
  return RoleFactsAnswerSchema.parse(await res.json());
};
const save = async () => cv.save({ ...emptyCv("en"), experience: [role] }, (await cv.get()).version);

beforeEach(async () => {
  role = roleWith(["Prepared payroll for 40 staff."], {
    notes: [
      { id: "n1", question: "For 999 people?", answer: "For 75 staff using Sage.", via: ["type"], askedAt: "2026-11-05T10:00:00.000Z" },
      { id: "n2", question: "Which work?", answer: "Checked contracts.", via: ["type"], askedAt: "2026-11-05T11:00:00.000Z" },
    ],
  });
  cv = memoryCvRepo();
  await save();
  model = fakeModel(() => ({ facts: ["Payroll for 75 staff using Sage.", "Checked contracts."] }));
  log = vi.fn();
  vi.spyOn(console, "error").mockImplementation(log);
  const otherCv = memoryCvRepo();
  app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => ["user-a", "user-b"].includes(token) ? { id: token, token } : null,
    cvRepo: (user) => user.id === "user-a" ? cv : otherCv,
    insightsRepo: (user) => memoryInsightsRepo(user.id),
    model: () => model.deps,
    importRepo: () => { throw new Error("not used"); },
    jobRepo: () => {
      throw new Error("job repo not used in these tests");
    },
    jobQueue: { send: async () => {} },
    queue: { send: async () => {} }, log,
  });
});

afterEach(() => vi.restoreAllMocks());

describe("POST /v1/enrich/role-facts", () => {
  it("returns facts and their notes hash, logs the call and leaves the saved CV unchanged", async () => {
    const saved = await cv.get();
    const history = await cv.listHistory();
    expect(await result()).toEqual({
      facts: ["Payroll for 75 staff using Sage.", "Checked contracts."],
      fromNotes: hashText("n1\u0000For 75 staff using Sage.\u0001n2\u0000Checked contracts."),
    });
    expect(await cv.get()).toEqual(saved);
    expect(await cv.listHistory()).toEqual(history);
    expect(model.logged).toMatchObject([{ task: "enrich_role_facts", userId: "user-a", status: "ok" }]);
  });

  it("accepts up to eight facts", async () => {
    const facts = Array(8).fill("Checked contracts.");
    model = fakeModel(() => ({ facts }));
    expect((await result()).facts).toEqual(facts);
    expect(model.requests).toHaveLength(1);
  });

  it("drops numbers from outside note answers and facts longer than 160 characters", async () => {
    model = fakeModel(() => ({ facts: [
      "Payroll for 999 people.", "Payroll for 40 staff.", "Payroll for 888 staff.", "Payroll for 75 staff.", "a".repeat(160), "b".repeat(161),
    ] }));
    expect((await result()).facts).toEqual(["Payroll for 75 staff.", "a".repeat(160)]);
  });

  it("returns an empty hash without calling the model when there are no notes", async () => {
    role.notes = [];
    await save();
    expect(await result()).toEqual({ facts: [], fromNotes: hashText("") });
    expect(model.requests).toHaveLength(0);
    expect(model.logged).toHaveLength(0);
  });

  it("changes fromNotes when a saved answer changes", async () => {
    const before = await result();
    role.notes[0]!.answer = "For 80 staff using Sage.";
    await save();
    expect((await result()).fromNotes).not.toBe(before.fromNotes);
  });

  it("returns 404 when the saved role is missing", async () => {
    const res = await post({ roleId: "missing" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "role_not_found", requestId: expect.any(String) } });
    expect(model.requests).toHaveLength(0);
  });

  it("requires sign-in and reads only the caller's saved CV", async () => {
    expect((await post({ roleId: role.id }, { ...headers, authorization: "" })).status).toBe(401);
    expect((await post({ roleId: role.id }, { ...headers, authorization: "Bearer user-b" })).status).toBe(404);
    expect(model.requests).toHaveLength(0);
  });

  it.each([{}, null, { roleId: "" }, { roleId: 5 }])("validates the request: %j", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(model.requests).toHaveLength(0);
  });

  it.each([500, 200])("maps provider or repeated schema failures to 503: %s", async (status) => {
    model = fakeModel(() => ({ facts: Array(9).fill("Checked contracts.") }), status);
    const res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "ai_unavailable", requestId: expect.any(String) } });
    expect(model.logged).toHaveLength(2);
    expect(log).toHaveBeenCalledWith(JSON.stringify({ msg: "role facts failed", code: "ai_unavailable", requestId: res.headers.get("x-request-id") }));
  });

  it("maps a length cut-off to 502", async () => {
    model.deps.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "" } }] }));
    const res = await post();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: "ai_bad_answer" } });
    expect(model.logged).toHaveLength(1);
  });

  it("sends only notes as facts sources with the CV locale and length rules", async () => {
    const saved = await cv.get();
    await cv.save({ ...saved.content, locale: "ro" }, saved.version);
    await result();
    const messages = model.requests[0]!.messages as { content: string }[];
    for (const text of ["CV locale: ro", "160", "8", "untrusted", "only what the person said"])
      expect(messages[0]!.content).toContain(text);
    for (const n of role.notes) expect(messages[1]!.content).toContain(n.answer);
    expect(messages[1]!.content).not.toContain(role.description);
    expect(messages[1]!.content).not.toContain(role.bullets[0]!.text);
  });
});

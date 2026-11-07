import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAIN_DUMP_QUESTION, BrainDumpAnswerSchema, buildRoleResult, emptyCv, fingerprint, type Experience, type ModelScore } from "@resumora/shared";
import { createApp } from "../app.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { allSpecific, fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";

const headers = { authorization: "Bearer user-a", "content-type": "application/json" };
const texts = ["Prepared payroll files.", "Checked employment contracts.", "Updated staff records.", "Answered staff questions."];
const note = (answer = "Prepared payroll for 75 staff using Sage.", askedAt = "2026-11-05T10:00:00.000Z") =>
  ({ id: crypto.randomUUID(), question: BRAIN_DUMP_QUESTION, answer, via: ["type" as const], askedAt });
let role: Experience;
let cv: ReturnType<typeof memoryCvRepo>;
let insights: ReturnType<typeof memoryInsightsRepo>;
let model: ReturnType<typeof fakeModel>;
let app: ReturnType<typeof createApp>;
let initial: ModelScore;
let gradeChange: (b: ModelScore["bullets"][number], i: number) => void;
let log: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

const input = () => ({ roleId: role.id, fingerprint: fingerprint(role, "en") });
const post = (body: unknown = input(), auth = headers) =>
  app.request("/v1/enrich/brain-dump", { method: "POST", headers: auth, body: JSON.stringify(body) });
const result = async () => {
  const res = await post();
  expect(res.status).toBe(200);
  return BrainDumpAnswerSchema.parse(await res.json());
};

async function save(cache = true) {
  initial = allSpecific(role);
  await cv.save({ ...emptyCv("en"), experience: [role] }, (await cv.get()).version);
  if (cache) await insights.put(role.id, buildRoleResult(role, initial, fingerprint(role, "en")));
}

function answer(bullets: string[]) {
  let calls = 0;
  model = fakeModel(() => {
    if (calls++ === 0) return { bullets };
    const request = JSON.stringify(model.requests.at(-1)?.messages);
    const added = [1, 2, 3, 4].filter((n) => request.includes(`new${n}`))
      .map((n) => ({ id: `new${n}`, text: `Proposal ${n}` }));
    return allSpecific({ ...role, bullets: added }, gradeChange);
  });
}

beforeEach(async () => {
  role = roleWith(["Managed the payroll office."], { notes: [note()] });
  cv = memoryCvRepo();
  insights = memoryInsightsRepo("user-a");
  gradeChange = () => {};
  log = vi.fn();
  vi.spyOn(console, "error").mockImplementation(log);
  await save();
  answer(texts);
  const otherCv = memoryCvRepo();
  app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => ["user-a", "user-b"].includes(token) ? { id: token, token } : null,
    cvRepo: (user) => user.id === "user-a" ? cv : otherCv,
    insightsRepo: () => insights,
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

describe("POST /v1/enrich/brain-dump", () => {
  it("returns up to four scored proposals, drops grades below 40, and predicts only kept bullets", async () => {
    gradeChange = (b, i) => {
      if (i === 0) Object.assign(b, { contribution: "missing", clarity: "missing", specificity: "missing", impact: "missing", issue: "contribution" });
      if (i === 1) Object.assign(b, { contribution: "missing", clarity: "missing", issue: "contribution" });
    };
    const saved = await cv.get();
    expect(await result()).toEqual({
      proposals: texts.slice(1).map((text, i) => ({ id: `new${i + 2}`, text, score: i === 0 ? 40 : 100 })),
      roleBefore: 100, roleAfterAll: 85,
    });
    expect(model.logged.map((entry) => entry.task)).toEqual(["enrich_brain_dump", "enrich_score"]);
    expect(model.logged.every((entry) => entry.userId === "user-a")).toBe(true);
    expect(await cv.get()).toEqual(saved);
    expect(await insights.pending(role.id)).toEqual([]);
  });

  it("copies the saved CV once before the first model call", async () => {
    await insights.remove([role.id]);
    const snapshot = vi.spyOn(cv, "snapshot");
    const added = { ...role, bullets: [{ id: "new1", text: texts[0]! }] };
    const answers = [initial, { bullets: [texts[0]] }, allSpecific(added)];
    model = fakeModel(() => {
      expect(snapshot).toHaveBeenCalledExactlyOnceWith("ai");
      return answers.shift();
    });
    const saved = await cv.get();
    await result();
    expect(snapshot).toHaveBeenCalledExactlyOnceWith("ai");
    const history = await cv.listHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.reason).toBe("ai");
    expect((await cv.getHistory(history[0]!.id))?.content).toEqual(saved.content);
  });

  it("keeps four proposals when all pass", async () => {
    expect((await result()).proposals).toEqual(texts.map((text, i) => ({ id: `new${i + 1}`, text, score: 100 })));
    expect(model.requests).toHaveLength(2);
  });

  it("skips saved new1 and new3 ids and grades unique proposals", async () => {
    role.bullets = [
      { id: "new1", text: "Managed the payroll office." },
      { id: "new3", text: "Organised office meetings." },
    ];
    await save();
    const proposed = [
      { id: "new2", text: texts[0]! }, { id: "new4", text: texts[1]! },
      { id: "new5", text: texts[2]! }, { id: "new6", text: texts[3]! },
    ];
    const answers = [{ bullets: texts }, allSpecific({ ...role, bullets: proposed })];
    model = fakeModel(() => answers.shift());

    const got = await result();
    expect(got.proposals).toEqual(proposed.map((b) => ({ ...b, score: 100 })));
    expect(got.roleAfterAll).toBe(100);
    expect(new Set(got.proposals.map((b) => b.id)).size).toBe(4);
    expect(got.proposals.every((b) => role.bullets.every((saved) => saved.id !== b.id))).toBe(true);
  });

  it("drops invented numbers and keeps a number from the saved ramble", async () => {
    answer(["Prepared payroll for 999 staff.", "Prepared payroll for 75 staff using Sage."]);
    expect((await result()).proposals).toEqual([{ id: "new1", text: "Prepared payroll for 75 staff using Sage.", score: 100 }]);
  });

  it("drops repeats of existing and earlier proposed bullets", async () => {
    answer(["  MANAGED   the payroll office. ", texts[0]!, "PREPARED  payroll files."]);
    expect((await result()).proposals).toEqual([{ id: "new1", text: texts[0], score: 100 }]);
  });

  it("squashes whitespace before checking length and returning text", async () => {
    const text = `Prepared ${"a".repeat(192)}`;
    answer([`  Prepared${" ".repeat(32)}${"a".repeat(192)}  `, "Prepared " + "a".repeat(220), "   "]);
    expect((await result()).proposals).toEqual([{ id: "new1", text, score: 100 }]);
  });

  it("skips grading when no proposals pass", async () => {
    answer(["Prepared payroll for 999 staff."]);
    expect(await result()).toEqual({ proposals: [], roleBefore: 100, roleAfterAll: 100 });
    expect(model.requests).toHaveLength(1);
  });

  it("keeps the role score when a stored semantic duplicate remains and all proposals grade below 40", async () => {
    role.bullets = roleWith(["Managed the payroll office.", "Oversaw the payroll department."]).bullets;
    await save();
    initial.bullets[1]!.issue = "duplicate";
    initial.bullets[1]!.duplicateOf = role.bullets[0]!.id;
    await insights.put(role.id, buildRoleResult(role, initial, fingerprint(role, "en")));
    gradeChange = (b) => { b.meaningful = false; };

    expect(await result()).toEqual({ proposals: [], roleBefore: 50, roleAfterAll: 50 });
    expect(model.requests).toHaveLength(2);
  });
  it("builds first bullets from role answers without a ramble", async () => {
    role.bullets = [];
    role.notes = [
      { ...note("Excel and SAP"), question: "Which tools did you use?" },
      { ...note("The finance team"), question: "Who did you work with?" },
    ];
    await save(false);
    const res = await post({ ...input(), source: "answers" });
    expect(res.status).toBe(200);
    expect(BrainDumpAnswerSchema.parse(await res.json()).proposals).toHaveLength(4);
    const messages = model.requests[0]!.messages as { content: string }[];
    expect(messages[1]!.content).toContain("Q: Which tools did you use? A: Excel and SAP");
    expect(messages[1]!.content).toContain("Q: Who did you work with? A: The finance team");
    expect(model.logged.map((entry) => entry.task)).toEqual(["enrich_brain_dump", "enrich_score"]);
  });

  it.each([{ notes: [] }, { notes: [note()] }])("requires role answers for source answers: %j", async ({ notes }) => {
    role.notes = notes;
    await save();
    const snapshot = vi.spyOn(cv, "snapshot");
    const res = await post({ ...input(), source: "answers" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "no_answers", requestId: expect.any(String) } });
    expect(snapshot).not.toHaveBeenCalled();
    expect(model.requests).toHaveLength(0);
  });

  it("uses only the newest ten non-ramble answers in newest-first order", async () => {
    role.notes = [
      ...Array.from({ length: 12 }, (_, i) => ({
        ...note("Answer " + i, new Date(Date.UTC(2026, 10, 5, i)).toISOString()), question: "Question " + i,
      })),
      note("Excluded ramble", "2026-11-06T12:00:00.000Z"),
    ];
    await save();
    const res = await post({ ...input(), source: "answers" });
    expect(res.status).toBe(200);
    const messages = model.requests[0]!.messages as { content: string }[];
    const user = messages[1]!.content;
    expect(user).not.toContain("Excluded ramble");
    expect(user).not.toContain("Q: Question 0 A:");
    expect(user).not.toContain("Q: Question 1 A:");
    for (let i = 2; i < 12; i++) expect(user).toContain("Q: Question " + i + " A: Answer " + i);
    expect(user.indexOf("Q: Question 11 A:")).toBeLessThan(user.indexOf("Q: Question 2 A:"));
  });
  it("requires a ramble", async () => {
    const snapshot = vi.spyOn(cv, "snapshot");
    role.notes = [{ ...note(), question: "Which tool?" }];
    await save();
    const res = await post();
    expect(res.status).toBe(400);
    expect(snapshot).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ error: { code: "no_brain_dump", requestId: expect.any(String) } });
    expect(model.requests).toHaveLength(0);
  });

  it("uses the newest ramble by askedAt rather than array order", async () => {
    role.notes = [note("Newest ramble", "2026-11-05T11:00:00.000Z"), note("Older ramble")];
    await save();
    await result();
    const messages = model.requests[0]!.messages as { content: string }[];
    expect(messages[1]!.content).toContain("Newest ramble");
    expect(messages[1]!.content).not.toContain("Older ramble");
  });

  it("finds the ramble even after 25 older notes", async () => {
    role.notes = [...Array.from({ length: 25 }, () => ({ ...note("Older answer"), question: "Other question" })), note("Ramble after older notes")];
    await save();
    await result();
    expect(JSON.stringify(model.requests[0]!.messages)).toContain("Ramble after older notes");
  });

  it("limits a role with 18 bullets to the first two valid proposals", async () => {
    role.bullets = roleWith(Array.from({ length: 18 }, (_, i) => `Handled office task ${i}.`)).bullets;
    await save();
    answer(["Prepared payroll for 999 staff.", ...texts.slice(0, 3)]);
    expect((await result()).proposals.map((p) => p.text)).toEqual(texts.slice(0, 2));
    expect(JSON.stringify(model.requests[0]!.messages)).toContain("up to 2");
    expect(model.requests).toHaveLength(2);
  });

  it("returns the saved score for a full role without any model calls", async () => {
    role.bullets = roleWith(Array.from({ length: 20 }, (_, i) => `Handled office task ${i}.`)).bullets;
    await save();
    expect(await result()).toEqual({ proposals: [], roleBefore: 100, roleAfterAll: 100 });
    await insights.remove([role.id]);
    expect(await result()).toEqual({ proposals: [], roleBefore: null, roleAfterAll: null });
    expect(model.requests).toHaveLength(0);
  });

  it.each([true, false])("handles an empty role when proposals survive: %s", async (survive) => {
    role.bullets = [];
    await save(false);
    if (!survive) gradeChange = (b) => { b.meaningful = false; };
    const got = await result();
    expect(got.roleBefore).toBeNull();
    expect(got.roleAfterAll).toBe(survive ? 100 : null);
    expect(got.proposals).toHaveLength(survive ? 4 : 0);
    expect(model.logged.map((entry) => entry.task)).toEqual(["enrich_brain_dump", "enrich_score"]);
  });

  it("scores an uncached role before generating proposals", async () => {
    await insights.remove([role.id]);
    const added = { ...role, bullets: [{ id: "new1", text: texts[0]! }] };
    const answers = [initial, { bullets: [texts[0]] }, allSpecific(added)];
    model = fakeModel(() => answers.shift());
    expect((await result()).proposals).toHaveLength(1);
    expect(model.logged.map((entry) => entry.task)).toEqual(["enrich_score", "enrich_brain_dump", "enrich_score"]);
  });

  it.each([{ fingerprint: "stale" }, { roleId: "missing" }])("rejects unsaved roles: %j", async (override) => {
    const snapshot = vi.spyOn(cv, "snapshot");
    const res = await post({ ...input(), ...override });
    expect(snapshot).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "not_saved" } });
    expect(model.requests).toHaveLength(0);
  });

  it("requires sign-in and reads only the caller's saved CV", async () => {
    expect((await post(input(), { ...headers, authorization: "" })).status).toBe(401);
    expect((await post(input(), { ...headers, authorization: "Bearer user-b" })).status).toBe(409);
    expect(model.requests).toHaveLength(0);
  });

  it.each([{}, null, { roleId: "", fingerprint: "f" }, { roleId: "r", fingerprint: 5 }, { roleId: "r", fingerprint: "f", source: "other" }])("validates input: %j", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(model.requests).toHaveLength(0);
  });

  it.each([500, 200])("maps provider or repeated schema failure to 503: %s", async (status) => {
    model = fakeModel(() => ({ bullets: Array(5).fill("Prepared payroll.") }), status);
    const res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "ai_unavailable", requestId: expect.any(String) } });
    expect(model.logged).toHaveLength(2);
  });

  it("maps wrong grade ids to 502", async () => {
    gradeChange = (b) => { b.id = "wrong"; };
    const res = await post();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: "ai_bad_answer" } });
    expect(log).toHaveBeenCalledWith(JSON.stringify({ msg: "brain dump failed", code: "ai_bad_answer", requestId: res.headers.get("x-request-id") }));
  });

  it("maps a length cut-off to 502", async () => {
    model.deps.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "" } }] }));
    const res = await post();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: "ai_bad_answer" } });
    expect(model.logged).toHaveLength(1);
  });

  it("sends the ramble, existing bullets, tense, locale and writing rules", async () => {
    role.current = true;
    await save();
    const saved = await cv.get();
    await cv.save({ ...saved.content, locale: "ro" }, saved.version);
    await insights.put(role.id, buildRoleResult(role, initial, fingerprint(role, "ro")));
    expect((await post({ ...input(), fingerprint: fingerprint(role, "ro") })).status).toBe(200);
    const messages = model.requests[0]!.messages as { content: string }[];
    for (const text of ["CV locale: ro", "verb", "past tense", "present tense", "220", "first person", "untrusted", "range", "names"])
      expect(messages[0]!.content).toContain(text);
    for (const text of ["up to 4", role.notes[0]!.answer, role.bullets[0]!.text, "current"])
      expect(messages[1]!.content).toContain(text);
  });
});

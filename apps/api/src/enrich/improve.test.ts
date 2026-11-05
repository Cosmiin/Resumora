import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImproveAnswerSchema, buildRoleResult, emptyCv, fingerprint, type Experience, type ModelScore } from "@resumora/shared";
import { createApp } from "../app.ts";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { allSpecific, fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo, type MemoryInsightsStore } from "./memory-repo.ts";
import { scoreRole } from "./score.ts";

const headers = { authorization: "Bearer user-a", "content-type": "application/json" };
const proposal = "Prepared payroll files for staff.";
let role: Experience;
let cv: ReturnType<typeof memoryCvRepo>;
let insights: ReturnType<typeof memoryInsightsRepo>;
let model: ReturnType<typeof fakeModel>;
let app: ReturnType<typeof createApp>;
let initial: ModelScore;
let grade: ModelScore;
let store: MemoryInsightsStore;

const input = () => ({ roleId: role.id, bulletId: role.bullets[0]!.id, fingerprint: fingerprint(role, "en") });
const post = (body: unknown = input(), auth = headers) =>
  app.request("/v1/enrich/improve-bullet", { method: "POST", headers: auth, body: JSON.stringify(body) });

async function save() {
  await cv.save({ ...emptyCv("en"), experience: [role] }, (await cv.get()).version);
  await insights.put(role.id, buildRoleResult(role, initial, fingerprint(role, "en")));
}

function answer(text: string | null) {
  let calls = 0;
  model = fakeModel(() => calls++ === 0 ? { text } : grade);
}

beforeEach(async () => {
  role = roleWith(["Helped with payroll.", "Checked employment contracts."]);
  initial = allSpecific(role, (b, i) => {
    if (i === 0) Object.assign(b, { contribution: "partial", specificity: "missing", impact: "missing", issue: "contribution" });
  });
  grade = allSpecific(role, (b) => { b.impact = "missing"; b.issue = "impact"; });
  grade.bullets = [grade.bullets[0]!];
  cv = memoryCvRepo();
  store = new Map();
  insights = memoryInsightsRepo("user-a", store);
  await save();
  answer(proposal);
  const otherCv = memoryCvRepo();
  app = createApp({
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => ["user-a", "user-b"].includes(token) ? { id: token, token } : null,
    cvRepo: (user) => user.id === "user-a" ? cv : otherCv,
    insightsRepo: (user) => memoryInsightsRepo(user.id, store),
    model: () => model.deps,
    importRepo: () => { throw new Error("not used"); },
    queue: { send: async () => {} },
    log: vi.fn(),
  });
});

afterEach(() => vi.restoreAllMocks());

describe("POST /v1/enrich/improve-bullet", () => {
  it("offers a better bullet and promotes its prediction after saving without another model call", async () => {
    const saved = await cv.get();
    const res = await post();
    expect(res.status).toBe(200);
    const result = ImproveAnswerSchema.parse(await res.json());
    expect(result).toEqual({
      proposal: { bulletId: input().bulletId, text: proposal },
      bulletBefore: 43, bulletAfter: 80, roleBefore: 72, roleAfter: 90, cached: true,
    });
    const swapped = { ...role, bullets: role.bullets.map((b, i) => i === 0 ? { ...b, text: proposal } : b) };
    const predicted = buildRoleResult(swapped, { ...initial, bullets: [grade.bullets[0]!, initial.bullets[1]!] }, fingerprint(swapped, "en"));
    expect(await insights.pending(role.id)).toMatchObject([{ fingerprint: predicted.fingerprint, result: predicted }]);
    expect(await cv.get()).toEqual(saved);
    await cv.save({ ...saved.content, experience: [swapped] }, saved.version);
    expect(await scoreRole({ cv, insights, model: model.deps, userId: "user-a" }, {
      roleId: role.id, fingerprint: fingerprint(swapped, "en"),
    })).toEqual(predicted);
    expect(model.requests).toHaveLength(2);
    expect(model.logged.map((entry) => entry.task)).toEqual(["enrich_improve_bullet", "enrich_score"]);
    expect(model.logged.every((entry) => entry.userId === "user-a")).toBe(true);
  });

  it("grades the target last without changing the saved or cached bullet order", async () => {
    expect((await post()).status).toBe(200);
    const messages = model.requests[1]!.messages as { role: string; content: string }[];
    const user = messages[1]!.content;
    const bullets = JSON.parse(user.split("\n").find((line) => line.startsWith("["))!);
    expect(bullets).toEqual([
      role.bullets[1], { ...role.bullets[0], text: proposal },
    ]);
    expect((await cv.get()).content.experience[0]!.bullets).toEqual(role.bullets);
    const pending = await insights.pending(role.id);
    expect(pending[0]!.result.bullets.map((b) => b.id)).toEqual(role.bullets.map((b) => b.id));
  });

  it.each(["duplicate", "not meaningful"])("needs detail for a proposal graded as %s and caches nothing", async (kind) => {
    answer("Reviewed employee contracts.");
    Object.assign(grade.bullets[0]!, kind === "duplicate"
      ? { duplicateOf: role.bullets[1]!.id }
      : { meaningful: false });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ needsDetail: true });
    expect(model.requests).toHaveLength(2);
    expect(await insights.pending(role.id)).toEqual([]);
  });

  it.each([proposal, null])("copies the saved CV once before any model call, including needsDetail: %s", async (text) => {
    await insights.remove([role.id]);
    const snapshot = vi.spyOn(cv, "snapshot");
    const answers = [initial, { text }, grade];
    model = fakeModel(() => {
      expect(snapshot).toHaveBeenCalledExactlyOnceWith("ai");
      return answers.shift();
    });
    const saved = await cv.get();
    const res = await post();
    expect(res.status).toBe(200);
    expect(snapshot).toHaveBeenCalledExactlyOnceWith("ai");
    const history = await cv.listHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.reason).toBe("ai");
    expect((await cv.getHistory(history[0]!.id))?.content).toEqual(saved.content);
    expect(await res.json()).toMatchObject(text === null ? { needsDetail: true } : { cached: true });
  });

  it.each(["equal", "lower"])("needs detail for an %s grade and stores no prediction", async (kind) => {
    grade = { ...initial, bullets: [{ ...initial.bullets[0]!, ...(kind === "lower" ? { contribution: "missing" as const } : {}) }] };
    expect(await (await post()).json()).toEqual({ needsDetail: true });
    expect(model.requests).toHaveLength(2);
    expect(await insights.pending(role.id)).toEqual([]);
  });

  it("needs detail for null without asking the scorer", async () => {
    answer(null);
    expect(await (await post()).json()).toEqual({ needsDetail: true });
    expect(model.requests).toHaveLength(1);
    expect(await insights.pending(role.id)).toEqual([]);
  });

  it.each(["Prepared payroll for 999 staff.", "", "Helped with payroll.", "Prepared " + "payroll ".repeat(32)])(
    "rejects an unsupported number, blank, unchanged or overlong proposal: %s", async (text) => {
      answer(text);
      expect(await (await post()).json()).toEqual({ needsDetail: true });
      expect(model.requests).toHaveLength(1);
      expect(await insights.pending(role.id)).toEqual([]);
    },
  );

  it("keeps a number supplied only in a saved note and trims the proposal", async () => {
    role.notes = [{ id: "note-1", question: "How many staff?", answer: "75", via: ["type"], askedAt: "2026-11-05T10:00:00.000Z" }];
    await save();
    answer("  Prepared payroll for 75 staff.  ");
    const result = ImproveAnswerSchema.parse(await (await post()).json());
    expect(result).toMatchObject({ proposal: { text: "Prepared payroll for 75 staff." } });
    expect(await insights.pending(role.id)).toHaveLength(1);
  });

  it("collapses padding spaces before returning and caching a proposal", async () => {
    const padded = `Prepared${" ".repeat(32)}${"a".repeat(192)}`;
    expect(padded).toHaveLength(232);
    answer(padded);
    const res = await post();
    expect(res.status).toBe(200);
    const result = ImproveAnswerSchema.parse(await res.json());
    if (!("proposal" in result)) throw new Error("Expected a proposal");
    expect(result.proposal.text).not.toMatch(/ {2}/);
    expect(result.proposal.text.length).toBeLessThanOrEqual(220);
    const text = `Prepared ${"a".repeat(192)}`;
    expect(result.proposal.text).toBe(text);
    const swapped = { ...role, bullets: role.bullets.map((b, i) => i === 0 ? { ...b, text } : b) };
    expect(await insights.pending(role.id)).toMatchObject([{ fingerprint: fingerprint(swapped, "en") }]);
  });

  it("rejects a repeat of another bullet with different case and spacing", async () => {
    answer("  CHECKED   employment contracts.  ");
    expect(await (await post()).json()).toEqual({ needsDetail: true });
    expect(model.requests).toHaveLength(1);
    expect(await insights.pending(role.id)).toEqual([]);
  });

  it("returns a proposal without caching when another bullet was a duplicate", async () => {
    initial.bullets[1]!.issue = "duplicate";
    initial.bullets[1]!.duplicateOf = role.bullets[0]!.id;
    await save();
    expect(await (await post()).json()).toMatchObject({
      proposal: { text: proposal }, bulletAfter: 80, roleBefore: 22, roleAfter: 40, cached: false,
    });
    expect(await insights.pending(role.id)).toEqual([]);
  });

  it("scores an uncached saved role before rewriting", async () => {
    await insights.remove([role.id]);
    const answers = [initial, { text: proposal }, grade];
    model = fakeModel(() => answers.shift());
    expect(await (await post()).json()).toMatchObject({ bulletBefore: 43, bulletAfter: 80 });
    expect(model.logged.map((entry) => entry.task)).toEqual(["enrich_score", "enrich_improve_bullet", "enrich_score"]);
  });

  it.each([
    [{ fingerprint: "stale" }, 409, "not_saved"],
    [{ roleId: "missing" }, 409, "not_saved"],
    [{ bulletId: "missing" }, 404, "bullet_not_found"],
  ])("rejects unsaved roles or unknown bullets: %j", async (override, status, code) => {
    const snapshot = vi.spyOn(cv, "snapshot");
    const res = await post({ ...input(), ...override });
    expect(snapshot).not.toHaveBeenCalled();
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error: { code, requestId: expect.any(String) } });
    expect(model.requests).toHaveLength(0);
  });

  it("reads only the caller's CV when user B requests user A's role", async () => {
    const res = await post(input(), { ...headers, authorization: "Bearer user-b" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "not_saved" } });
    expect(model.requests).toHaveLength(0);
  });

  it("requires sign-in", async () => {
    expect((await post(input(), { ...headers, authorization: "" })).status).toBe(401);
    expect(model.requests).toHaveLength(0);
  });

  it.each([{}, { roleId: "role", fingerprint: "fp", bulletId: 5 }, null, { roleId: "", bulletId: "b", fingerprint: "f" }])(
    "validates the request body: %j", async (body) => {
      expect((await post(body)).status).toBe(400);
      expect(model.requests).toHaveLength(0);
    },
  );

  it("maps provider failure and invalid answers after retries to 503", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const status of [500, 200]) {
      model = fakeModel(() => ({}), status);
      const res = await post();
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: { code: "ai_unavailable", requestId: expect.any(String) } });
      expect(log).toHaveBeenLastCalledWith(JSON.stringify({ msg: "improve bullet failed", code: "ai_unavailable", requestId: res.headers.get("x-request-id") }));
      expect(model.logged).toHaveLength(2);
    }
    expect(await insights.pending(role.id)).toEqual([]);
  });

  it("maps a schema-valid grade with the wrong bullet id to 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    grade.bullets[0]!.id = "wrong";
    const res = await post();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: "ai_bad_answer" } });
    expect(model.requests).toHaveLength(2);
    expect(await insights.pending(role.id)).toEqual([]);
  });

  it("maps an output length cut-off to 502 without retrying", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    model.deps.fetch = async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "length", message: { content: "" } }],
    }));
    const res = await post();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: "ai_bad_answer" } });
    expect(model.logged).toHaveLength(1);
    expect(await insights.pending(role.id)).toEqual([]);
  });

  it("sends saved context, target, notes, tense and locale to the rewrite model", async () => {
    role.current = true;
    role.notes = [{ id: "n", question: "Which tool?", answer: "Sage", via: ["type"], askedAt: "2026-11-05T10:00:00.000Z" }];
    await save();
    const saved = await cv.get();
    await cv.save({ ...saved.content, locale: "ro" }, saved.version);
    await insights.put(role.id, buildRoleResult(role, initial, fingerprint(role, "ro")));
    await post({ ...input(), fingerprint: fingerprint(role, "ro") });
    const messages = model.requests[0]!.messages as { role: string; content: string }[];
    const system = messages[0]!.content;
    const user = messages[1]!.content;
    for (const text of ["CV locale: ro", "verb", "past tense", "present tense", "220", "first person", "untrusted", "null", "range"])
      expect(system).toContain(text);
    for (const text of [role.title, role.description, ...role.bullets.map((b) => b.text), "context only", "Which tool?", "Sage", "current"])
      expect(user).toContain(text);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  applyChanges, buildRoleResult, emptyCv, fingerprint, type Change, type Experience, type ModelBullet, type ModelCoverage, type ModelScore,
} from "@resumora/shared";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { checkChanges } from "./check-changes.ts";
import { allSpecific, fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";

const marks: ModelCoverage = { company: "shown", purpose: "shown", tools: "shown", scale: "applies", leadership: "na", seniority: "na", people: "na", domain: "na" };

let role: Experience;
let cv: ReturnType<typeof memoryCvRepo>;
let insights: ReturnType<typeof memoryInsightsRepo>;
let model: ReturnType<typeof fakeModel>;
/** What the fake grader answers for a line it is asked to grade, by the line's text. */
let gradeFor: (text: string) => Partial<ModelBullet>;
/** The ids each grading call asked for. */
let asked: string[][];
/** Which lines the fake grader actually grades, from the ids it was asked for (a real one sometimes adds or leaves out lines). */
let answerIds: (ids: string[]) => string[];
/** What the fake writer answers when asked for a better version of a held line (null: no better version). */
let betterText: string | null;

async function save(r: Experience, change?: (b: ModelScore["bullets"][number], i: number) => void) {
  role = r;
  await cv.save({ ...emptyCv("en"), experience: [role] }, (await cv.get()).version);
  await insights.put(role.id, buildRoleResult(role, { ...allSpecific(role, change), coverage: marks }, fingerprint(role, "en")));
}

const run = (changes: Change[], hold = true, fp = fingerprint(role, "en")) =>
  checkChanges({ cv, insights, model: model.deps, userId: "user-a" }, { roleId: role.id, fingerprint: fp, changes, hold });

beforeEach(async () => {
  cv = memoryCvRepo();
  insights = memoryInsightsRepo("user-a");
  gradeFor = () => ({});
  asked = [];
  answerIds = (ids) => ids;
  betterText = null;
  await save(roleWith(["Ran payroll for 40 staff.", "Checked contracts.", "Filed reports."]), (b, i) => {
    if (i === 1) Object.assign(b, { contribution: "partial", specificity: "missing", impact: "missing", issue: "contribution" });
  });
  model = fakeModel(() => {
    const request = model.requests.at(-1) as { response_format?: { json_schema?: { name?: string } } };
    if (request.response_format?.json_schema?.name === "enrich_better_line") return { text: betterText, nextQuestion: null };
    const user = (model.requests.at(-1)!.messages as { content: string }[])[1]!.content;
    const list = /Grade only these bullets: (.*?)\. Return/.exec(user)?.[1]?.trim() ?? "";
    const ids = list ? list.split(", ") : [];
    asked.push(ids);
    const texts = new Map(JSON.parse(/Bullets to grade \(JSON, each \{ id, text \}\):\n(.*)\n/.exec(user)![1]!).map((b: { id: string; text: string }) => [b.id, b.text]));
    const textOf = (id: string) => String(texts.get(id) ?? role.bullets.find((b) => b.id === id)?.text);
    const bullets = allSpecific({ ...role, bullets: answerIds(ids).map((id) => ({ id, text: textOf(id) })) }).bullets
      .map((b) => ({ ...b, ...gradeFor(textOf(b.id)) }));
    return { bullets, nextStepId: null, roleQuestions: [], thin: false, coverage: { ...marks, scale: "shown" } };
  });
});

describe("checkChanges", () => {
  it("uses what is usable when the grader grades lines it wasn't asked for", async () => {
    answerIds = () => role.bullets.map((b) => b.id);
    const out = await run([{ id: "c1", kind: "bullet", bulletId: role.bullets[1]!.id, text: "Checked 30 contracts a week." }]);
    expect(out.kept).toEqual(["c1"]);
    expect(out.held).toEqual([]);
    expect(await insights.pending(role.id)).toHaveLength(1);
  });

  it("holds only the change whose line the grader left out; the others are kept", async () => {
    const left = role.bullets[2]!.id;
    const stored = (await insights.get(role.id))!;
    answerIds = (ids) => ids.filter((id) => id !== left);
    const out = await run([
      { id: "c1", kind: "bullet", bulletId: role.bullets[1]!.id, text: "Checked 30 contracts a week." },
      { id: "c2", kind: "bullet", bulletId: left, text: "Filed 12 monthly reports." },
    ]);
    expect(out.kept).toEqual(["c1"]);
    expect(out.held.map((c) => c.id)).toEqual(["c2"]);
    expect(out.result.bullets.find((b) => b.id === left)).toEqual(stored.bullets.find((b) => b.id === left));
  });

  it("without hold, keeps a change the grader left out but stores no prediction for it", async () => {
    answerIds = () => [];
    const out = await run([{ id: "c1", kind: "bullet", bulletId: role.bullets[1]!.id, text: "Checked 30 contracts a week." }], false);
    expect(out.kept).toEqual(["c1"]);
    expect(await insights.pending(role.id)).toEqual([]);
  });

  it("grades only the changed line; the others keep their stored grades", async () => {
    const stored = (await insights.get(role.id))!;
    const out = await run([{ id: "c1", kind: "bullet", bulletId: role.bullets[1]!.id, text: "Checked 30 contracts a week." }]);
    expect(asked).toEqual([[role.bullets[1]!.id]]);
    expect(out.result.bullets[0]).toEqual(stored.bullets[0]);
    expect(out.result.bullets[2]).toEqual(stored.bullets[2]);
    expect(out.result.bullets[1]!.score).toBeGreaterThan(stored.bullets[1]!.score);
    expect(out.kept).toEqual(["c1"]);
    expect(out.held).toEqual([]);
  });

  it("grades a merged line and drops the lines it replaced", async () => {
    const [b1, b2, b3] = role.bullets.map((b) => b.id);
    const out = await run([
      { id: "m", kind: "bullet", bulletId: b1!, text: "Ran payroll for 40 staff and checked their contracts." },
      { id: "r", kind: "remove", bulletId: b2! },
    ], false);
    expect(asked).toEqual([[b1]]);
    expect(out.result.bullets.map((b) => b.id)).toEqual([b1, b3]);
  });

  it("takes the role-wide marks from the grading call", async () => {
    const out = await run([{ id: "c1", kind: "bullet", bulletId: role.bullets[1]!.id, text: "Checked 30 contracts a week." }]);
    expect(out.result.coverage?.marks.scale).toBe("shown");
  });

  it("holds a rewrite graded no better than before, and leaves it out of the prediction", async () => {
    gradeFor = (text) => (text.startsWith("Ran payroll") ? { impact: "missing", issue: "impact" } : {});
    const change: Change = { id: "c1", kind: "bullet", bulletId: role.bullets[0]!.id, text: "Ran payroll for the 40 staff." };
    const out = await run([change]);
    expect(out.held).toEqual([change]);
    expect(out.kept).toEqual([]);
    expect(out.result.fingerprint).toBe(fingerprint(role, "en"));
    // Nothing kept to grade: the stored marks stand, no second call.
    expect(asked).toHaveLength(1);
  });

  it("holds a new line graded below the role's line average", async () => {
    gradeFor = (text) => (text === "Helped the team." ? { contribution: "partial", impact: "missing", issue: "contribution" } : {});
    const weak: Change = { id: "new-1", kind: "new", text: "Helped the team." };
    const strong: Change = { id: "new-2", kind: "new", text: "Trained 3 new payroll clerks." };
    const out = await run([weak, strong]);
    expect(out.held).toEqual([weak]);
    expect(out.kept).toEqual(["new-2"]);
    expect(out.result.bullets.map((b) => b.id)).toEqual([...role.bullets.map((b) => b.id), "new-2"]);
    expect(out.result.fingerprint).toBe(fingerprint(applyChanges(role, [strong]), "en"));
    // A second call re-reads the role without the held line, for the marks only.
    expect(asked).toEqual([["new-1", "new-2"], []]);
  });

  it("asks, for a held new line, the grader's question with its options and amounts (score/12)", async () => {
    gradeFor = (text) => (text === "Helped the team." ? {
      contribution: "partial", impact: "missing", issue: "contribution", question: "What did you do for the team?",
      options: ["Trained … new clerks", "Ran the weekly rota"], amounts: ["1–3", "4–10"],
    } : {});
    const weak: Change = { id: "new-1", kind: "new", text: "Helped the team." };
    const out = await run([weak]);
    expect(out.held).toEqual([weak]);
    expect(out.asks).toEqual([{ changeId: "new-1", text: "What did you do for the team?", options: ["Trained … new clerks", "Ran the weekly rota"], amounts: ["1–3", "4–10"] }]);
  });

  it("asks, for a held rewrite, its line's question; a held change with no question gets none", async () => {
    const b2 = role.bullets[1]!.id;
    gradeFor = (text) => (text === "Checked." ? { contribution: "missing", specificity: "missing", impact: "missing", issue: "contribution", question: "Which contracts?", options: ["Employment contracts", "Supplier contracts"] }
      : text === "Helped." ? { contribution: "missing", issue: "contribution" } : {});
    const out = await run([{ id: "c1", kind: "bullet", bulletId: b2, text: "Checked." }, { id: "new-1", kind: "new", text: "Helped." }]);
    expect(out.held.map((c) => c.id)).toEqual(["c1", "new-1"]);
    expect(out.asks).toEqual([{ changeId: "c1", text: "Which contracts?", options: ["Employment contracts", "Supplier contracts"] }]);
  });

  it("offers, for a held line with no question, a better version only when it grades higher (owner, 25 Nov 2026)", async () => {
    const b2 = role.bullets[1]!.id;
    gradeFor = (text) => (text === "Helped." || text === "Checked." ? { contribution: "missing", specificity: "missing", impact: "missing", issue: "contribution" } : {});
    betterText = "Checked employment contracts for every new hire.";
    const better = await run([{ id: "c1", kind: "bullet", bulletId: b2, text: "Checked." }]);
    expect(better.held.map((c) => c.id)).toEqual(["c1"]);
    expect(better.better).toEqual([{ changeId: "c1", text: "Checked employment contracts for every new hire." }]);

    betterText = "Helped.";
    const none = await run([{ id: "new-1", kind: "new", text: "Helped." }]);
    expect(none.held.map((c) => c.id)).toEqual(["new-1"]);
    expect(none.better).toEqual([]);
  });

  it("offers a better version for a held line the grader left out, too", async () => {
    const b2 = role.bullets[1]!.id;
    let first = true;
    answerIds = (ids) => {
      const out = first ? ids.filter((id) => id !== b2) : ids;
      first = false;
      return out;
    };
    betterText = "Checked employment contracts for every new hire.";
    const out = await run([{ id: "c1", kind: "bullet", bulletId: b2, text: "Checked contracts carefully." }]);
    expect(out.held.map((c) => c.id)).toEqual(["c1"]);
    expect(out.better).toEqual([{ changeId: "c1", text: "Checked employment contracts for every new hire." }]);
  });

  it("holds nothing when asked not to", async () => {
    gradeFor = () => ({ contribution: "missing", issue: "contribution" });
    const out = await run([{ id: "new-1", kind: "new", text: "Helped." }], false);
    expect(out.held).toEqual([]);
    expect(asked).toHaveLength(1);
  });

  it("stores the prediction under the new fingerprint", async () => {
    const changes: Change[] = [{ id: "new-1", kind: "new", text: "Trained 3 new payroll clerks." }];
    const out = await run(changes);
    const fp = fingerprint(applyChanges(role, changes), "en");
    expect(out.result.fingerprint).toBe(fp);
    expect((await insights.pending(role.id)).map((p) => p.fingerprint)).toContain(fp);
  });

  it("grades again a stored repeated line", async () => {
    await save(role, (b, i) => { if (i === 2) Object.assign(b, { issue: "duplicate", duplicateOf: role.bullets[0]!.id }); });
    await run([{ id: "c1", kind: "bullet", bulletId: role.bullets[1]!.id, text: "Checked 30 contracts a week." }], false);
    expect(asked).toEqual([[role.bullets[1]!.id, role.bullets[2]!.id]]);
  });

  it("makes no model call when nothing that is graded changed", async () => {
    const out = await run([{ id: "o", kind: "order", ids: [role.bullets[2]!.id] }]);
    expect(asked).toEqual([]);
    expect(out.result.bullets[0]!.id).toBe(role.bullets[2]!.id);
  });

  it("never lowers a mark stored as shown; a better mark is taken", async () => {
    // Stored: tools shown, scale applies. The grader now says tools applies and scale shown.
    model = fakeModel(() => {
      const user = (model.requests.at(-1)!.messages as { content: string }[])[1]!.content;
      const ids = (/Grade only these bullets: (.*?)\. Return/.exec(user)?.[1] ?? "").split(", ").filter(Boolean);
      const bullets = allSpecific({ ...role, bullets: ids.map((id) => ({ id, text: "x" })) }).bullets;
      return { bullets, nextStepId: null, roleQuestions: [], thin: false, coverage: { ...marks, company: "applies", tools: "applies", scale: "shown" } };
    });
    const out = await run([{ id: "c1", kind: "bullet", bulletId: role.bullets[1]!.id, text: "Checked 30 contracts a week." }]);
    expect(out.result.coverage?.marks).toMatchObject({ company: "shown", tools: "shown", scale: "shown" });
  });

  it("409 when the role changed since the fingerprint", async () => {
    await expect(run([], true, "old")).rejects.toMatchObject({ status: 409, code: "not_saved" });
  });
});

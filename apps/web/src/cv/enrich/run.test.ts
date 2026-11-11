import { describe, expect, it } from "vitest";
import { BRAIN_DUMP_QUESTION, type Question, type RoleQuestion, type RoleResult, type RoleTopic } from "@resumora/shared";
import { RUN_MAX, buildRun, gapItems, questionKey, splitRun } from "./run.ts";

const rq = (id: string, topic: RoleTopic, text = `About ${id}?`): RoleQuestion => ({ id, text, options: [], kind: "role", topic });
const lq = (bulletId: string, text = `Line ${bulletId}?`): Question => ({ bulletId, text, options: [], kind: "detail" });
const result = (roleQuestions: RoleQuestion[], questions: Question[], thin = false): RoleResult => ({
  roleId: "r1", policy: "score/7", fingerprint: "f", score: 50, bullets: [], nextStep: null, questions, roleQuestions, thin,
});
const keys = (items: { key: string }[]) => items.map((i) => i.key);
const none = new Set<string>();

describe("the questions of a role, in the order a run asks them", () => {
  it("asks what is missing from the page first, then up to two quick checks, then the lines, then the rest", () => {
    const all = buildRun(result(
      [rq("o1", "other"), rq("t", "tools"), rq("l", "leadership"), rq("c", "company"), rq("s", "seniority"), rq("d", "domain"), rq("p", "purpose")],
      [lq("b2"), lq("b1")],
    ), { thin: false, answered: none });
    expect(keys(all)).toEqual(["role:c", "role:p", "role:t", "role:l", "role:s", "line:b2", "line:b1", "role:o1", "role:d"]);
  });

  it("a run is at most six questions; the others wait", () => {
    const all = buildRun(result(
      [rq("c", "company"), rq("p", "purpose"), rq("t", "tools"), rq("l", "leadership"), rq("pe", "people")],
      [lq("b1"), lq("b2"), lq("b3")],
    ), { thin: false, answered: none });
    const { items, rest } = splitRun(all);
    expect(RUN_MAX).toBe(6);
    expect(keys(items)).toEqual(["role:c", "role:p", "role:t", "role:l", "role:pe", "line:b1"]);
    expect(keys(rest)).toEqual(["line:b2", "line:b3"]);
  });

  it("a thin role opens with its box, counted as the first question", () => {
    const all = buildRun(result([rq("c", "company")], [lq("b1")], true), { thin: true, answered: none });
    expect(keys(all)).toEqual(["box", "role:c", "line:b1"]);
    // Once "Tell us about…" has an answer, it is not asked again.
    expect(keys(buildRun(result([rq("c", "company")], [], true), { thin: true, answered: new Set([questionKey(BRAIN_DUMP_QUESTION)]) }))).toEqual(["role:c"]);
  });

  it("leaves out what was already answered, and a question asked twice", () => {
    const all = buildRun(result(
      [rq("c", "company", "What does the company do?"), rq("o", "other", "what does the  company do?"), rq("t", "tools", "Which tools?")],
      [lq("b1", "Which tools?"), lq("b2", "How many?")],
    ), { thin: false, answered: new Set([questionKey("How many?")]) });
    expect(keys(all)).toEqual(["role:c", "role:t"]);
  });

  it("no score yet means nothing to ask (a thin role still gets its box)", () => {
    expect(buildRun(undefined, { thin: false, answered: none })).toEqual([]);
    expect(keys(buildRun(undefined, { thin: true, answered: none }))).toEqual(["box"]);
  });
});

// Owner review: a role below 80 must always have something to ask.
describe("the app's own questions for what the page still does not show", () => {
  const g = (id: string, score: number, impact: "missing" | "specific") => ({
    id, score, contribution: "specific" as const, clarity: "specific" as const, specificity: "specific" as const, impact,
    issue: "none" as const, tip: null, question: null,
  });
  const marks = { company: "shown", purpose: "shown", actions: "shown", tools: "applies", results: "applies", scale: "shown", leadership: "na", seniority: "na", people: "na", domain: "na" } as const;
  const scored: RoleResult = { ...result([], []), bullets: [g("b1", 80, "missing"), g("b2", 100, "specific"), g("b3", 80, "missing")], coverage: { score: 60, marks, shape: { amount: true, repeats: true, order: false } } };
  const bullets = [{ id: "b1", text: "One" }, { id: "b2", text: "Two" }, { id: "b3", text: "Three" }];
  const ask = { results: "Result?", tools: "Tool?", scale: "Size?" };

  it("asks for a result of the best line that has none, and for a tool of another line; nothing for what is shown", () => {
    const items = gapItems(scored, bullets, ask);
    expect(items.map((i) => [i.key, i.kind === "line" ? i.question.bulletId : "", i.kind === "line" ? i.question.text : ""])).toEqual([
      ["gap:results", "b1", "Result?"], ["gap:tools", "b2", "Tool?"],
    ]);
  });

  it("asks nothing when the page shows all three, or when the score has no marks", () => {
    expect(gapItems({ ...scored, coverage: { ...scored.coverage!, marks: { ...marks, tools: "shown", results: "shown" } } }, bullets, ask)).toEqual([]);
    expect(gapItems(result([], []), bullets, ask)).toEqual([]);
  });
});

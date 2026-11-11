import { describe, expect, it } from "vitest";
import { BRAIN_DUMP_QUESTION, type Question, type RoleQuestion, type RoleResult, type RoleTopic } from "@resumora/shared";
import { RUN_MAX, buildRun, questionKey, splitRun } from "./run.ts";

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

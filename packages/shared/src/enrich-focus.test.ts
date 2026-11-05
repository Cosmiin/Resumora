import { describe, expect, it } from "vitest";
import {
  BRAIN_DUMP_QUESTION, BrainDumpAnswerSchema, EnrichParseError, ExperienceSchema,
  ImproveAnswerSchema, MAX_PENDING, RoleFactsAnswerSchema, buildRoleResult, mergeGrades,
  type Experience, type ModelBullet,
} from "./index.ts";

function role(texts = ["Handled orders", "Prepared contracts"]): Experience {
  return ExperienceSchema.parse({
    id: "r1", company: "Acme", title: "Analyst", location: "", startDate: "2020", endDate: "2021",
    current: false, description: "", bullets: texts.map((text, i) => ({ id: `b${i + 1}`, text })),
  });
}

function grade(id: string, over: Partial<ModelBullet> = {}): ModelBullet {
  return {
    id, meaningful: true, contribution: "specific", clarity: "specific", specificity: "specific",
    impact: "missing", issue: "impact", duplicateOf: null, tip: "Add a result.",
    question: "How many?", options: ["Under 10", "10-50"], ...over,
  };
}

describe("mergeGrades", () => {
  it("replaces one bullet's grades and recomputes the rounded role mean", () => {
    const r = role();
    const stored = buildRoleResult(r, {
      bullets: [grade("b1", { contribution: "partial", specificity: "missing", issue: "contribution" }),
        grade("b2", { contribution: "partial", specificity: "missing", issue: "contribution" })],
      nextStepId: "b1",
    }, "old");
    expect(stored.bullets[0]!.score).toBe(43);
    const result = mergeGrades(r, stored, [grade("b1")], "new");
    expect(result.bullets[0]!.score).toBe(80);
    expect(result.score).toBe(62);
    expect(result.fingerprint).toBe("new");
    expect(result.nextStep?.bulletId).toBe("b2");
    expect(result.bullets[1]).toEqual(stored.bullets[1]);
    expect(result.questions.find((q) => q.bulletId === "b2"))
      .toEqual(stored.questions.find((q) => q.bulletId === "b2"));
  });

  it("keeps a stored semantic duplicate at zero when another bullet is re-graded", () => {
    const r = role(["Handled orders", "Processed customer orders"]);
    const stored = buildRoleResult(r, {
      bullets: [grade("b1"), grade("b2", { duplicateOf: "b1", issue: "duplicate" })],
      nextStepId: null,
    }, "old");
    expect(stored.score).toBe(40);

    const result = mergeGrades(r, stored, [grade("b1")], "new");

    expect(result.bullets[1]).toMatchObject({ score: 0, issue: "duplicate" });
    expect(result.score).toBe(40);
    expect(result.score).toBe(stored.score);
  });
  it("throws if a bullet has neither fresh nor stored grades", () => {
    expect(() => mergeGrades(role(), null, [grade("b1")], "fp")).toThrow(EnrichParseError);
    const stored = buildRoleResult(role(["Handled orders"]), { bullets: [grade("b1")], nextStepId: null }, "old");
    expect(() => mergeGrades(role(), stored, [], "fp")).toThrow(EnrichParseError);
  });

  it("builds the first result when all bullets have fresh grades", () => {
    const result = mergeGrades(role(), null, [grade("b1"), grade("b2")], "fp");
    expect(result.score).toBe(80);
    expect(result.bullets).toHaveLength(2);
    expect(mergeGrades(role([]), null, [], "empty").score).toBeNull();
  });

  it("scores a newly graded repeat zero", () => {
    const stored = buildRoleResult(role(), { bullets: [grade("b1"), grade("b2")], nextStepId: null }, "old");
    const result = mergeGrades(role(["Handled orders", "  HANDLED   orders "]), stored, [grade("b2")], "new");
    expect(result.bullets[1]).toMatchObject({ score: 0, issue: "duplicate", question: null });
    expect(result.score).toBe(40);
  });
});

describe("focus answers", () => {
  it("exports the brain dump question and pending limit", () => {
    expect(BRAIN_DUMP_QUESTION).toBe("What did a normal week here look like?");
    expect(MAX_PENDING).toBe(5);
  });

  it("accepts either a detail request or a complete improvement", () => {
    const proposal = { proposal: { bulletId: "b1", text: "Handled orders" }, bulletBefore: 43, bulletAfter: 80,
      roleBefore: null, roleAfter: 80 };
    expect(ImproveAnswerSchema.safeParse({ needsDetail: true }).success).toBe(true);
    expect(ImproveAnswerSchema.safeParse(proposal).success).toBe(true);
    expect(ImproveAnswerSchema.safeParse({ needsDetail: false }).success).toBe(false);
    expect(ImproveAnswerSchema.safeParse({ ...proposal, bulletAfter: 80.5 }).success).toBe(false);
    expect(ImproveAnswerSchema.safeParse({ ...proposal, needsDetail: true }).success).toBe(false);
  });

  it("accepts up to four brain dump proposals with integer scores", () => {
    const answer = (count: number, score = 80) => ({
      proposals: Array.from({ length: count }, (_, i) => ({ id: `b${i}`, text: "Handled orders", score })),
      roleBefore: null, roleAfterAll: count === 0 ? null : 80,
    });
    expect(BrainDumpAnswerSchema.safeParse(answer(0)).success).toBe(true);
    expect(BrainDumpAnswerSchema.safeParse(answer(4)).success).toBe(true);
    expect(BrainDumpAnswerSchema.safeParse(answer(5)).success).toBe(false);
    expect(BrainDumpAnswerSchema.safeParse(answer(1, 80.5)).success).toBe(false);
    expect(BrainDumpAnswerSchema.safeParse({ ...answer(1), extra: true }).success).toBe(false);
  });

  it("accepts up to eight role facts and requires their source hash", () => {
    expect(RoleFactsAnswerSchema.safeParse({ facts: Array(8).fill("Used SQL"), fromNotes: "hash" }).success).toBe(true);
    expect(RoleFactsAnswerSchema.safeParse({ facts: Array(9).fill("Used SQL"), fromNotes: "hash" }).success).toBe(false);
    expect(RoleFactsAnswerSchema.safeParse({ facts: [] }).success).toBe(false);
    expect(RoleFactsAnswerSchema.safeParse({ facts: [], fromNotes: "hash", extra: true }).success).toBe(false);
  });
});

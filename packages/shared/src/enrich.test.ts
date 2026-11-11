import { describe, expect, it } from "vitest";
import {
  EnrichParseError,
  MAX_QUESTIONS,
  MAX_ROLE_QUESTIONS,
  ModelScoreSchema,
  RoleResultSchema,
  SCORE_POLICY,
  band,
  buildRoleResult,
  bulletScore,
  clearCount,
  conciseGrade,
  fingerprint,
  isAllowedOption,
  isPlaceholder,
  hashText,
  questionKind,
  repeatKey,
  type Grade,
  type ModelBullet,
  type ModelScore,
} from "./enrich.ts";
import type { Experience } from "./cv.ts";
import { mergeGrades } from "./enrich-focus.ts";

const g = (a: Grade, b: Grade, c: Grade, d: Grade) => ({
  contribution: a,
  clarity: b,
  specificity: c,
  impact: d,
});

function role(texts: string[], over: Partial<Experience> = {}): Experience {
  return {
    id: "r1",
    company: "Acme",
    title: "Analyst",
    location: "",
    startDate: "2020-01",
    endDate: "2021-01",
    current: false,
    description: "Desc",
    bullets: texts.map((text, i) => ({ id: `b${i + 1}`, text })),
    notes: [],
    ...over,
  };
}

function mb(id: string, over: Partial<ModelBullet> = {}): ModelBullet {
  return {
    id,
    meaningful: true,
    ...g("specific", "specific", "specific", "specific"),
    issue: "none",
    duplicateOf: null,
    tip: null,
    question: null,
    options: [],
    ...over,
  };
}

const model = (bullets: ModelBullet[], nextStepId: string | null = null): ModelScore => ({ bullets, nextStepId, roleQuestions: [], thin: false });

describe("bulletScore", () => {
  it("uses policy score/6", () => {
    expect(SCORE_POLICY).toBe("score/6");
  });

  it("asks for a result only when impact is the remaining gap", () => {
    expect(questionKind(g("specific", "specific", "specific", "missing"))).toBe("result");
    expect(questionKind(g("specific", "specific", "specific", "partial"))).toBe("result");
    expect(questionKind(g("partial", "specific", "specific", "missing"))).toBe("detail");
    expect(questionKind(g("specific", "specific", "specific", "specific"))).toBe("detail");
  });

  it("applies the weights", () => {
    expect(bulletScore(g("specific", "specific", "specific", "specific"))).toBe(100);
    expect(bulletScore(g("specific", "specific", "specific", "missing"))).toBe(80);
    expect(bulletScore(g("partial", "specific", "missing", "missing"))).toBe(45);
    expect(bulletScore(g("partial", "specific", "partial", "partial"))).toBe(65);
    expect(bulletScore(g("missing", "partial", "missing", "partial"))).toBe(20);
    // Concise is the fifth check: 10 points, half for partly.
    expect(bulletScore({ ...g("specific", "specific", "specific", "specific"), concise: "partial" })).toBe(95);
    expect(bulletScore({ ...g("specific", "specific", "specific", "missing"), concise: "missing" })).toBe(70);
  });
});

describe("isPlaceholder", () => {
  it("catches placeholders", () => {
    for (const t of ["", "  ", "TODO", "tbd.", "Lorem ipsum dolor", "asdf", "test", "Exemplu!", "De completat...", "Nimic", "Nimič", "Lórem ípsum dolor", "Éxemplu"]) {
      expect(isPlaceholder(t)).toBe(true);
    }
  });
  it("lets real text through", () => {
    expect(isPlaceholder("Tested payroll exports")).toBe(false);
    expect(isPlaceholder("Testing API endpoints with Postman")).toBe(false);
    expect(isPlaceholder("Test plans written for checkout")).toBe(false);
  });
});

describe("isAllowedOption", () => {
  it("allows ranges and no numbers only", () => {
    for (const o of ["10–50 a week", "10-50", "Under 10", "50+", "Peste 50", "Customs papers", "OVER 5"]) {
      expect(isAllowedOption(o)).toBe(true);
    }
    expect(isAllowedOption("About 40 a week")).toBe(false);
    expect(isAllowedOption("In 2021")).toBe(false);
  });
});

describe("buildRoleResult", () => {
  it("parses a stored score/2 row without role questions", () => {
    const stored = {
      roleId: "r1", policy: "score/2", fingerprint: "old", score: null,
      bullets: [], nextStep: null, questions: [],
    };
    expect(RoleResultSchema.parse(stored)).toEqual({ ...stored, roleQuestions: [], thin: false });
  });

  it("keeps up to eight role questions with their topics, ids and allowed options, and rejects nine", () => {
    const topics = ["company", "purpose", "tools", "other", "other", "other", "other", "other"] as const;
    const roleQuestions = topics.map((topic, i) => ({ text: `Question ${i + 1}?`, options: ["No", "Managed 37 people", "20+"], topic }));
    expect(MAX_ROLE_QUESTIONS).toBe(8);
    const result = buildRoleResult(role([]), { ...model([]), roleQuestions }, "fp");
    expect(result.roleQuestions).toHaveLength(8);
    // The company question carries no options: the model is not told the employer, so its guesses would be noise.
    expect(result.roleQuestions[0]).toEqual({ id: "rq1", text: "Question 1?", options: [], kind: "role", topic: "company" });
    expect(result.roleQuestions[1]).toEqual({ id: "rq2", text: "Question 2?", options: ["No", "20+"], kind: "role", topic: "purpose" });
    expect(result.roleQuestions.map((q) => q.topic)).toEqual(topics);
    expect(RoleResultSchema.parse(result)).toEqual(result);
    expect(ModelScoreSchema.safeParse({ ...model([]), roleQuestions }).success).toBe(true);
    const nine = [...roleQuestions, { text: "Question 9?", options: [], topic: "other" }];
    expect(ModelScoreSchema.safeParse({ ...model([]), roleQuestions: nine }).success).toBe(false);
    expect(RoleResultSchema.safeParse({ ...result, roleQuestions: [...result.roleQuestions, { ...result.roleQuestions[0]!, id: "rq9" }] }).success).toBe(false);
  });

  it("reads a stored role question without a topic as other", () => {
    const stored = { roleId: "r1", policy: "score/3", fingerprint: "old", score: null, bullets: [], nextStep: null, questions: [],
      roleQuestions: [{ id: "rq1", text: "Who did you report to?", options: [], kind: "role" }] };
    expect(RoleResultSchema.parse(stored).roleQuestions[0]!.topic).toBe("other");
  });

  it("marks a role thin with one bullet or fewer, or when the model says so; stored results without it read as false", () => {
    expect(buildRoleResult(role([]), model([]), "fp").thin).toBe(true);
    expect(buildRoleResult(role(["a1"]), model([mb("b1")]), "fp").thin).toBe(true);
    expect(buildRoleResult(role(["a1", "a2"]), model([mb("b1"), mb("b2")]), "fp").thin).toBe(false);
    expect(buildRoleResult(role(["a1", "a2"]), { ...model([mb("b1"), mb("b2")]), thin: true }, "fp").thin).toBe(true);
    const stored = { roleId: "r1", policy: "score/3", fingerprint: "old", score: null, bullets: [], nextStep: null, questions: [] };
    expect(RoleResultSchema.parse(stored).thin).toBe(false);
  });

  it("builds bullet-only grade results without role questions", () => {
    const grades = { bullets: [mb("b1")], nextStepId: null };
    expect(buildRoleResult(role(["Prepared payroll files"]), grades, "fp").roleQuestions).toEqual([]);
    expect(ModelScoreSchema.parse(grades).roleQuestions).toEqual([]);
  });

  it("carries the role id", () => {
    expect(buildRoleResult(role(["Led a team"]), model([mb("b1")]), "fp").roleId).toBe("r1");
  });

  it("scores a placeholder 0 with issue example even if graded specific", () => {
    const r = buildRoleResult(role(["TODO"]), model([mb("b1")]), "fp");
    expect(r.bullets[0]).toMatchObject({ score: 0, issue: "example" });
  });

  it("scores an exact repeat 0 as duplicate", () => {
    const r = buildRoleResult(role(["Prepared  contracts", "prepared contracts"]), model([mb("b1"), mb("b2")]), "fp");
    expect(r.bullets[0]?.score).toBe(100);
    expect(r.bullets[1]).toMatchObject({ score: 0, issue: "duplicate" });
  });

  it("honours a model duplicateOf pointing at an earlier bullet", () => {
    const r = buildRoleResult(role(["One thing", "Another thing"]), model([mb("b1"), mb("b2", { duplicateOf: "b1" })]), "fp");
    expect(r.bullets[1]).toMatchObject({ score: 0, issue: "duplicate" });
  });

  it("ignores a duplicateOf pointing at a later id", () => {
    const r = buildRoleResult(role(["One thing", "Another thing"]), model([mb("b1", { duplicateOf: "b2" }), mb("b2")]), "fp");
    expect(r.bullets[0]).toMatchObject({ score: 100, issue: "none" });
  });

  it("scores a not-meaningful bullet 0 as example", () => {
    const r = buildRoleResult(role(["Stuff"]), model([mb("b1", { meaningful: false })]), "fp");
    expect(r.bullets[0]).toMatchObject({ score: 0, issue: "example" });
  });

  it("normalises the issue and drops the tip and question when it differs", () => {
    const r = buildRoleResult(
      role(["Did work"]),
      model([mb("b1", { ...g("partial", "specific", "specific", "specific"), issue: "impact", tip: "t", question: "q?" })]),
      "fp",
    );
    expect(r.bullets[0]).toMatchObject({ issue: "contribution", tip: null, question: null });
    expect(r.questions).toEqual([]);
  });

  it("keeps the tip and question when the issue matches", () => {
    const r = buildRoleResult(
      role(["Did work"]),
      model([mb("b1", { ...g("specific", "specific", "specific", "missing"), issue: "impact", tip: "t", question: "q?" })]),
      "fp",
    );
    expect(r.bullets[0]).toMatchObject({ issue: "impact", tip: "t", question: "q?" });
  });

  it("role score is the rounded mean", () => {
    const r = buildRoleResult(
      role(["a one", "b two", "TODO"]),
      model([mb("b1"), mb("b2", g("specific", "specific", "specific", "missing")), mb("b3")]),
      "fp",
    );
    expect(r.lines).toBe(60);
    expect(r.policy).toBe(SCORE_POLICY);
    expect(r.fingerprint).toBe("fp");
  });

  it("a role with no bullets has no score", () => {
    const r = buildRoleResult(role([]), model([]), "fp");
    expect(r).toMatchObject({ score: null, questions: [], nextStep: null, bullets: [] });
  });

  it("keeps all five questions by issue priority then lower score, non-null only", () => {
    const r = buildRoleResult(
      role(["a1", "a2", "a3", "a4", "a5", "a6"]),
      model([
        mb("b1", { ...g("specific", "specific", "specific", "missing"), issue: "impact", question: "q1" }),
        mb("b2", { ...g("specific", "specific", "partial", "partial"), issue: "specificity", question: "q2" }),
        mb("b3", { ...g("partial", "specific", "specific", "specific"), issue: "contribution", question: "q3" }),
        mb("b4", { ...g("missing", "specific", "specific", "specific"), issue: "contribution", question: "q4" }),
        mb("b5", { ...g("specific", "partial", "specific", "specific"), issue: "clarity", question: null }),
        mb("b6", { ...g("specific", "specific", "partial", "specific"), issue: "specificity", question: "q6" }),
      ]),
      "fp",
    );
    expect(r.questions.map((q) => q.bulletId)).toEqual(["b4", "b3", "b2", "b6", "b1"]);
    expect(r.questions.map((q) => q.kind)).toEqual(["detail", "detail", "detail", "detail", "result"]);
  });

  it("duplicates never ask", () => {
    const r = buildRoleResult(
      role(["same", "same"]),
      model([mb("b1"), mb("b2", { issue: "duplicate", question: "why?" })]),
      "fp",
    );
    expect(r.questions).toEqual([]);
    expect(r.bullets[1]?.question).toBeNull();
  });

  it.each([5, 20])("keeps every question for a role with %i bullets", (count) => {
    const r = role(Array.from({ length: count }, (_, i) => `Handled task ${i}`));
    const bullets = r.bullets.map(({ id }) => mb(id, {
      ...g("specific", "specific", "specific", "missing"), issue: "impact", question: "How often?",
    }));
    const result = buildRoleResult(r, model(bullets), "fp");
    expect(MAX_QUESTIONS).toBe(20);
    expect(result.questions).toHaveLength(count);
    expect(result.questions.every((q) => q.kind === "result")).toBe(true);
    expect(RoleResultSchema.safeParse(result).success).toBe(true);
  });

  it("filters question options", () => {
    const r = buildRoleResult(
      role(["Handled files"]),
      model([
        mb("b1", {
          ...g("specific", "specific", "specific", "missing"),
          issue: "impact",
          question: "How many?",
          options: ["About 40 a week", "10–50 a week", "Under 10", "50+", "Peste 50", "Customs papers"],
        }),
      ]),
      "fp",
    );
    expect(r.questions[0]).toEqual({
      bulletId: "b1",
      text: "How many?",
      kind: "result",
      options: ["10–50 a week", "Under 10", "50+", "Peste 50", "Customs papers"],
    });
  });

  describe("nextStep", () => {
    const three = () => role(["a1", "a2", "a3"]);
    const ms = (nextStepId: string | null) =>
      model(
        [
          mb("b1", { ...g("specific", "specific", "specific", "missing"), issue: "impact", tip: "ti" }),
          mb("b2", { ...g("partial", "specific", "specific", "specific"), issue: "contribution", tip: "t2" }),
          mb("b3", { ...g("missing", "specific", "specific", "specific"), issue: "contribution", tip: "t3" }),
        ],
        nextStepId,
      );

    it("uses the model's pick when it is in the top tier", () => {
      expect(buildRoleResult(three(), ms("b2"), "fp").nextStep).toEqual({
        bulletId: "b2",
        issue: "contribution",
        tip: "t2",
      });
    });
    it("otherwise takes the lowest-scoring bullet of the top tier", () => {
      expect(buildRoleResult(three(), ms("b1"), "fp").nextStep?.bulletId).toBe("b3");
      expect(buildRoleResult(three(), ms(null), "fp").nextStep?.bulletId).toBe("b3");
    });
    it("is null when every issue is none", () => {
      expect(buildRoleResult(role(["a1"]), model([mb("b1")], "b1"), "fp").nextStep).toBeNull();
    });
  });

  it("throws on unknown, missing or repeated ids", () => {
    expect(() => buildRoleResult(role(["a1"]), model([mb("zz")]), "fp")).toThrow(EnrichParseError);
    expect(() => buildRoleResult(role(["a1", "a2"]), model([mb("b1")]), "fp")).toThrow(EnrichParseError);
    expect(() => buildRoleResult(role(["a1"]), model([mb("b1"), mb("b1")]), "fp")).toThrow(EnrichParseError);
  });
});

describe("mergeGrades role questions", () => {
  it("preserves stored role questions and their ids when a bullet is re-graded", () => {
    const r = role(["Prepared payroll files"]);
    const stored = buildRoleResult(r, model([mb("b1")]), "old");
    stored.roleQuestions = [{ id: "rq2", text: "Who did you report to?", options: ["The CEO", "The owner"], kind: "role", topic: "other" }];
    const result = mergeGrades(r, stored, [mb("b1", { impact: "missing", issue: "impact" })], "new");
    expect(result.roleQuestions).toEqual([
      { id: "rq2", text: "Who did you report to?", options: ["The CEO", "The owner"], kind: "role", topic: "other" },
    ]);
    expect(result.lines).toBe(80);
    expect(result.fingerprint).toBe("new");
  });
});

describe("fingerprint", () => {
  const base = role(["one", "two"]);
  const fp = fingerprint(base, "en");
  it("is stable", () => {
    expect(fingerprint(role(["one", "two"]), "en")).toBe(fp);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });
  it("changes with scored inputs", () => {
    expect(fingerprint(role(["one", "twO"]), "en")).not.toBe(fp);
    expect(fingerprint(role(["one", "two"], { description: "x" }), "en")).not.toBe(fp);
    expect(fingerprint(role(["one", "two"], { title: "Other" }), "en")).not.toBe(fp);
    expect(fingerprint(base, "ro")).not.toBe(fp);
  });
  it("changes when a bullet keeps its text but gets a new id", () => {
    const retyped = { ...base, bullets: [base.bullets[0]!, { id: "b9", text: "two" }] };
    expect(fingerprint(retyped, "en")).not.toBe(fp);
  });
  it("ignores the company", () => {
    expect(fingerprint(role(["one", "two"], { company: "Z" }), "en")).toBe(fp);
  });
  it("changes with the role's period, because questions are written for the time the work happened", () => {
    expect(fingerprint(role(["one", "two"], { startDate: "2000", endDate: "", current: true }), "en")).not.toBe(fp);
  });
  it("ignores hidden notes and facts", () => {
    expect(fingerprint({
      ...base,
      notes: [{ id: "n1", question: "Q", answer: "A", via: ["type"], askedAt: "2026-11-05T00:00:00Z" }],
      facts: { items: ["Used SQL"], fromNotes: "hash", updatedAt: "2026-11-05T00:00:00Z" },
    }, "en")).toBe(fp);
  });
});

describe("text keys", () => {
  it("normalizes repeats and returns stable base-36 hashes", () => {
    expect(repeatKey("  Prepared   contracts ")).toBe(repeatKey("prepared contracts"));
    expect(hashText("hello")).toBe("19jqrdkps12");
    expect(hashText("hello!")).not.toBe(hashText("hello"));
  });
});

describe("band and clearCount", () => {
  it("bands", () => {
    expect(band(39)).toBe("needsWork");
    expect(band(40)).toBe("goodStart");
    expect(band(79)).toBe("goodStart");
    expect(band(80)).toBe("clear");
  });
  it("counts clear bullets", () => {
    const r = buildRoleResult(
      role(["a1", "a2", "TODO"]),
      model([mb("b1"), mb("b2", g("partial", "partial", "partial", "partial")), mb("b3")]),
      "fp",
    );
    expect(clearCount(r)).toEqual({ clear: 1, total: 3 });
  });
});

describe("blank tip and question", () => {
  it("become null", () => {
    const r = buildRoleResult(
      role(["Did work"]),
      model([mb("b1", { ...g("specific", "specific", "specific", "missing"), issue: "impact", tip: "  ", question: "" })]),
      "fp",
    );
    expect(r.bullets[0]).toMatchObject({ tip: null, question: null });
    expect(r.questions).toEqual([]);
  });
});

// score/6: a role's score is 60% its bullets (Lines) and 40% what the role shows a recruiter (Coverage).
describe("coverage and the role score", () => {
  const texts = ["Planned routes for 14 depots in Excel", "Built the weekly delivery report", "Trained colleagues"];
  const bullets = [
    mb("b1", g("specific", "specific", "specific", "missing")),
    mb("b2", g("specific", "specific", "specific", "missing")),
    mb("b3", g("specific", "specific", "missing", "missing")),
  ];
  const marks = { company: "applies", purpose: "applies", tools: "shown", scale: "shown", leadership: "shown", seniority: "na", people: "na", domain: "na" } as const;

  it("adds up the example from the owner's score page: lines 73, coverage 64, score 69", () => {
    const r = buildRoleResult(role(texts), { ...model(bullets), coverage: marks }, "fp");
    expect(r.bullets.map((b) => b.score)).toEqual([80, 80, 60]);
    expect(r.lines).toBe(73);
    // Core shown: actions (from the grades), tools, scale = 30. Leadership applies and is shown = 20. Shape: 3 bullets, no repeats = 14.
    expect(r.coverage).toMatchObject({ score: 64, marks: { actions: "shown", results: "applies" }, shape: { amount: true, repeats: true, order: false } });
    expect(r.score).toBe(69);
  });

  it("gives the conditional points when nothing conditional applies, and none while one is still unknown", () => {
    const none = { ...marks, leadership: "na" } as const;
    expect(buildRoleResult(role(texts), { ...model(bullets), coverage: none }, "fp").coverage?.score).toBe(64);
    const unknown = { ...marks, leadership: "unknown" } as const;
    expect(buildRoleResult(role(texts), { ...model(bullets), coverage: unknown }, "fp").coverage?.score).toBe(44);
  });

  it("counts a result first, and a core parameter the model calls not applicable as not shown", () => {
    const first = [mb("b1"), bullets[1]!, bullets[2]!];
    const r = buildRoleResult(role(texts), { ...model(first), coverage: { ...marks, company: "na" } }, "fp");
    expect(r.coverage).toMatchObject({ marks: { company: "applies", results: "shown" }, shape: { order: true } });
    expect(r.coverage?.score).toBe(80);
  });

  it("caps concise by length, whatever the model says", () => {
    expect(conciseGrade("x".repeat(220), "specific")).toBe("specific");
    expect(conciseGrade("x".repeat(221), "specific")).toBe("partial");
    expect(conciseGrade("x".repeat(301), "specific")).toBe("missing");
    expect(conciseGrade("short", "partial")).toBe("partial");
    const r = buildRoleResult(role(["y".repeat(250)]), model([mb("b1")]), "fp");
    expect(r.bullets[0]).toMatchObject({ concise: "partial", score: 95 });
  });

  it("keeps the role-wide marks when one bullet is graded again", () => {
    const stored = buildRoleResult(role(texts), { ...model(bullets), coverage: marks }, "old");
    const again = mergeGrades(role(texts), stored, [mb("b3")], "new");
    expect(again.coverage?.marks).toMatchObject({ tools: "shown", company: "applies", leadership: "shown", results: "shown" });
  });
});

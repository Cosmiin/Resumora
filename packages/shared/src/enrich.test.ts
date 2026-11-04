import { describe, expect, it } from "vitest";
import {
  EnrichParseError,
  SCORE_POLICY,
  band,
  buildRoleResult,
  bulletScore,
  clearCount,
  fingerprint,
  isAllowedOption,
  isPlaceholder,
  type Grade,
  type ModelBullet,
  type ModelScore,
} from "./enrich.ts";
import type { Experience } from "./cv.ts";

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

const model = (bullets: ModelBullet[], nextStepId: string | null = null): ModelScore => ({ bullets, nextStepId });

describe("bulletScore", () => {
  it("applies the weights", () => {
    expect(bulletScore(g("specific", "specific", "specific", "specific"))).toBe(100);
    expect(bulletScore(g("specific", "specific", "specific", "missing"))).toBe(80);
    expect(bulletScore(g("partial", "specific", "missing", "missing"))).toBe(43);
    expect(bulletScore(g("partial", "specific", "partial", "partial"))).toBe(63);
    expect(bulletScore(g("missing", "partial", "missing", "partial"))).toBe(23);
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
    expect(r.score).toBe(60);
    expect(r.policy).toBe(SCORE_POLICY);
    expect(r.fingerprint).toBe("fp");
  });

  it("a role with no bullets has no score", () => {
    const r = buildRoleResult(role([]), model([]), "fp");
    expect(r).toMatchObject({ score: null, questions: [], nextStep: null, bullets: [] });
  });

  it("orders questions by issue priority then lower score, max 3, non-null only", () => {
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
    expect(r.questions.map((q) => q.bulletId)).toEqual(["b4", "b3", "b2"]);
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
  it("ignores company and dates", () => {
    expect(
      fingerprint(role(["one", "two"], { company: "Z", startDate: "2000", endDate: "", current: true }), "en"),
    ).toBe(fp);
  });
});

describe("band and clearCount", () => {
  it("bands", () => {
    expect(band(39)).toBe("needsWork");
    expect(band(40)).toBe("goodStart");
    expect(band(74)).toBe("goodStart");
    expect(band(75)).toBe("clear");
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

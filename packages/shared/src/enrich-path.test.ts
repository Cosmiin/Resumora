import { describe, expect, it } from "vitest";
import type { Experience } from "./cv.ts";
import type { RoleResult } from "./enrich.ts";
import { CompaniesAnswerSchema, PATH_BUDGET, ToolsAnswerSchema, companyKey, pickBudget, questionKey, toolShown } from "./enrich-path.ts";

const role = (over: Partial<Experience> = {}): Experience => ({
  id: "r1", company: "Acme", title: "Analyst", location: "", startDate: "2020-01", endDate: "", current: true,
  description: "", bullets: [], notes: [], ...over,
});

const grade = (id: string, score: number) => ({
  id, score, contribution: "specific" as const, clarity: "specific" as const, specificity: "specific" as const,
  impact: "missing" as const, issue: "impact" as const, tip: null, question: null,
});

function result(roleId: string, over: Partial<RoleResult> = {}): RoleResult {
  return { roleId, policy: "score/8", fingerprint: "f", score: 60, bullets: [], nextStep: null, questions: [], roleQuestions: [], thin: false, ...over };
}

describe("companyKey", () => {
  it("matches the same company whatever the capitals, spaces or legal ending", () => {
    expect(companyKey("Carbon Global SRL")).toBe(companyKey(" carbon  global "));
    expect(companyKey("Robert Half Inc.")).toBe("robert half");
    expect(companyKey("Nordlane S.R.L.")).toBe("nordlane");
    expect(companyKey("Siemens AG")).toBe("siemens");
  });
  it("is empty for a blank name", () => {
    expect(companyKey("")).toBe("");
    expect(companyKey("   ")).toBe("");
  });
  it("keeps a name that is only a legal ending", () => {
    expect(companyKey("SA")).toBe("sa");
  });
});

describe("toolShown", () => {
  it("finds a tool named in a line, the description or a note answer, as whole words", () => {
    expect(toolShown(role({ bullets: [{ id: "b1", text: "Built reports in Power BI." }] }), "power bi")).toBe(true);
    expect(toolShown(role({ bullets: [{ id: "b1", text: "Built reports in Power BI." }] }), "BI")).toBe(true);
    expect(toolShown(role({ bullets: [{ id: "b1", text: "Mobile apps." }] }), "BI")).toBe(false);
    expect(toolShown(role({ description: "Ran payroll in SAP." }), "SAP")).toBe(true);
    expect(toolShown(role({ notes: [{ id: "n1", question: "Which tools?", answer: "Workday, Excel", via: ["type"], askedAt: "2026-11-17T00:00:00Z" }] }), "workday")).toBe(true);
    expect(toolShown(role(), "Excel")).toBe(false);
  });
  it("matches tools with symbols in their names", () => {
    expect(toolShown(role({ bullets: [{ id: "b1", text: "Wrote C++ services." }] }), "C++")).toBe(true);
    expect(toolShown(role({ bullets: [{ id: "b1", text: "Wrote C services." }] }), "C++")).toBe(false);
  });
});

describe("pickBudget", () => {
  const roleQ = (text: string, topic: "company" | "purpose" | "tools" | "leadership" | "other") => ({ id: `rq-${text}`, text, options: [], kind: "role" as const, topic });
  const lineQ = (bulletId: string, text: string) => ({ bulletId, text, options: [], kind: "detail" as const });

  it("never asks about the company or the tools", () => {
    const items = [{ id: "a", result: result("a", { roleQuestions: [roleQ("What does Acme do?", "company"), roleQ("Which tools?", "tools"), roleQ("What was the role for?", "purpose")] }) }];
    expect(pickBudget({ items, weights: new Map(), asked: new Set() }).map((b) => b.question.text)).toEqual(["What was the role for?"]);
  });

  it("leaves out a question already asked", () => {
    const items = [{ id: "a", result: result("a", { roleQuestions: [roleQ("What was the role for?", "purpose")], bullets: [grade("b1", 50)], questions: [lineQ("b1", "What changed?")] }) }];
    const out = pickBudget({ items, weights: new Map(), asked: new Set([questionKey("what was  the role for?")]) });
    expect(out.map((b) => b.question.text)).toEqual(["What changed?"]);
  });

  it("keeps the most valuable, weighting recent roles, and returns them in CV order", () => {
    const items = [
      { id: "old", result: result("old", { bullets: [grade("o1", 10)], questions: [lineQ("o1", "Old line?")] }) },
      { id: "new", result: result("new", { bullets: [grade("n1", 50)], questions: [lineQ("n1", "New line?")] }) },
    ];
    // old: (100-10)*1 = 90; new: (100-50)*3 = 150. With size 1 the new role wins.
    const one = pickBudget({ items, weights: new Map([["new", 3]]), asked: new Set(), size: 1 });
    expect(one.map((b) => b.roleId)).toEqual(["new"]);
    const both = pickBudget({ items, weights: new Map([["new", 3]]), asked: new Set() });
    expect(both.map((b) => b.roleId)).toEqual(["old", "new"]);
  });

  it("asks at most PATH_BUDGET questions", () => {
    const bullets = Array.from({ length: 12 }, (_, i) => grade(`b${i}`, 40));
    const questions = bullets.map((b) => lineQ(b.id, `Question ${b.id}?`));
    const out = pickBudget({ items: [{ id: "a", result: result("a", { bullets, questions }) }], weights: new Map(), asked: new Set() });
    expect(PATH_BUDGET).toBe(8);
    expect(out).toHaveLength(8);
  });

  it("puts a role's questions about the whole role before its line questions", () => {
    const items = [{ id: "a", result: result("a", { bullets: [grade("b1", 0)], questions: [lineQ("b1", "Line?")], roleQuestions: [roleQ("Did anyone report to you?", "leadership")] }) }];
    expect(pickBudget({ items, weights: new Map(), asked: new Set() }).map((b) => b.kind)).toEqual(["role", "line"]);
  });

  it("keeps the same wording on two different lines, but not twice on one line", () => {
    const items = [{ id: "a", result: result("a", { bullets: [grade("b1", 50), grade("b2", 50)],
      questions: [lineQ("b1", "What changed?"), lineQ("b2", "What changed?"), lineQ("b2", "What  changed?")] }) }];
    expect(pickBudget({ items, weights: new Map(), asked: new Set() }).map((b) => b.kind === "line" && b.question.bulletId)).toEqual(["b1", "b2"]);
  });

  it("returns nothing when no role has a score", () => {
    expect(pickBudget({ items: [{ id: "a", result: undefined }], weights: new Map(), asked: new Set() })).toEqual([]);
  });

  it("asks the same question once even when two roles share it", () => {
    const items = [
      { id: "a", result: result("a", { roleQuestions: [roleQ("Did anyone report to you?", "leadership")] }) },
      { id: "b", result: result("b", { roleQuestions: [roleQ("Did anyone report to you?", "leadership")] }) },
    ];
    expect(pickBudget({ items, weights: new Map(), asked: new Set() })).toHaveLength(2);
  });

  it("asks worth-adding questions only when no other question is left", () => {
    const lead = (n: number) => roleQ(`Did anyone report to you ${n}?`, "leadership");
    const tier1 = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, result: result(`r${i}`, { bullets: [grade(`b${i}`, 70)], questions: [lineQ(`b${i}`, `Line ${i}?`)] }) }));
    const tier2 = Array.from({ length: 3 }, (_, i) => ({ id: `w${i}`, result: result(`w${i}`, { roleQuestions: [lead(i)] }) }));
    // By value the worth-adding questions win (40 × 3 = 120 against 30), but they still come last.
    const weights = new Map(tier2.map((t) => [t.id, 3] as [string, number]));
    const out = pickBudget({ items: [...tier2, ...tier1], weights, asked: new Set() });
    expect(out).toHaveLength(8);
    expect(out.every((b) => b.kind === "line")).toBe(true);
  });

  it("fills the rest with worth-adding questions, still in CV order", () => {
    const items = [
      { id: "a", result: result("a", { roleQuestions: [roleQ("Did anyone report to you?", "leadership")] }) },
      { id: "b", result: result("b", { bullets: [grade("b1", 50)], questions: [lineQ("b1", "What changed?")] }) },
      { id: "c", result: result("c", { roleQuestions: [roleQ("What was the role for?", "purpose")] }) },
    ];
    const two = pickBudget({ items, weights: new Map(), asked: new Set(), size: 2 });
    expect(two.map((b) => b.question.text)).toEqual(["What changed?", "What was the role for?"]);
    const all = pickBudget({ items, weights: new Map(), asked: new Set() });
    expect(all.map((b) => b.question.text)).toEqual(["Did anyone report to you?", "What changed?", "What was the role for?"]);
  });
});

describe("schemas", () => {
  it("caps a company proposal and the tools per role", () => {
    expect(CompaniesAnswerSchema.safeParse({ companies: [{ key: "acme", proposal: "x".repeat(201) }] }).success).toBe(false);
    expect(CompaniesAnswerSchema.safeParse({ companies: [{ key: "acme", proposal: null }] }).success).toBe(true);
    // A company field can hold up to 2000 characters, and its key comes back as it is.
    expect(CompaniesAnswerSchema.safeParse({ companies: [{ key: "a".repeat(1500), proposal: null }] }).success).toBe(true);
    expect(ToolsAnswerSchema.safeParse({ roles: [{ roleId: "r1", tools: Array.from({ length: 9 }, (_, i) => `T${i}`) }] }).success).toBe(false);
  });
});

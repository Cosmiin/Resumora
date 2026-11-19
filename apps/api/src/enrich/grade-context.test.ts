import { describe, expect, it } from "vitest";
import { SCORE_POLICY, buildRoleResult, fingerprint, hashText } from "@resumora/shared";
import { allSpecific, roleWith } from "./fake-model.ts";
import { gradeContext } from "./grade-context.ts";
import { GRADING_RULES, scoreSystemPrompt } from "./prompts.ts";

const long = `Coordinated external developers via Asana on UX/UI updates and checkout fixes for 5-10 client accounts, ${"x".repeat(74)}`;
const role = roleWith(["Helped with payroll.", long]);
const graded = allSpecific(role, (b, i) => {
  if (i === 0) Object.assign(b, { contribution: "partial", specificity: "missing", impact: "missing", issue: "contribution" });
  else Object.assign(b, { impact: "missing", issue: "impact" });
});
const result = buildRoleResult(role, graded, fingerprint(role, "en"));

describe("gradeContext", () => {
  it("lists each line's grade, its parts and its length", () => {
    const text = gradeContext(role, result);
    const [b1, b2] = result.bullets;
    expect(text).toContain(`${b1!.id} (grade ${b1!.score}): contribution: partial, clarity: specific, specificity: missing, impact: missing, concise: specific`);
    expect(text).toContain(`impact: missing`);
    expect(text).toContain(`${long.length} of 440 characters`);
    expect(text).toContain(b2!.id);
  });

  it("gives the role score, the line average, the grading rules and the task", () => {
    const text = gradeContext(role, result);
    expect(text).toContain(`Role score: ${result.score}. Line average: ${result.lines}.`);
    expect(text).toContain(GRADING_RULES);
    expect(text).toContain("Use the answers and the page. Keep every part at least as good as now, and write every line to reach specific on all five parts (contribution, clarity, specificity, impact, concise).");
    expect(text).toContain("A part may stay below specific only when the fact it needs is in neither the page nor the answers: never invent one. Stay within 440 characters.");
    expect(text).not.toContain("must reach at least");
  });

  it("lists only the lines asked for", () => {
    const [b1, b2] = result.bullets;
    const text = gradeContext(role, result, [b2!.id]);
    expect(text).toContain(b2!.id);
    expect(text).not.toContain(`${b1!.id} (grade`);
  });

  it("is empty without a stored result", () => {
    expect(gradeContext(role, undefined)).toBe("");
  });
});

describe("GRADING_RULES", () => {
  it("is the GRADING section of the score prompt", () => {
    expect(GRADING_RULES.startsWith("GRADING\n")).toBe(true);
    expect(scoreSystemPrompt("en")).toContain(`\n\n${GRADING_RULES}\n\nSUFFICIENCY TEST`);
  });

  it("keeps the rest of the score prompt word for word (only the grading rules and the policy line change)", () => {
    // Hashes of scoreSystemPrompt("en") and scoreSystemPrompt("ro", "en") with those two parts blanked, taken at score/10.
    const rest = (prompt: string) => hashText(prompt.replace(GRADING_RULES, "GRADING").replace(`(policy ${SCORE_POLICY})`, "(policy)"));
    expect([rest(scoreSystemPrompt("en")), rest(scoreSystemPrompt("ro", "en"))]).toEqual(REST);
  });
});

const REST = ["1puc1mislmw", "1h4jgyy8rw9"];

// score/11: the grading rules settle the cases the model read both ways between independent scores.
describe("GRADING_RULES, sharpened", () => {
  const rules = GRADING_RULES.replace(/\s+/g, " ");
  it("counts a number of people, clients or items the work served as scale, so impact is specific", () => {
    expect(rules).toContain("A number of people, clients, accounts, sites or items the work covered is scale");
  });
  it("keeps contribution specific when a concrete action follows a broad verb", () => {
    expect(rules).toContain("A broad verb followed by the concrete action, such as \"ran campaigns by setting up discount codes\", is specific");
  });
  it("leaves broad wording to specificity, not clarity or concise", () => {
    expect(rules).toContain("Broad wording is a specificity problem: it never lowers clarity or concise");
  });
  it("defines specific specificity as an object plus one more detail", () => {
    expect(rules).toContain("specific: The bullet names what was worked on (a document, system, product, process or topic) and at least one more detail");
  });
});

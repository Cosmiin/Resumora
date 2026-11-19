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
    expect(text).toContain(`${long.length} of 220 characters`);
    expect(text).toContain(b2!.id);
  });

  it("gives the role score, the line average, the grading rules and the task", () => {
    const text = gradeContext(role, result);
    expect(text).toContain(`Role score: ${result.score}. Line average: ${result.lines}.`);
    expect(text).toContain(GRADING_RULES);
    expect(text).toContain("Use the answers. Keep every part at least as good as now. Improve the parts marked partial or missing. Stay within 220 characters.");
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

  it("leaves the score prompt word for word as before the move", () => {
    // Hashes of scoreSystemPrompt("en") and scoreSystemPrompt("ro", "en") taken before GRADING_RULES was moved out
    // (policy score/9). Only the policy line has changed since.
    const asBefore = (prompt: string) => hashText(prompt.replace(`(policy ${SCORE_POLICY})`, "(policy score/9)"));
    expect([asBefore(scoreSystemPrompt("en")), asBefore(scoreSystemPrompt("ro", "en"))]).toEqual(BEFORE);
  });
});

const BEFORE = ["as0zweqyog", "1192kplo30s"];

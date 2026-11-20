import { CONCISE_CHARS, type Experience, type RoleResult } from "@resumora/shared";
import { GRADING_RULES } from "./prompts.ts";

/**
 * What a writer needs to write every line at the top grade (score/12): each line's grade and its parts, its
 * length, the role's score and line average, the rubric the grader uses, and the task. Empty without a stored result.
 */
export function gradeContext(role: Experience, result: RoleResult | undefined, ids?: readonly string[]): string {
  if (!result) return "";
  const wanted = ids ? new Set(ids) : null;
  const lines = result.bullets
    .filter((b) => !wanted || wanted.has(b.id))
    .map((b) => {
      const text = role.bullets.find((x) => x.id === b.id)?.text ?? "";
      return `- ${b.id} (grade ${b.score}): contribution: ${b.contribution}, clarity: ${b.clarity}, specificity: ${b.specificity}, impact: ${b.impact}, concise: ${b.concise}; ${text.trim().length} of ${CONCISE_CHARS.partial} characters`;
    });
  return [
    "<grades>",
    "The current grades (each part is explained in the grading rules below):",
    ...lines,
    `Role score: ${result.score ?? "none"}. Line average: ${result.lines ?? "none"}.`,
    "</grades>",
    "",
    GRADING_RULES,
    "",
    "Use the answers and the page. Keep every part at least as good as now, and write every line to reach specific on all five parts (contribution, clarity, specificity, impact, concise).",
    `A part may stay below specific only when the fact it needs is in neither the page nor the answers: never invent one. Stay within ${CONCISE_CHARS.partial} characters.`,
  ].join("\n");
}

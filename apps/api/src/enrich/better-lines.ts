import {
  fingerprint, mergeGrades, repeatKey, startsInPresentTense,
  type Change, type CheckChangesAnswer, type Experience, type Locale, type RoleResult,
} from "@resumora/shared";
import { callModel } from "../ai/call-model.ts";
import { improveBulletSystemPrompt, improveBulletUserMessage } from "./focus-prompts.ts";
import { gradeContext } from "./grade-context.ts";
import { ImproveSchema } from "./improve.ts";
import { questionLanguageReminder } from "./prompts.ts";
import { checkProposal, squash } from "./rewrite.ts";
import { gradeBullets, type ScoreDeps } from "./score.ts";

const lineOf = (change: Change) => (change.kind === "bullet" ? change.bulletId : change.id);

/**
 * For held lines with no question (owner, 25 Nov 2026): the writer sees the held line's grades and the rubric and writes
 * it again; the new text is graded, and offered only when it reaches what the line had to reach (beat its own grade, or
 * a new line the role's line average). `proposed` is the role with every change applied, `graded` its prediction.
 * Two tries per line. A line whose new versions don't make it, or whose call fails, gets nothing.
 */
export async function betterLines(
  deps: ScoreDeps, proposed: Experience, locale: Locale, stored: RoleResult, graded: RoleResult, held: readonly Change[],
): Promise<CheckChangesAnswer["better"]> {
  const pastRole = !proposed.current && proposed.endDate !== "";
  const found = await Promise.all(held.map(async (change) => {
    if (change.kind !== "bullet" && change.kind !== "new") return null;
    const lineId = lineOf(change);
    const target = change.kind === "bullet" ? stored.bullets.find((b) => b.id === lineId)?.score : stored.lines;
    if (target == null) return null;
    try {
      // Two tries: the second is told the first one's grade, so it fixes what still held it back.
      let tried = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const answer = await callModel(deps.model, {
          userId: deps.userId,
          task: "enrich_better_line",
          schema: ImproveSchema,
          system: improveBulletSystemPrompt(locale, deps.questionLanguage),
          user: `${improveBulletUserMessage(proposed, lineId)}\n\n${gradeContext(proposed, graded, [lineId])}${tried}`
            + questionLanguageReminder(locale, deps.questionLanguage),
          maxOutputTokens: 600,
        });
        if (answer.text === null) return null;
        const text = squash(answer.text);
        if (checkProposal(proposed, lineId, text) !== "ok" || (pastRole && startsInPresentTense(text, locale))) continue;
        if (proposed.bullets.some((b) => b.id !== lineId && repeatKey(b.text) === repeatKey(text))) continue;
        // Graded after every other line, so a paraphrase of another line reads as a repeat.
        const swapped = { ...proposed, bullets: proposed.bullets.map((b) => (b.id === lineId ? { ...b, text } : b)) };
        const order = { ...swapped, bullets: [...swapped.bullets.filter((b) => b.id !== lineId), swapped.bullets.find((b) => b.id === lineId)!] };
        const grade = (await gradeBullets(deps, order, locale, [lineId])).find((g) => g.id === lineId);
        if (!grade || grade.duplicateOf !== null || !grade.meaningful) continue;
        const after = mergeGrades(swapped, graded, [grade], fingerprint(swapped, locale)).bullets.find((b) => b.id === lineId)?.score;
        if (after !== undefined && (change.kind === "bullet" ? after > target : after >= target)) return { changeId: change.id, text };
        tried = `\n\nA first try, ${JSON.stringify(text)}, graded ${after ?? "?"} (contribution: ${grade.contribution}, clarity: ${grade.clarity}, specificity: ${grade.specificity}, impact: ${grade.impact}, concise: ${grade.concise ?? "specific"}); the line must grade above ${target}. Fix what held it back.`;
      }
      return null;
    } catch (err) {
      console.error(JSON.stringify({ msg: "better line failed", error: String(err) }));
      return null;
    }
  }));
  return found.filter((b) => b !== null);
}

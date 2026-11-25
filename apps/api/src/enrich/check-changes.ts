import {
  applyChanges, findScored, fingerprint, mergeGrades,
  type Change, type CheckChangesAnswer, type CheckChangesBody, type Experience, type ModelCoverage, type RoleResult,
} from "@resumora/shared";
import { ApiError } from "../errors.ts";
import { betterLines } from "./better-lines.ts";
import { gradeWithCoverage, scoreRole, type ScoreDeps } from "./score.ts";

/**
 * Fresh marks that never lower one stored as shown (score/10). The path only adds facts from the person's answers, or
 * merges lines keeping every number, so a mark that falls from shown is the grader reading the same text differently.
 */
function keepShown(stored: RoleResult, fresh: ModelCoverage | undefined): ModelCoverage | undefined {
  const before = stored.coverage?.marks;
  if (!fresh || !before) return fresh;
  return Object.fromEntries(Object.entries(fresh).map(([k, mark]) => [k, before[k as keyof typeof before] === "shown" ? "shown" : mark])) as ModelCoverage;
}

/** The predicted result for `role`: fresh grades for the graded lines, stored ones for the rest. */
const predict = (role: Experience, locale: Parameters<typeof fingerprint>[1], stored: RoleResult, graded: Parameters<typeof mergeGrades>[2], coverage: Parameters<typeof mergeGrades>[4]) =>
  mergeGrades(role, stored, graded.filter((g) => role.bullets.some((b) => b.id === g.id)), fingerprint(role, locale), coverage);

/**
 * POST /v1/enrich/check-changes (score/9). Applies the changes to the saved role, grades only the lines whose text
 * changed (and lines stored as repeats, whose original may be gone), and re-reads the role's marks. With `hold`, a line
 * change that doesn't raise its line's grade, or a new line below the role's line average, is held and left out of the
 * prediction. A role-wide mark stored as shown stays shown. The predicted result is stored as pending under the new
 * fingerprint, so the score after saving costs no model call. Removals, reorders and descriptions are never held.
 */
export async function checkChanges(deps: ScoreDeps, body: CheckChangesBody): Promise<CheckChangesAnswer> {
  const { content } = await deps.cv.get();
  const found = findScored(content, body.roleId);
  if (!found || found.kind === "project" || fingerprint(found.item, content.locale) !== body.fingerprint) {
    throw new ApiError(409, "not_saved", "Your latest changes aren't saved yet. Try again in a moment.");
  }
  const role = found.item;
  const locale = content.locale;
  const stored = await scoreRole(deps, { roleId: role.id, fingerprint: body.fingerprint });

  const proposed = applyChanges(role, body.changes);
  const saved = new Map(role.bullets.map((b) => [b.id, b.text]));
  const repeats = new Set(stored.bullets.filter((b) => b.issue === "duplicate").map((b) => b.id));
  const toGrade = proposed.bullets.filter((b) => saved.get(b.id) !== b.text || repeats.has(b.id)).map((b) => b.id);

  let result: RoleResult;
  let kept: Change[] = [...body.changes];
  const held: Change[] = [];
  const asks: CheckChangesAnswer["asks"] = [];
  let better: CheckChangesAnswer["better"] = [];
  let ungradedKept = false;
  if (toGrade.length === 0 && proposed.description === role.description) {
    result = predict(proposed, locale, stored, [], undefined);
  } else {
    const first = await gradeWithCoverage(deps, proposed, locale, toGrade);
    // A changed line the grader left out: its change is held (the line stays as it was), so no guess reaches the CV.
    const graded = new Set(first.bullets.map((b) => b.id));
    const missing = new Set(toGrade.filter((id) => !graded.has(id)));
    const ungraded = (change: Change) => missing.has(change.kind === "bullet" ? change.bulletId : change.id);
    const firstResult = predict(proposed, locale, stored, first.bullets, keepShown(stored, first.coverage));
    if (body.hold) {
      const scoreOf = (r: RoleResult, id: string) => r.bullets.find((b) => b.id === id)?.score;
      for (const change of body.changes) {
        if (ungraded(change)) {
          held.push(change);
          continue;
        }
        const after = change.kind === "bullet" ? scoreOf(firstResult, change.bulletId) : change.kind === "new" ? scoreOf(firstResult, change.id) : undefined;
        if (after === undefined) continue;
        if (change.kind === "bullet") {
          // A rewritten line must beat its own grade.
          const before = scoreOf(stored, change.bulletId);
          if (before !== undefined && after <= before) held.push(change);
        } else if (stored.lines != null && after < stored.lines) {
          // A new line must reach the role's line average.
          held.push(change);
        }
      }
      kept = body.changes.filter((c) => !held.includes(c));
      // Each held line's own question from this grading: the fact that would bring it to the top grade (score/12).
      for (const change of held) {
        const lineId = change.kind === "bullet" ? change.bulletId : change.id;
        const q = firstResult.questions.find((x) => x.bulletId === lineId);
        if (q) asks.push({ changeId: change.id, text: q.text, options: q.options, ...(q.amounts ? { amounts: q.amounts } : {}) });
      }
      // The rest, including lines the grader left out: a better version, offered before the scores (owner, 25 Nov 2026).
      better = await betterLines(deps, proposed, locale, stored, firstResult, held.filter((c) => !asks.some((a) => a.changeId === c.id)));
    }
    ungradedKept = kept.some(ungraded);
    if (held.length === 0) {
      result = firstResult;
    } else {
      const final = applyChanges(role, kept);
      const keptGraded = first.bullets.filter((g) => final.bullets.some((b) => b.id === g.id && (saved.get(b.id) !== b.text || repeats.has(b.id))));
      const changedPage = keptGraded.length > 0 || final.description !== role.description;
      // Without the held lines the page reads differently: re-read the marks only (no line graded twice).
      const marks = changedPage ? keepShown(stored, (await gradeWithCoverage(deps, final, locale, [])).coverage) : undefined;
      result = predict(final, locale, stored, keptGraded, marks);
    }
  }
  // Without hold, a change to a line the grader left out still goes on the CV: no prediction is stored for it, so the
  // normal score runs after saving instead of trusting the old line's grade.
  if (!ungradedKept) await deps.insights.putPending(role.id, result);
  return { result, kept: kept.map((c) => c.id), held, asks, better };
}

import { isRoleSection, scoredItems, stepItems, type CvContent, type JobExtraction, type MatchScore, type TailorRun, type TailorSection } from "@resumora/shared";
import type { ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError, type LogFn } from "../errors.ts";
import { mergeStep, scoreTailored, type AcceptBody, type ItemReview } from "./accept.ts";
import { layoutProposals } from "./layout-pass.ts";
import type { TailorRepo } from "./repo.ts";
import { passProposals } from "./section-pass.ts";
import { jobNotFound } from "./start.ts";

/** How many times a step saves when other steps keep saving the tailored CV first. */
const MAX_SAVES = 5;
const NO_CHOICES: AcceptBody = { decisions: [], inferred: [], flags: [] };
const HEADLINE_WAITS: AcceptBody = { ...NO_CHOICES, decisions: [{ itemId: "headline", keep: false }] };

/**
 * The Base CV without the notes an earlier yes left on roles the person no longer ticks. A gap question's answer is
 * kept as a note on each role ticked, and notes are only ever added: when the answer changes, the role that lost its
 * tick still has the note. The writer must not read it as a fact, so it is left out for this run.
 */
function withoutWithdrawn(cv: CvContent, run: TailorRun): CvContent {
  const answers = new Map((run.answers ?? []).map((answer) => [answer.questionId, answer]));
  // Each answered gap question, by its wording (a note carries the question's text), with the roles ticked now.
  const ticked = new Map((run.questions ?? []).flatMap((question) => {
    const answer = answers.get(question.id);
    return question.scope === "all" && answer ? [[question.text, new Set(answer.roleIds ?? [])] as const] : [];
  }));
  if (ticked.size === 0) return cv;
  const copy = structuredClone(cv);
  for (const { item } of scoredItems(copy)) {
    item.notes = item.notes.filter((note) => note.jobId !== run.jobId || !ticked.has(note.question) || ticked.get(note.question)!.has(item.id));
  }
  return copy;
}

/**
 * One step made and written straight into the tailored CV: its proposals as the step-by-step routes make them, the
 * ones that pass the checks applied as an accept with no choices would apply them. Any step of the run, in any order,
 * and several at once: the save carries the CV's version, and a step that finds another saved first reads the CV
 * again and applies its changes to that. Nothing is scored (the CV is marked as edited since its last score) and the
 * run stays where it is; the finish request scores once.
 */
export async function writeStep(
  deps: { model: ModelDeps; tailor: TailorRepo; cv: CvRepo; now(): Date; log?: LogFn },
  input: { userId: string; run: TailorRun; job: JobExtraction; cv: CvContent; section: TailorSection; roleId?: string },
): Promise<{ changed: number; removed: number }> {
  const { run, section } = input;
  if (run.status === "done" || !run.sections.includes(section)) {
    throw new ApiError(409, "section_not_current", "This step isn't part of this run.");
  }
  // A role step names its item: any item of the run, whatever step the run stands on.
  const roleId = isRoleSection(section) ? input.roleId ?? null : null;
  if (isRoleSection(section) && (!roleId || !(run.roleOrder ?? []).includes(roleId) || !stepItems(input.cv, section).some((item) => item.id === roleId))) {
    throw new ApiError(409, "role_not_current", "This role isn't part of this run.");
  }
  const made = section === "layout" ? { proposals: await layoutProposals(deps, { ...input, fromBase: true }), removed: 0 }
    : await passProposals(deps, { userId: input.userId, run, job: input.job, cv: withoutWithdrawn(input.cv, run), section, roleId });

  for (let save = 0; save < MAX_SAVES; save++) {
    const doc = run.tailoredCvId ? await deps.tailor.readTailoredCv(run.tailoredCvId) : null;
    if (!doc) throw jobNotFound();
    // A role written again starts from its Base wording, so writing a step twice gives the same CV as writing it once.
    const merged = await mergeStep(deps, { run, job: input.job, section, roleId, body: section === "layout" ? HEADLINE_WAITS : NO_CHOICES, doc, proposals: made.proposals, fromBase: true });
    // The headline is the person's own choice on the final page: proposed here, not applied and not yet decided.
    const headline = section === "layout" ? (merged.review.layout as Record<string, ItemReview> | undefined)?.headline : undefined;
    if (headline) headline.reviewed = false;
    const saved = await deps.tailor.saveTailoredCv(doc.id, doc.version, { content: merged.content, review: merged.review, score: doc.score, scoreStale: true });
    if (saved === "ok") return { changed: merged.changed, removed: made.removed };
  }
  throw new ApiError(409, "version_conflict", "This tailored CV was saved somewhere else first.");
}

/**
 * Ends a run whose steps were written straight into the tailored CV: scores the CV once as it stands, saves the score
 * (the CV is up to date with it again) and marks the run done. Asked again for a run already done, it answers with
 * the score the CV has, without scoring a second time.
 */
export async function finishRun(
  deps: { model: ModelDeps; tailor: TailorRepo },
  input: { userId: string; run: TailorRun; job: JobExtraction },
): Promise<{ run: TailorRun; score: MatchScore }> {
  const { run } = input;
  const doc = run.tailoredCvId ? await deps.tailor.readTailoredCv(run.tailoredCvId) : null;
  if (!doc) throw jobNotFound();
  if (run.status === "done" && doc.score) return { run, score: doc.score };
  const score = await scoreTailored(deps, { userId: input.userId, cv: doc, job: input.job });
  // A step saved while the score was being worked out is not in it: the run stays open and the caller finishes again.
  if ((await deps.tailor.readTailoredCv(doc.id))?.version !== doc.version) {
    throw new ApiError(409, "version_conflict", "This tailored CV was saved somewhere else first.");
  }
  await deps.tailor.saveScore(run.jobId, "tailored", doc.id, score);
  const done = await deps.tailor.updateRun(run.id, { status: "done", currentSection: null, currentRoleId: null });
  if (!done) throw jobNotFound();
  return { run: done, score };
}

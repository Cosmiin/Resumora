import { runItems, runSections, scoredItems, type CvContent, type MatchScore, type TailorRun } from "@resumora/shared";
import { ApiError } from "../errors.ts";
import type { TailorRepo } from "./repo.ts";

type Scored = Pick<CvContent, "experience" | "projects" | "volunteering">;

/**
 * True when a tailored CV was made from a Base CV that has since been replaced (the CV was removed and a new one
 * imported or typed in): none of its roles, projects or volunteering roles is in the current Base CV any more.
 * Every tailoring step works on the Base CV's item ids, so such a copy's runs can't go on.
 * An emptied Base CV (no items) is not a replacement: there is nothing to tailor from yet.
 */
export function fromOtherBaseCv(tailored: Scored, base: Scored): boolean {
  const baseIds = new Set(scoredItems(base).map(({ item }) => item.id));
  if (baseIds.size === 0) return false;
  return !scoredItems(tailored).some(({ item }) => baseIds.has(item.id));
}

export const baseCvChanged = () =>
  new ApiError(409, "base_cv_changed", "Your CV was replaced since this job was tailored. Start tailoring again.");

/** A step of a run whose tailored CV came from a replaced Base CV is refused (409 base_cv_changed). */
export async function ensureSameBaseCv(deps: { tailor: TailorRepo }, run: TailorRun, base: CvContent): Promise<void> {
  const doc = run.tailoredCvId ? await deps.tailor.getTailoredCv(run.tailoredCvId) : null;
  if (doc && fromOtherBaseCv(doc.content, base)) throw baseCvChanged();
}

/**
 * Starts the job's tailored CV again from the current Base CV: its content goes back to the Base wording with no
 * review, its score to the job's new Score 1 (worked out again for the new CV when `rescoreBase` is given; marked out
 * of date), and a new run over every step begins. The job, the copy's language, template and steering stay.
 */
export async function restartFromBase(
  deps: { tailor: TailorRepo; rescoreBase?(base: CvContent): Promise<MatchScore | null> },
  input: { jobId: string; tailoredCvId: string; base: CvContent },
): Promise<TailorRun> {
  const { jobId, tailoredCvId, base } = input;
  const doc = await deps.tailor.getTailoredCv(tailoredCvId);
  if (!doc) throw new ApiError(404, "job_not_found", "This job was deleted.");
  const score = (deps.rescoreBase ? await deps.rescoreBase(base) : null) ?? await deps.tailor.getScore(jobId, "base");
  if (await deps.tailor.saveTailoredCv(doc.id, doc.version, { content: base, review: {}, score, scoreStale: true }) === "conflict") {
    throw new ApiError(409, "version_conflict", "This tailored CV was saved somewhere else first.");
  }
  const sections = runSections(base);
  return deps.tailor.createRun({ jobId, tailoredCvId, kind: "tailor", sections, currentSection: sections[0]!, ...runItems(base, sections) });
}

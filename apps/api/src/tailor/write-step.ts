import { isRoleSection, stepItems, type CvContent, type JobExtraction, type TailorRun, type TailorSection } from "@resumora/shared";
import type { ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError, type LogFn } from "../errors.ts";
import { mergeStep, type AcceptBody } from "./accept.ts";
import { layoutProposals } from "./layout-pass.ts";
import type { TailorRepo } from "./repo.ts";
import { passProposals } from "./section-pass.ts";
import { jobNotFound } from "./start.ts";

/** How many times a step saves when other steps keep saving the tailored CV first. */
const MAX_SAVES = 5;
const NO_CHOICES: AcceptBody = { decisions: [], inferred: [], flags: [] };

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
  const made = section === "layout" ? { proposals: await layoutProposals(deps, input), removed: 0 }
    : await passProposals(deps, { userId: input.userId, run, job: input.job, cv: input.cv, section, roleId });

  for (let save = 0; save < MAX_SAVES; save++) {
    const doc = run.tailoredCvId ? await deps.tailor.readTailoredCv(run.tailoredCvId) : null;
    if (!doc) throw jobNotFound();
    // A role written again starts from its Base wording, so writing a step twice gives the same CV as writing it once.
    const merged = await mergeStep(deps, { run, job: input.job, section, roleId, body: NO_CHOICES, doc, proposals: made.proposals, fromBase: true });
    const saved = await deps.tailor.saveTailoredCv(doc.id, doc.version, { content: merged.content, review: merged.review, score: doc.score, scoreStale: true });
    if (saved === "ok") return { changed: merged.changed, removed: made.removed };
  }
  throw new ApiError(409, "version_conflict", "This tailored CV was saved somewhere else first.");
}

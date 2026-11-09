import { z } from "zod";
import { runItems, runSections, TAILOR_SECTIONS, TailorSectionSchema, type Steering, type TailorRun } from "@resumora/shared";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import type { TailorRepo } from "./repo.ts";
import { jobNotFound } from "./start.ts";

export const RetailorBodySchema = z.object({ sections: z.array(TailorSectionSchema).min(1).max(TAILOR_SECTIONS.length * 2) });

/**
 * A new run over only the picked sections of an existing tailored CV, in the usual section order. It uses the
 * same question, pass and accept routes; accept only writes its own section's items, so the rest stays as it is.
 * null when the tailored CV is gone.
 */
export async function startRetailor(
  deps: { jobs: JobRepo; tailor: TailorRepo },
  tailoredCvId: string,
  picked: z.infer<typeof RetailorBodySchema>["sections"],
): Promise<{ run: TailorRun } | null> {
  const doc = await deps.tailor.readTailoredCv(tailoredCvId);
  if (!doc) return null;
  const job = await deps.jobs.get(doc.jobId);
  if (!job) throw jobNotFound();
  if (job.status !== "ready" || !job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
  const sections = runSections(doc.content, picked);
  if (sections.length === 0) throw new ApiError(400, "invalid_content", "This CV has nothing to tailor in those steps.");
  const run = await deps.tailor.createRun({
    jobId: doc.jobId, tailoredCvId, kind: sections.length === 1 ? "section" : "retailor", sections, currentSection: sections[0]!,
    ...runItems(doc.content, sections),
  });
  return { run };
}

/**
 * Changing the steering redoes everything (owner decision): the new steering is stored, the tailored CV goes
 * back to the Base wording (so no step keeps the old steering's text), and a new run over the same steps
 * starts with this run's questions and answers, so nothing is asked twice.
 */
export async function restartWithSteering(
  deps: { tailor: TailorRepo; cv: CvRepo },
  run: TailorRun,
  steering: Steering,
): Promise<{ run: TailorRun }> {
  const doc = run.tailoredCvId ? await deps.tailor.readTailoredCv(run.tailoredCvId) : null;
  if (!doc) throw jobNotFound();
  const base = (await deps.cv.get()).content;
  // Back to the Base wording with no review: every step is accepted again. Until then the score is Score 1.
  const score = await deps.tailor.getScore(run.jobId, "base");
  if (await deps.tailor.saveTailoredCv(doc.id, doc.version, { content: base, review: {}, score }) === "conflict") {
    throw new ApiError(409, "version_conflict", "This tailored CV was saved somewhere else first.");
  }
  // Stored only once the reset went through, so a conflict leaves the old steering with the old wording.
  if (!(await deps.tailor.setSteering(doc.id, steering))) throw jobNotFound();
  // Every step, whatever the old run covered: a re-tailor of one section would otherwise leave the rest at Base.
  const sections = runSections(base);
  const created = await deps.tailor.createRun({
    jobId: run.jobId, tailoredCvId: doc.id, kind: "retailor", sections, currentSection: sections[0]!,
    ...runItems(base, sections),
  });
  // Flag questions belonged to the old proposals; the person's own answers carry over.
  const questions = (run.questions ?? []).filter((question) => question.kind !== "flag");
  const ids = new Set(questions.map((question) => question.id));
  const answers = (run.answers ?? []).filter((answer) => ids.has(answer.questionId));
  return { run: await deps.tailor.updateRun(created.id, { questions, answers }) ?? created };
}

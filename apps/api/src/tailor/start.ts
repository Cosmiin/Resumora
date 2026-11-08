import { TAILOR_SECTIONS, type TailorLanguage, type TailorRun, type Tone } from "@resumora/shared";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import { detectAdLanguage } from "./language.ts";
import type { TailorRepo } from "./repo.ts";

export const jobNotFound = () => new ApiError(404, "job_not_found", "This job was deleted.");

export type StartResult = { run: TailorRun; tailoredCvId: string; language: TailorLanguage };

/**
 * Starts tailoring a ready job, or returns the job's existing document in that language with its newest run.
 * The unique (job_id, language) row makes a second start at the same moment reuse the first document.
 */
export async function startTailoring(
  deps: { jobs: JobRepo; cv: CvRepo; tailor: TailorRepo; now(): Date },
  jobId: string,
  input: { tone: Tone; instruction: string | null },
): Promise<StartResult> {
  const job = await deps.jobs.get(jobId);
  if (!job) throw jobNotFound();
  if (job.status !== "ready" || !job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
  const base = (await deps.cv.get()).content;
  const adText = [job.extracted.summary, ...job.extracted.responsibilities].filter(Boolean).join("\n");
  const language = detectAdLanguage(adText) ?? base.locale;

  let tailoredCvId = await deps.tailor.findTailoredCvId(jobId, language);
  if (!tailoredCvId) {
    const created = await deps.tailor.createTailoredCv({
      jobId, language, content: base, baseSnapshotAt: deps.now().toISOString(), tone: input.tone, instruction: input.instruction,
    });
    if (created !== "exists") {
      const run = await deps.tailor.createRun({ jobId, tailoredCvId: created, kind: "tailor", sections: [...TAILOR_SECTIONS], currentSection: "experience" });
      return { run, tailoredCvId: created, language };
    }
    tailoredCvId = await deps.tailor.findTailoredCvId(jobId, language);
    if (!tailoredCvId) throw new Error("tailored CV vanished after a duplicate insert");
  }
  const run = await deps.tailor.latestRun(tailoredCvId)
    ?? await deps.tailor.createRun({ jobId, tailoredCvId, kind: "tailor", sections: [...TAILOR_SECTIONS], currentSection: "experience" });
  return { run, tailoredCvId, language };
}

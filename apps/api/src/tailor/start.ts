import { DEFAULT_PREFERENCES, runItems, runSections, type Preferences, type Steering, type TailorLanguage, type TailorRun } from "@resumora/shared";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import { detectAdLanguage } from "./language.ts";
import type { TailorRepo } from "./repo.ts";

export const jobNotFound = () => new ApiError(404, "job_not_found", "This job was deleted.");

export type StartResult = { run: TailorRun; tailoredCvId: string; language: TailorLanguage };
/** The language check before tailoring: the CV's language, the ad's (null when unclear), and the one a start would use. */
export type TailorLanguages = { cv: TailorLanguage; ad: TailorLanguage | null; chosen: TailorLanguage };

type LanguageDeps = { jobs: JobRepo; cv: CvRepo; preferences?(): Promise<Preferences> };

async function readLanguages(deps: LanguageDeps, jobId: string) {
  const job = await deps.jobs.get(jobId);
  if (!job) throw jobNotFound();
  if (job.status !== "ready" || !job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
  const base = (await deps.cv.get()).content;
  const adText = [job.extracted.summary, ...job.extracted.responsibilities].filter(Boolean).join("\n");
  // The person's defaults (Account → Preferences): which language a new tailored CV starts in, and its template.
  const preferences = deps.preferences ? await deps.preferences() : DEFAULT_PREFERENCES;
  const wanted = preferences.tailoringLanguage;
  const ad = detectAdLanguage(adText);
  const chosen = wanted === "job" ? (ad ?? base.locale) : wanted === "cv" ? base.locale : wanted;
  return { base, preferences, languages: { cv: base.locale, ad, chosen } satisfies TailorLanguages };
}

/** What the language step shows before tailoring starts. Reads only; no model call. */
export async function tailorLanguages(deps: LanguageDeps, jobId: string): Promise<TailorLanguages> {
  return (await readLanguages(deps, jobId)).languages;
}

/**
 * Starts tailoring a ready job, or returns the job's existing document in that language with its newest run.
 * The unique (job_id, language) row makes a second start at the same moment reuse the first document.
 */
export async function startTailoring(
  deps: { jobs: JobRepo; cv: CvRepo; tailor: TailorRepo; now(): Date; preferences?(): Promise<Preferences> },
  jobId: string,
  steering: Steering,
  /** The language picked on the language step; absent = the person's default. */
  picked?: TailorLanguage,
): Promise<StartResult> {
  const { base, preferences, languages } = await readLanguages(deps, jobId);
  const language = picked ?? languages.chosen;

  // Experience, then Projects & volunteering, one item at a time in CV order (the step only when the CV has some).
  const sections = runSections(base);
  const items = runItems(base, sections);

  let tailoredCvId = await deps.tailor.findTailoredCvId(jobId, language);
  if (!tailoredCvId) {
    const created = await deps.tailor.createTailoredCv({
      jobId, language, content: base, baseSnapshotAt: deps.now().toISOString(),
      tone: steering.tone ?? "neutral", instruction: steering.instruction ?? null, steering,
      template: preferences.defaultTemplate,
    });
    if (created !== "exists") {
      const run = await deps.tailor.createRun({ jobId, tailoredCvId: created, kind: "tailor", sections, currentSection: sections[0]!, ...items });
      return { run, tailoredCvId: created, language };
    }
    tailoredCvId = await deps.tailor.findTailoredCvId(jobId, language);
    if (!tailoredCvId) throw new Error("tailored CV vanished after a duplicate insert");
  }
  const run = await deps.tailor.latestRun(tailoredCvId)
    ?? await deps.tailor.createRun({ jobId, tailoredCvId, kind: "tailor", sections, currentSection: sections[0]!, ...items });
  return { run, tailoredCvId, language };
}

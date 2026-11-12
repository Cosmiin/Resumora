import { StoredCvSchema, type CvContent, type JobScore, type MatchScore, type Steering, type TailoredCv, type TailorLanguage, type TailorRun, type TailorSection, type Tone } from "@resumora/shared";
import type { SaveResult } from "../cv/repo.ts";

export type ScoreTarget = "base" | "tailored";

/** A run of one of these kinds, once done, is what makes a job "tailored". */
export const TAILORING_KINDS: TailorRun["kind"][] = ["tailor", "retailor", "section"];

/** What the score answer needs from one tailored CV. */
export type ScoreCopy = { id: string; score: MatchScore | null; scoreStale: boolean };

/** True when two CV contents read the same: both go through the stored-CV schema, so key order doesn't count. */
export const sameCv = (a: unknown, b: unknown): boolean =>
  JSON.stringify(StoredCvSchema.parse(a)) === JSON.stringify(StoredCvSchema.parse(b));

/**
 * The job's scores for one tailored copy: the one named by `cvId` when it is a copy of this job,
 * otherwise the copy saved last. The tailored score is always that copy's own.
 */
export async function jobScore(tailor: TailorRepo, jobId: string, cvId?: string): Promise<JobScore> {
  const [base, copies, hasTailoredCv] = await Promise.all([
    tailor.getScore(jobId, "base"), tailor.scoreCopies(jobId), tailor.hasTailoredCv(jobId),
  ]);
  const copy = copies.find((item) => item.id === cvId) ?? copies[0];
  if (!copy) return { base, tailored: null, tailoredCvId: null, stale: false, hasTailoredCv };
  const tailored = await tailor.getScore(jobId, "tailored", copy.id) ?? copy.score;
  return { base, tailored, tailoredCvId: copy.id, stale: copy.scoreStale || !tailored, hasTailoredCv };
}

export type NewTailoredCv = {
  jobId: string;
  language: TailorLanguage;
  content: CvContent;
  baseSnapshotAt: string;
  tone: Tone;
  instruction: string | null;
  steering: Steering;
  /** The person's default template; classic when they never chose one. */
  template?: "classic" | "modern" | "compact";
};

export type NewRun = {
  jobId: string;
  tailoredCvId: string;
  kind: TailorRun["kind"];
  sections: TailorSection[];
  currentSection: TailorSection | null;
  /** Item ids of the role steps in CV order (roles, then projects, then volunteering). */
  roleOrder?: string[];
  /** The item the run starts on; absent = the first of roleOrder. */
  currentRoleId?: string | null;
};

/** Match scores, tailored CVs and tailor runs belonging to the signed-in user. */
export interface TailorRepo {
  /** Adds a score to the history. A tailored score also becomes its copy's own score and marks it up to date. */
  saveScore(jobId: string, target: ScoreTarget, tailoredCvId: string | null, score: MatchScore): Promise<void>;
  /** Latest score for the target, optionally restricted to a tailored CV. */
  getScore(jobId: string, target: ScoreTarget, tailoredCvId?: string): Promise<MatchScore | null>;
  /** The job's tailored CVs, the one saved last first, each with its own score and whether it was edited since. */
  scoreCopies(jobId: string): Promise<ScoreCopy[]>;
  /** True once a tailor, retailor or section run of the job is done. */
  hasTailoredCv(jobId: string): Promise<boolean>;
  findTailoredCvId(jobId: string, language: TailorLanguage): Promise<string | null>;
  /** The steering every tailoring step needs; `steering` already carries the tone and instruction columns. */
  getSteering(tailoredCvId: string): Promise<{ language: TailorLanguage; tone: Tone | null; instruction: string | null; steering: Steering } | null>;
  /** Replaces the steering (and its tone and instruction columns). false when gone. */
  setSteering(tailoredCvId: string, steering: Steering): Promise<boolean>;
  /** Content is also stored as the base snapshot. "exists" when the job already has one in this language. */
  createTailoredCv(input: NewTailoredCv): Promise<string | "exists">;
  /** The tailored CV's content, review state and version; null when gone. */
  getTailoredCv(id: string): Promise<StoredTailoredCv | null>;
  /** Saves when the version still matches, then bumps it. */
  saveTailoredCv(id: string, expectedVersion: number, changes: { content: CvContent; review: Review; score: MatchScore | null }): Promise<"ok" | "conflict">;
  /** The job's tailored CVs (all languages), oldest first. */
  listTailoredCvs(jobId: string): Promise<TailoredCvSummary[]>;
  /** Every tailored CV the person has, newest change first, each with whether its newest run is still open. */
  listAllTailoredCvs(): Promise<TailoredCvListItem[]>;
  /** The whole row, for the editor; null when gone. */
  readTailoredCv(id: string): Promise<TailoredCv | null>;
  /** An editor save: content only, with the version check. Changed content marks the score out of date. null when gone. */
  saveTailoredContent(id: string, expectedVersion: number, content: CvContent): Promise<SaveResult | null>;
  /** false when gone. Doesn't bump the version (the template isn't part of the edited content). */
  setTemplate(id: string, template: TailoredCv["template"]): Promise<boolean>;
  /** Replaces the cover letter (not versioned, like the template). false when gone. */
  setCoverLetter(id: string, letter: NonNullable<TailoredCv["coverLetter"]>): Promise<boolean>;
  /**
   * Creates the job's copy in `language`, or refreshes it (version + 1, review and score cleared).
   * "language_taken" when the job's CV in that language is an original, not a translation.
   */
  saveTranslation(input: NewTranslation): Promise<string | "language_taken">;
  /** Newest run of any status for the tailored CV. */
  latestRun(tailoredCvId: string): Promise<TailorRun | null>;
  createRun(input: NewRun): Promise<TailorRun>;
  getRun(id: string): Promise<TailorRun | null>;
  /** Replaces the given fields; null when the run is gone. */
  updateRun(id: string, changes: RunChanges): Promise<TailorRun | null>;
  /** The job's cached tone examples (jobs.tone_examples); null when none. */
  getToneExamples(jobId: string): Promise<ToneExamples | null>;
  saveToneExamples(jobId: string, examples: ToneExamples): Promise<void>;
}

export type Review = Record<string, unknown>;
export type NewTranslation = Pick<TailoredCv, "jobId" | "language" | "content" | "coverLetter" | "template" | "tone" | "instruction"> & {
  translatedFrom: string;
  /** Also the copy's base snapshot time: its "original wording" is the translation itself. */
  at: string;
};
export type TailoredCvSummary =Pick<TailoredCv, "id" | "language" | "translatedFrom" | "updatedAt">;
/** One row of "My CVs": `inProgress` while the CV's newest run has not finished. */
export type TailoredCvListItem = Pick<TailoredCv, "id" | "jobId" | "language" | "template" | "translatedFrom" | "updatedAt"> & { inProgress: boolean };
export type StoredTailoredCv = { id: string; jobId: string; content: CvContent; review: Review | null; version: number };

export type RunChanges = Partial<Pick<TailorRun, "questions" | "answers" | "proposals" | "status" | "currentSection" | "currentRoleId" | "errorCode">>;

/** One of the person's bullets rewritten in each tone, for the steering screen. */
export type ToneExamples = { bullet: string; examples: Record<Tone, string> };

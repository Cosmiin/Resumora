import type { CvContent, MatchScore, Steering, TailoredCv, TailorLanguage, TailorRun, TailorSection, Tone } from "@resumora/shared";
import type { SaveResult } from "../cv/repo.ts";

export type ScoreTarget = "base" | "tailored";

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
  saveScore(jobId: string, target: ScoreTarget, tailoredCvId: string | null, score: MatchScore): Promise<void>;
  /** Latest score for the target, optionally restricted to a tailored CV. */
  getScore(jobId: string, target: ScoreTarget, tailoredCvId?: string): Promise<MatchScore | null>;
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
  /** The whole row, for the editor; null when gone. */
  readTailoredCv(id: string): Promise<TailoredCv | null>;
  /** An editor save: content only, with the version check. null when gone. */
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
export type StoredTailoredCv = { id: string; jobId: string; content: CvContent; review: Review | null; version: number };

export type RunChanges = Partial<Pick<TailorRun, "questions" | "answers" | "proposals" | "status" | "currentSection" | "currentRoleId" | "errorCode">>;

/** One of the person's bullets rewritten in each tone, for the steering screen. */
export type ToneExamples = { bullet: string; examples: Record<Tone, string> };

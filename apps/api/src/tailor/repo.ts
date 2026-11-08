import type { CvContent, MatchScore, TailorLanguage, TailorRun, TailorSection, Tone } from "@resumora/shared";

export type ScoreTarget = "base" | "tailored";

export type NewTailoredCv = {
  jobId: string;
  language: TailorLanguage;
  content: CvContent;
  baseSnapshotAt: string;
  tone: Tone;
  instruction: string | null;
};

export type NewRun = {
  jobId: string;
  tailoredCvId: string;
  kind: TailorRun["kind"];
  sections: TailorSection[];
  currentSection: TailorSection | null;
};

/** Match scores, tailored CVs and tailor runs belonging to the signed-in user. */
export interface TailorRepo {
  saveScore(jobId: string, target: ScoreTarget, tailoredCvId: string | null, score: MatchScore): Promise<void>;
  /** Latest score for the target, optionally restricted to a tailored CV. */
  getScore(jobId: string, target: ScoreTarget, tailoredCvId?: string): Promise<MatchScore | null>;
  findTailoredCvId(jobId: string, language: TailorLanguage): Promise<string | null>;
  /** Content is also stored as the base snapshot. "exists" when the job already has one in this language. */
  createTailoredCv(input: NewTailoredCv): Promise<string | "exists">;
  /** Newest run of any status for the tailored CV. */
  latestRun(tailoredCvId: string): Promise<TailorRun | null>;
  createRun(input: NewRun): Promise<TailorRun>;
  getRun(id: string): Promise<TailorRun | null>;
  /** Replaces the given fields; null when the run is gone. */
  updateRun(id: string, changes: RunChanges): Promise<TailorRun | null>;
}

export type RunChanges = Partial<Pick<TailorRun, "questions" | "answers" | "proposals" | "status" | "currentSection" | "errorCode">>;

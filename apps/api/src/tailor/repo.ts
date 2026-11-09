import type { MatchScore } from "@resumora/shared";

export type ScoreTarget = "base" | "tailored";

/** Match scores belonging to the signed-in user. */
export interface TailorRepo {
  saveScore(jobId: string, target: ScoreTarget, tailoredCvId: string | null, score: MatchScore): Promise<void>;
  /** Latest score for the target, optionally restricted to a tailored CV. */
  getScore(jobId: string, target: ScoreTarget, tailoredCvId?: string): Promise<MatchScore | null>;
}

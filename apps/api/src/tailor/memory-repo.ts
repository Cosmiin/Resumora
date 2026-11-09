import type { CvContent, MatchScore } from "@resumora/shared";
import type { ScoreTarget, TailorRepo } from "./repo.ts";

export type MemoryTailorStore = Map<string, {
  userId: string;
  jobId: string;
  target: ScoreTarget;
  tailoredCvId: string | null;
  score: MatchScore;
}>;

export function memoryTailorRepo(userId: string, store: MemoryTailorStore = new Map()): TailorRepo {
  return {
    async saveScore(jobId, target, tailoredCvId, score) {
      const key = JSON.stringify([userId, jobId, target, tailoredCvId]);
      store.delete(key);
      store.set(key, { userId, jobId, target, tailoredCvId, score: structuredClone(score) });
    },
    async getScore(jobId, target, tailoredCvId) {
      const row = [...store.values()].reverse().find((row) =>
        row.userId === userId && row.jobId === jobId && row.target === target
        && (tailoredCvId === undefined || row.tailoredCvId === tailoredCvId));
      return row ? structuredClone(row.score) : null;
    },
  };
}

/** In-memory equivalent of the queue's current-CV and base-score access. */
export function memoryTailorAdmin(baseCvs: Map<string, CvContent>, store: MemoryTailorStore = new Map()) {
  return {
    async baseCv(userId: string): Promise<CvContent | null> {
      const cv = baseCvs.get(userId);
      return cv ? structuredClone(cv) : null;
    },
    tailorRepo(userId: string) {
      const repo = memoryTailorRepo(userId, store);
      return {
        getScore: (jobId: string) => repo.getScore(jobId, "base"),
        saveScore: (jobId: string, score: MatchScore) => repo.saveScore(jobId, "base", null, score),
      };
    },
  };
}

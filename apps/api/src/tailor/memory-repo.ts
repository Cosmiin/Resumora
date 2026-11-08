import type { MatchScore } from "@resumora/shared";
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

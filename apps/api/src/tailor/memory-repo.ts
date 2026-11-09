import type { CvContent, MatchScore, TailorRun, TailoredCv } from "@resumora/shared";
import type { ScoreTarget, TailorRepo } from "./repo.ts";

export type MemoryTailorDocs = {
  cvs: Map<string, Pick<TailoredCv, "id" | "userId" | "jobId" | "language" | "content" | "baseSnapshot" | "baseSnapshotAt"
    | "tone" | "instruction" | "review" | "score" | "version">>;
  runs: Map<string, TailorRun>;
};
export const memoryTailorDocs = (): MemoryTailorDocs => ({ cvs: new Map(), runs: new Map() });

export type MemoryTailorStore = Map<string, {
  userId: string;
  jobId: string;
  target: ScoreTarget;
  tailoredCvId: string | null;
  score: MatchScore;
}>;

export function memoryTailorRepo(userId: string, store: MemoryTailorStore = new Map(), docs = memoryTailorDocs()): TailorRepo {
  const ownRun = (run: TailorRun | undefined) => (run && run.userId === userId ? structuredClone(run) : null);
  return {
    async findTailoredCvId(jobId, language) {
      return [...docs.cvs.values()].find((cv) => cv.userId === userId && cv.jobId === jobId && cv.language === language)?.id ?? null;
    },
    async getSteering(tailoredCvId) {
      const cv = docs.cvs.get(tailoredCvId);
      return cv && cv.userId === userId ? { language: cv.language, tone: cv.tone, instruction: cv.instruction } : null;
    },
    async createTailoredCv(input) {
      if ([...docs.cvs.values()].some((cv) => cv.jobId === input.jobId && cv.language === input.language)) return "exists";
      const id = crypto.randomUUID();
      docs.cvs.set(id, { id, userId, jobId: input.jobId, language: input.language, content: structuredClone(input.content),
        baseSnapshot: structuredClone(input.content), baseSnapshotAt: input.baseSnapshotAt, tone: input.tone, instruction: input.instruction,
        review: null, score: null, version: 1 });
      return id;
    },
    async getTailoredCv(id) {
      const cv = docs.cvs.get(id);
      return cv && cv.userId === userId
        ? structuredClone({ id: cv.id, jobId: cv.jobId, content: cv.content, review: cv.review, version: cv.version }) : null;
    },
    async saveTailoredCv(id, expectedVersion, changes) {
      const cv = docs.cvs.get(id);
      if (!cv || cv.userId !== userId || cv.version !== expectedVersion) return "conflict";
      Object.assign(cv, structuredClone(changes), { version: cv.version + 1 });
      return "ok";
    },
    async latestRun(tailoredCvId) {
      return ownRun([...docs.runs.values()].reverse().find((run) => run.tailoredCvId === tailoredCvId && run.userId === userId));
    },
    async createRun(input) {
      const now = new Date().toISOString();
      const run: TailorRun = { id: crypto.randomUUID(), userId, jobId: input.jobId, tailoredCvId: input.tailoredCvId,
        kind: input.kind, sections: [...input.sections], status: "running", currentSection: input.currentSection,
        questions: null, answers: null, proposals: null, errorCode: null, createdAt: now, updatedAt: now };
      docs.runs.set(run.id, run);
      return structuredClone(run);
    },
    async getRun(id) {
      return ownRun(docs.runs.get(id));
    },
    async updateRun(id, changes) {
      const run = docs.runs.get(id);
      if (!run || run.userId !== userId) return null;
      Object.assign(run, structuredClone(changes), { updatedAt: new Date().toISOString() });
      return structuredClone(run);
    },
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

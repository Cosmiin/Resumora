import type { CvContent, MatchScore, Steering, TailorRun, TailoredCv } from "@resumora/shared";
import type { ScoreTarget, TailorRepo, ToneExamples } from "./repo.ts";
import { withColumns } from "./steering.ts";

export type MemoryTailorDocs = {
  cvs: Map<string, TailoredCv>;
  runs: Map<string, TailorRun>;
  /** tailored_cvs.steering, by tailored CV id. */
  steering: Map<string, Steering>;
  /** jobs.tone_examples, by job id. */
  toneExamples: Map<string, ToneExamples>;
};
export const memoryTailorDocs = (): MemoryTailorDocs => ({ cvs: new Map(), runs: new Map(), steering: new Map(), toneExamples: new Map() });

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
      return cv && cv.userId === userId ? { language: cv.language, tone: cv.tone, instruction: cv.instruction,
        steering: withColumns(structuredClone(docs.steering.get(tailoredCvId) ?? {}), cv.tone, cv.instruction) } : null;
    },
    async setSteering(tailoredCvId, steering) {
      const cv = docs.cvs.get(tailoredCvId);
      if (!cv || cv.userId !== userId) return false;
      Object.assign(cv, { tone: steering.tone ?? "neutral", instruction: steering.instruction ?? null });
      docs.steering.set(tailoredCvId, structuredClone(steering));
      return true;
    },
    async createTailoredCv(input) {
      if ([...docs.cvs.values()].some((cv) => cv.jobId === input.jobId && cv.language === input.language)) return "exists";
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      docs.cvs.set(id, { id, userId, jobId: input.jobId, language: input.language, translatedFrom: null, content: structuredClone(input.content),
        baseSnapshot: structuredClone(input.content), baseSnapshotAt: input.baseSnapshotAt, template: "classic", tone: input.tone,
        instruction: input.instruction, review: null, score: null, coverLetter: null, version: 1, createdAt: now, updatedAt: now });
      docs.steering.set(id, structuredClone(input.steering));
      return id;
    },
    async listTailoredCvs(jobId) {
      return [...docs.cvs.values()].filter((cv) => cv.userId === userId && cv.jobId === jobId)
        .map(({ id, language, translatedFrom, updatedAt }) => ({ id, language, translatedFrom, updatedAt }));
    },
    async readTailoredCv(id) {
      const cv = docs.cvs.get(id);
      return cv && cv.userId === userId ? structuredClone(cv) : null;
    },
    async saveTailoredContent(id, expectedVersion, content) {
      const cv = docs.cvs.get(id);
      if (!cv || cv.userId !== userId) return null;
      if (cv.version !== expectedVersion) return { ok: false, version: cv.version, updatedAt: cv.updatedAt };
      Object.assign(cv, { content: structuredClone(content), version: cv.version + 1, updatedAt: new Date().toISOString() });
      return { ok: true, version: cv.version, updatedAt: cv.updatedAt };
    },
    async saveTranslation(input) {
      const fields = { translatedFrom: input.translatedFrom, content: structuredClone(input.content), baseSnapshot: structuredClone(input.content),
        baseSnapshotAt: input.at, coverLetter: structuredClone(input.coverLetter), template: input.template, tone: input.tone,
        instruction: input.instruction, review: null, score: null, updatedAt: input.at };
      const existing = [...docs.cvs.values()].find((cv) => cv.jobId === input.jobId && cv.language === input.language);
      if (existing) {
        if (existing.userId !== userId || existing.translatedFrom === null) return "language_taken";
        Object.assign(existing, fields, { version: existing.version + 1 });
        return existing.id;
      }
      const id = crypto.randomUUID();
      docs.cvs.set(id, { id, userId, jobId: input.jobId, language: input.language, ...fields, version: 1, createdAt: input.at });
      return id;
    },
    async setTemplate(id, template) {
      const cv = docs.cvs.get(id);
      if (!cv || cv.userId !== userId) return false;
      Object.assign(cv, { template, updatedAt: new Date().toISOString() });
      return true;
    },
    async setCoverLetter(id, letter) {
      const cv = docs.cvs.get(id);
      if (!cv || cv.userId !== userId) return false;
      Object.assign(cv, { coverLetter: structuredClone(letter), updatedAt: new Date().toISOString() });
      return true;
    },
    async getTailoredCv(id) {
      const cv = docs.cvs.get(id);
      return cv && cv.userId === userId
        ? structuredClone({ id: cv.id, jobId: cv.jobId, content: cv.content, review: cv.review, version: cv.version }) : null;
    },
    async saveTailoredCv(id, expectedVersion, changes) {
      const cv = docs.cvs.get(id);
      if (!cv || cv.userId !== userId || cv.version !== expectedVersion) return "conflict";
      Object.assign(cv, structuredClone(changes), { version: cv.version + 1, updatedAt: new Date().toISOString() });
      return "ok";
    },
    async latestRun(tailoredCvId) {
      return ownRun([...docs.runs.values()].reverse().find((run) => run.tailoredCvId === tailoredCvId && run.userId === userId));
    },
    async createRun(input) {
      const now = new Date().toISOString();
      const run: TailorRun = { id: crypto.randomUUID(), userId, jobId: input.jobId, tailoredCvId: input.tailoredCvId,
        kind: input.kind, sections: [...input.sections], status: "running", currentSection: input.currentSection,
        questions: null, answers: null, proposals: null, errorCode: null,
        roleOrder: [...(input.roleOrder ?? [])], currentRoleId: input.roleOrder?.[0] ?? null, createdAt: now, updatedAt: now };
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
    async getToneExamples(jobId) {
      const cached = docs.toneExamples.get(jobId);
      return cached ? structuredClone(cached) : null;
    },
    async saveToneExamples(jobId, examples) {
      docs.toneExamples.set(jobId, structuredClone(examples));
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

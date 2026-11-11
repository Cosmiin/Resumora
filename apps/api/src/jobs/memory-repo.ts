import type { Job, JobListItem } from "@resumora/shared";
import { ApiError } from "../errors.ts";
import { JOBS_PER_DAY, type JobAdmin, type JobRepo } from "./repo.ts";

type Row = Job & {
  userId: string;
  urlNormalized: string;
  rawText: string;
  jsonLd: Record<string, unknown> | null;
  attempts: number;
};
type Run = { userId: string; jobId: string | null; createdAt: string };

function toListItem(row: Row): JobListItem {
  return {
    id: row.id, status: row.status, errorCode: row.errorCode,
    title: row.title, company: row.company, location: row.location,
    source: row.source, url: row.url, createdAt: row.createdAt,
    applicationStatus: row.applicationStatus, positionClosed: row.extracted?.positionClosed === true,
  };
}

/** One store behind the per-user repo and worker, mirroring the database rules. */
export function memoryJobs(opts: { now?: () => Date }) {
  const now = opts.now ?? (() => new Date());
  const rows = new Map<string, Row>();
  const runs: Run[] = [];

  const repoFor = (userId: string): JobRepo => ({
    async create(input) {
      const existing = [...rows.values()].find((row) => row.userId === userId && row.urlNormalized === input.urlNormalized);
      if (existing) return { id: existing.id, existing: true };
      if (rows.has(input.id)) throw new Error("jobs insert failed: duplicate id");
      const date = now();
      const since = new Date(date.getTime() - 24 * 60 * 60 * 1000).toISOString();
      if (runs.filter((run) => run.userId === userId && run.createdAt > since).length >= JOBS_PER_DAY) {
        throw new ApiError(429, "job_limit", `You can add up to ${JOBS_PER_DAY} jobs per day.`);
      }
      const createdAt = date.toISOString();
      rows.set(input.id, {
        ...structuredClone(input), userId, status: "queued", errorCode: null, attempts: 0,
        title: null, company: null, location: null, extracted: null, editedByUser: false,
        applicationStatus: "saved",
        version: 1, createdAt, updatedAt: createdAt,
      });
      runs.push({ userId, jobId: input.id, createdAt });
      return { id: input.id, existing: false };
    },
    async findByUrl(urlNormalized) {
      return [...rows.values()].find((row) => row.userId === userId && row.urlNormalized === urlNormalized)?.id ?? null;
    },
    async countRunsSince(iso) {
      return runs.filter((run) => run.userId === userId && run.createdAt >= iso).length;
    },
    async list({ limit, after, source }) {
      const page = [...rows.values()].filter((row) => row.userId === userId && (!source || row.source === source) && (!after
        || row.createdAt < after.createdAt || (row.createdAt === after.createdAt && row.id < after.id)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, limit + 1);
      const items = page.slice(0, limit).map(toListItem);
      const last = items.at(-1);
      return { items, next: page.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null };
    },
    async get(id) {
      const row = rows.get(id);
      if (!row || row.userId !== userId) return null;
      return {
        ...toListItem(row), rawText: row.rawText, extracted: structuredClone(row.extracted), editedByUser: row.editedByUser,
        applicationStatus: row.applicationStatus,
        version: row.version, updatedAt: row.updatedAt,
      };
    },
    async patch(id, expectedVersion, extracted, fields = {}) {
      const row = rows.get(id);
      if (!row || row.userId !== userId) return "not_found";
      if (row.status !== "ready") return "wrong_status";
      if (row.version !== expectedVersion) return "conflict";
      Object.assign(row, {
        ...(fields.applicationStatus !== undefined ? { applicationStatus: fields.applicationStatus } : {}),
        extracted: structuredClone(extracted), title: extracted.title, company: extracted.company,
        location: extracted.location,
        // Status saves resend the current extraction; only extraction edits count as user edits.
        // updatedAt follows extraction edits only: the Tailored CV's "job changed" notice compares it.
        ...(fields.applicationStatus === undefined ? { editedByUser: true, updatedAt: now().toISOString() } : {}),
        version: row.version + 1,
      });
      return "ok";
    },
    async remove(id) {
      if (rows.get(id)?.userId !== userId) return false;
      rows.delete(id);
      for (const run of runs) if (run.jobId === id) run.jobId = null;
      return true;
    },
  });

  const admin: JobAdmin = {
    async start(id) {
      // Mirror the database read before the conditional update.
      const attempts = rows.get(id)?.attempts;
      await Promise.resolve();
      const row = rows.get(id);
      if (!row || row.attempts !== attempts || (row.status !== "queued" && row.status !== "processing")) return null;
      row.status = "processing";
      row.attempts += 1;
      row.updatedAt = now().toISOString();
      return { id, userId: row.userId, rawText: row.rawText, jsonLd: structuredClone(row.jsonLd) };
    },
    async finish(id, extracted) {
      const row = rows.get(id);
      if (row) Object.assign(row, {
        status: "ready", extracted: structuredClone(extracted), errorCode: null,
        title: extracted.title, company: extracted.company, location: extracted.location, updatedAt: now().toISOString(),
      });
    },
    async fail(id, code) {
      const row = rows.get(id);
      if (row) Object.assign(row, { status: "failed", errorCode: code, updatedAt: now().toISOString() });
    },
    async logCall() {},
  };

  return { repoFor, admin, rows, runs };
}

import type { ImportResponse, ImportResult, ImportStatus } from "@resumora/shared";
import type { CvRepo } from "../cv/repo.ts";
import { IMPORT_FAILURES, type ImportFailureCode } from "./extract-text.ts";
import { storagePath, type ImportAdmin, type ImportRepo } from "./repo.ts";

type Row = {
  id: string;
  userId: string;
  fileName: string;
  storagePath: string;
  status: ImportStatus;
  error: ImportFailureCode | null;
  result: ImportResult | null;
  createdAt: string;
  attempts: number;
};

export type MemoryImports = ReturnType<typeof memoryImports>;

/** Turns a stored row into what the API returns. Shared with the Supabase repo. */
export function toResponse(row: Pick<Row, "id" | "status" | "fileName" | "error" | "result" | "createdAt">): ImportResponse {
  return {
    id: row.id,
    status: row.status,
    fileName: row.fileName,
    error: row.error ? { code: row.error, message: IMPORT_FAILURES[row.error] ?? IMPORT_FAILURES.internal } : null,
    result: row.status === "ready" ? row.result : null,
    createdAt: row.createdAt,
  };
}

/**
 * In-memory imports for tests: one store behind both the per-user repo and the consumer's admin.
 * Mirrors the SQL rules (own rows only, apply only when ready). Applying writes through the
 * user's CvRepo; the "import" history reason is covered by the pgTAP tests.
 */
export function memoryImports(opts: { now?: () => Date; cvRepo(userId: string): CvRepo }) {
  const now = opts.now ?? (() => new Date());
  const rows = new Map<string, Row>();
  const files = new Map<string, Uint8Array>();

  const repoFor = (userId: string): ImportRepo => ({
    async create({ id, fileName, format, bytes }) {
      const path = storagePath(userId, id, format);
      files.set(path, bytes);
      const row: Row = { id, userId, fileName, storagePath: path, status: "queued", error: null, result: null, createdAt: now().toISOString(), attempts: 0 };
      rows.set(id, row);
      return toResponse(row);
    },
    async get(id) {
      const row = rows.get(id);
      return row && row.userId === userId ? toResponse(row) : null;
    },
    async countSince(iso) {
      return [...rows.values()].filter((r) => r.userId === userId && r.createdAt >= iso).length;
    },
    async apply(id, expectedVersion) {
      const row = rows.get(id);
      if (!row || row.userId !== userId || row.status !== "ready" || !row.result) return null;
      const saved = await opts.cvRepo(userId).save(row.result.content, expectedVersion);
      if (saved.ok) row.status = "applied";
      return saved;
    },
  });

  const admin: ImportAdmin = {
    async start(id) {
      const row = rows.get(id);
      if (!row || (row.status !== "queued" && row.status !== "processing")) return null;
      row.status = "processing";
      row.attempts += 1;
      return { id, userId: row.userId, storagePath: row.storagePath };
    },
    async download(job) {
      const bytes = files.get(job.storagePath);
      if (!bytes) throw new Error(`file not found: ${job.storagePath}`);
      return bytes;
    },
    async finish(id, result) {
      Object.assign(rows.get(id)!, { status: "ready", result, error: null });
    },
    async fail(id, code) {
      Object.assign(rows.get(id)!, { status: "failed", error: code, result: null });
    },
    async deleteFile(job) {
      files.delete(job.storagePath);
    },
    async logCall() {},
  };

  return { repoFor, admin, files, rows };
}

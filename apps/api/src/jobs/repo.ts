import type { Job, JobErrorCode, JobExtraction, JobListItem, JobPatchBody, JobSource } from "@resumora/shared";
import type { AiCallLog } from "../ai/call-model.ts";

export const JOBS_PER_DAY = 30;
export type JobMessage = { jobId: string; userId: string };
export type JobCursor = { createdAt: string; id: string };

export function encodeJobCursor(cursor: JobCursor): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeJobCursor(value: string): JobCursor | null {
  try {
    const cursor: unknown = JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/")));
    if (!cursor || typeof cursor !== "object") return null;
    const { createdAt, id } = cursor as Record<string, unknown>;
    if (typeof createdAt !== "string" || typeof id !== "string") return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|\+00:00)$/.test(createdAt)) return null;
    if (createdAt.slice(0, 19) !== new Date(createdAt).toISOString().slice(0, 19)) return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** The signed-in user's jobs, queried as that user so RLS applies. */
export type JobRepo = {
  create(input: {
    id: string;
    source: JobSource;
    url: string;
    urlNormalized: string;
    rawText: string;
    jsonLd: Record<string, unknown> | null;
  }): Promise<{ id: string; existing: boolean }>;
  findByUrl(urlNormalized: string): Promise<string | null>;
  countRunsSince(iso: string): Promise<number>;
  list(page: { limit: number; after: JobCursor | null }): Promise<{ items: JobListItem[]; next: JobCursor | null }>;
  get(id: string): Promise<Job | null>;
  patch(id: string, expectedVersion: number, extracted: JobExtraction, fields?: Pick<JobPatchBody, "applicationStatus">): Promise<"ok" | "conflict" | "wrong_status" | "not_found">;
  remove(id: string): Promise<boolean>;
};

export type JobWork = { id: string; userId: string; rawText: string; jsonLd: Record<string, unknown> | null };

/** Service role access for the worker. Never given to request handlers. */
export type JobAdmin = {
  start(id: string): Promise<JobWork | null>;
  finish(id: string, extracted: JobExtraction): Promise<void>;
  fail(id: string, code: JobErrorCode): Promise<void>;
  logCall(entry: AiCallLog): Promise<void>;
};

import type { Job, JobErrorCode, JobExtraction, JobListItem, JobSource } from "@resumora/shared";
import type { AiCallLog } from "../ai/call-model.ts";

export const JOBS_PER_DAY = 30;
export type JobMessage = { jobId: string; userId: string };

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
  list(): Promise<JobListItem[]>;
  get(id: string): Promise<Job | null>;
  patch(id: string, expectedVersion: number, extracted: JobExtraction): Promise<"ok" | "conflict" | "wrong_status" | "not_found">;
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

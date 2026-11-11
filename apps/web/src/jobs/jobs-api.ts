import { z } from "zod";
import {
  JobListPageSchema, JobSchema, MatchScoreSchema,
  type Job, type JobExtraction, type JobListPage, type JobPatch,
} from "@resumora/shared";
import { ApiClientError, apiFetch, authedFetch, errorOf } from "../lib/api.ts";

const CreateJobResponseSchema = z.object({
  id: z.string(),
  existing: z.boolean().default(false),
});

export function listJobs(cursor?: string): Promise<JobListPage> {
  const query = cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`;
  return apiFetch(`/v1/jobs?limit=50${query}`, { schema: JobListPageSchema });
}

export function getJob(id: string): Promise<Job> {
  return apiFetch(`/v1/jobs/${encodeURIComponent(id)}`, { schema: JobSchema });
}

export function createJob(url: string, pageText: string): Promise<{ id: string; existing: boolean }> {
  return apiFetch("/v1/jobs", {
    method: "POST", json: { url, pageText, source: "link" }, schema: CreateJobResponseSchema,
  });
}

export function getJobScore(id: string) {
  return apiFetch(`/v1/jobs/${encodeURIComponent(id)}/score`, {
    schema: z.object({ base: MatchScoreSchema.nullable(), tailored: MatchScoreSchema.nullable() }),
  });
}

/** Computes Score 1 when the job has none yet (never rescores). */
export function scoreJob(id: string) {
  return apiFetch(`/v1/jobs/${encodeURIComponent(id)}/score`, {
    method: "POST", schema: z.object({ base: MatchScoreSchema.nullable(), tailored: MatchScoreSchema.nullable() }),
  });
}

export function patchJob(
  id: string, version: number, extracted: JobExtraction,
  changes: Pick<JobPatch, "applicationStatus"> = {},
): Promise<Job> {
  return apiFetch(`/v1/jobs/${encodeURIComponent(id)}`, {
    method: "PATCH", json: { version, extracted, ...changes }, schema: JobSchema,
  });
}

export async function deleteJob(id: string): Promise<void> {
  const res = await authedFetch(`/v1/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (res.status === 204) return;
  const body: unknown = await res.json().catch(() => null);
  const { code, message } = errorOf(res.status, body);
  throw new ApiClientError(res.status, code, message, body);
}

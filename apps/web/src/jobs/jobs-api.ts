import { z } from "zod";
import {
  JobListPageSchema, JobSchema,
  type Job, type JobExtraction, type JobListPage,
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
    method: "POST", json: { url, pageText }, schema: CreateJobResponseSchema,
  });
}

export function patchJob(id: string, version: number, extracted: JobExtraction): Promise<Job> {
  return apiFetch(`/v1/jobs/${encodeURIComponent(id)}`, {
    method: "PATCH", json: { version, extracted }, schema: JobSchema,
  });
}

export async function deleteJob(id: string): Promise<void> {
  const res = await authedFetch(`/v1/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (res.status === 204) return;
  const body: unknown = await res.json().catch(() => null);
  const { code, message } = errorOf(res.status, body);
  throw new ApiClientError(res.status, code, message, body);
}

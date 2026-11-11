import { z } from "zod";

export const JobExtractionSchema = z.object({
  title: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  workMode: z.enum(["onsite", "hybrid", "remote", "unknown"]),
  employmentType: z.enum(["full_time", "part_time", "contract", "internship", "temporary", "unknown"]),
  seniority: z.enum(["intern", "junior", "mid", "senior", "lead", "unknown"]),
  salary: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    currency: z.string().nullable(),
    period: z.enum(["hour", "day", "month", "year"]).nullable(),
  }).nullable(),
  summary: z.string(),
  responsibilities: z.array(z.string().max(500)).max(40),
  requirements: z.array(z.object({
    text: z.string().max(500),
    kind: z.enum(["must", "nice"]),
    category: z.enum(["skill", "experience", "education", "language", "certification", "other"]),
  })).max(60),
  benefits: z.array(z.string().max(500)).max(30),
  applyBy: z.iso.date().nullable(),
  isJobPosting: z.boolean(),
  positionClosed: z.boolean().optional(),
});
export type JobExtraction = z.infer<typeof JobExtractionSchema>;

export const JobStatusSchema = z.enum(["queued", "processing", "ready", "needs_text", "failed"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSourceSchema = z.enum(["link", "extension"]);
export type JobSource = z.infer<typeof JobSourceSchema>;

export const JobErrorCodeSchema = z.enum(["fetch_blocked", "page_empty", "not_a_job", "ai_failed"]);
export type JobErrorCode = z.infer<typeof JobErrorCodeSchema>;

const applicationStatus = z.enum(["saved", "tailored", "applied", "interview", "offer", "rejected"]);

export const CreateJobBodySchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2048),
  pageText: z.string().trim().min(200).max(60000).optional(),
  jsonLd: z.array(z.unknown()).max(20).optional(),
  /** Who is sending the page: the web app sends "link"; the extension sends nothing. */
  source: JobSourceSchema.optional(),
});
export type CreateJobBody = z.infer<typeof CreateJobBodySchema>;

export const JobPatchBodySchema = z.object({
  version: z.number().int().min(1),
  extracted: JobExtractionSchema.extend({ title: z.string().trim().min(1) }),
  applicationStatus: applicationStatus.optional(),
});
export type JobPatchBody = z.infer<typeof JobPatchBodySchema>;
export const JobPatchSchema = JobPatchBodySchema;
export type JobPatch = z.infer<typeof JobPatchSchema>;

export const JobListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
  /** Only jobs that arrived this way. */
  source: JobSourceSchema.optional(),
});
export type JobListQuery = z.infer<typeof JobListQuerySchema>;

export const JobListItemSchema = z.object({
  id: z.string(),
  status: JobStatusSchema,
  errorCode: JobErrorCodeSchema.nullable(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  source: JobSourceSchema,
  url: z.string(),
  createdAt: z.string(),
  /** Where the person is with this job; the list shows "CV tailored" from it. */
  applicationStatus: applicationStatus.optional(),
  /** True when the ad itself says the position is no longer open. */
  positionClosed: z.boolean().optional(),
});
export type JobListItem = z.infer<typeof JobListItemSchema>;

export const JobListPageSchema = z.object({
  items: z.array(JobListItemSchema),
  nextCursor: z.string().nullable(),
});
export type JobListPage = z.infer<typeof JobListPageSchema>;

export const JobSchema = JobListItemSchema.extend({
  rawText: z.string().nullable(),
  extracted: JobExtractionSchema.nullable(),
  editedByUser: z.boolean(),
  applicationStatus,
  version: z.number().int().min(1),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;

export function normalizeJobUrl(input: string): string {
  const url = new URL(input);
  if (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com")) {
    const id = url.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1]
      ?? url.searchParams.get("currentJobId");
    if (id && /^\d+$/.test(id)) return `https://www.linkedin.com/jobs/view/${id}`;
  }

  url.hash = "";
  const tracking = new Set(["ref", "refId", "trk", "trackingId", "src", "source", "gclid", "fbclid"]);
  for (const name of [...url.searchParams.keys()]) {
    if (name.startsWith("utm_") || tracking.has(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
  const base = url.href.slice(0, url.href.length - url.search.length);
  return base.replace(/\/$/, "") + url.search;
}

export function findJobPosting(jsonLd: unknown[]): Record<string, unknown> | null {
  for (const value of jsonLd) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const object = value as Record<string, unknown>;
    const candidates = [object, ...(Array.isArray(object["@graph"]) ? object["@graph"] : [])];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const posting = candidate as Record<string, unknown>;
      const type = posting["@type"];
      if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return posting;
    }
  }
  return null;
}

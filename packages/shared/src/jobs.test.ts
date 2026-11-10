import { describe, expect, it } from "vitest";
import {
  CreateJobBodySchema, JobExtractionSchema, JobListItemSchema, JobListPageSchema, JobListQuerySchema, JobPatchBodySchema,
  JobPatchSchema, JobSchema, findJobPosting, normalizeJobUrl, type JobExtraction,
} from "./jobs.ts";

const extraction: JobExtraction = {
  title: "Developer", company: null, location: null,
  workMode: "unknown", employmentType: "unknown", seniority: "unknown",
  salary: null, summary: "", responsibilities: [], requirements: [], benefits: [],
  applyBy: null, isJobPosting: true,
};
const requirement = { text: "TypeScript", kind: "must", category: "skill" };
const listItem = {
  id: "job-1", status: "queued", errorCode: null, title: null, company: null,
  location: null, source: "link", url: "https://example.com/jobs/1",
  createdAt: "2026-11-05T10:00:00Z",
};

describe("normalizeJobUrl", () => {
  it("normalizes case, fragments, param order and trailing slashes", () => {
    expect(normalizeJobUrl("HTTPS://Example.com/jobs/1/?utm_source=x&b=2&a=1#apply"))
      .toBe("https://example.com/jobs/1?a=1&b=2");
  });

  it.each([
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_custom",
    "ref", "refId", "trk", "trackingId", "src", "source", "gclid", "fbclid",
  ])("removes tracking param %s and keeps other params", (param) => {
    expect(normalizeJobUrl(`https://example.com/job?${param}=x&referrer=kept&jobId=7`))
      .toBe("https://example.com/job?jobId=7&referrer=kept");
  });

  it.each([
    "https://www.linkedin.com/jobs/view/senior-dev-at-acme-4012345678/?trk=abc&refId=x",
    "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678",
    "http://linkedin.com/jobs/view/4012345678?extra=1#apply",
  ])("reduces LinkedIn job links to a common URL: %s", (url) => {
    expect(normalizeJobUrl(url)).toBe("https://www.linkedin.com/jobs/view/4012345678");
  });

  it("keeps non-LinkedIn hosts and query values intact", () => {
    expect(normalizeJobUrl("https://www.linkedin.com.example.org/jobs/view/123?next=/jobs/"))
      .toBe("https://www.linkedin.com.example.org/jobs/view/123?next=%2Fjobs%2F");
    expect(normalizeJobUrl("https://example.com/#apply")).toBe("https://example.com");
  });

  it("throws on an invalid URL", () => {
    expect(() => normalizeJobUrl("not a URL")).toThrow();
  });
});

describe("CreateJobBodySchema", () => {
  it("accepts HTTP and HTTPS links with optional capture data", () => {
    expect(CreateJobBodySchema.parse({ url: "http://example.com/job" }))
      .toEqual({ url: "http://example.com/job" });
    expect(CreateJobBodySchema.parse({
      url: "https://example.com/job", pageText: `  ${"x".repeat(200)}  `, jsonLd: [null, 1, {}],
    }).pageText).toBe("x".repeat(200));
    expect(CreateJobBodySchema.safeParse({ url: "https://example.com", pageText: "x".repeat(60000) }).success).toBe(true);
  });

  it.each(["ftp://x", "javascript:alert(1)", "not a URL", `https://example.com/${"x".repeat(2048)}`])
  ("rejects invalid or oversized job links: %.30s", (url) => {
    expect(CreateJobBodySchema.safeParse({ url }).success).toBe(false);
  });

  it.each(["x".repeat(199), ` ${"x".repeat(199)} `, "x".repeat(60001)])
  ("rejects page text outside the trimmed limits (%#)", (pageText) => {
    expect(CreateJobBodySchema.safeParse({ url: "https://example.com", pageText }).success).toBe(false);
  });

  it("limits JSON-LD input to twenty items", () => {
    expect(CreateJobBodySchema.safeParse({ url: "https://example.com", jsonLd: Array(20).fill(null) }).success).toBe(true);
    expect(CreateJobBodySchema.safeParse({ url: "https://example.com", jsonLd: Array(21).fill(null) }).success).toBe(false);
  });
});

describe("JobExtractionSchema", () => {
  it("accepts minimal extraction and non-job results without a title", () => {
    expect(JobExtractionSchema.safeParse(extraction).success).toBe(true);
    expect(JobExtractionSchema.safeParse({ ...extraction, title: "", isJobPosting: false }).success).toBe(true);
  });

  it("accepts populated fields from a job posting", () => {
    expect(JobExtractionSchema.safeParse({
      ...extraction, company: "Acme", location: "Bucharest", workMode: "hybrid",
      employmentType: "full_time", seniority: "senior", summary: "Build useful tools.",
      salary: { min: 50000, max: 80000, currency: "EUR", period: "year" },
      requirements: [requirement, { text: "French", kind: "nice", category: "language" }],
      applyBy: "2026-12-01",
    }).success).toBe(true);
  });

  it.each([
    ["responsibilities", 40, "x".repeat(500)],
    ["requirements", 60, { ...requirement, text: "x".repeat(500) }],
    ["benefits", 30, "x".repeat(500)],
  ])("enforces %s list and item limits", (field, limit, item) => {
    expect(JobExtractionSchema.safeParse({ ...extraction, [field]: Array(limit).fill(item) }).success).toBe(true);
    expect(JobExtractionSchema.safeParse({ ...extraction, [field]: Array(limit + 1).fill(item) }).success).toBe(false);
    const oversized = typeof item === "string" ? "x".repeat(501) : { ...item, text: "x".repeat(501) };
    expect(JobExtractionSchema.safeParse({ ...extraction, [field]: [oversized] }).success).toBe(false);
  });

  it.each([
    { workMode: "flexible" }, { employmentType: "freelance" }, { seniority: "principal" },
    { requirements: [{ ...requirement, kind: "optional" }] },
    { requirements: [{ ...requirement, category: "tool" }] },
    { salary: { min: null, max: null, currency: null, period: "week" } },
  ])("rejects unsupported extraction enums (%#)", (invalid) => {
    expect(JobExtractionSchema.safeParse({ ...extraction, ...invalid }).success).toBe(false);
  });

  it("requires all extraction fields", () => {
    expect(JobExtractionSchema.safeParse({ title: "Developer" }).success).toBe(false);
  });
});

describe("JobPatchBodySchema", () => {
  it("requires a title containing non-whitespace text", () => {
    expect(JobPatchBodySchema.safeParse({ version: 1, extracted: extraction }).success).toBe(true);
    expect(JobPatchBodySchema.safeParse({ version: 1, extracted: { ...extraction, title: "  " } }).success).toBe(false);
  });

  it.each([0, -1, 1.5])("rejects invalid version %s", (version) => {
    expect(JobPatchBodySchema.safeParse({ version, extracted: extraction }).success).toBe(false);
  });

  it("accepts all optional application statuses", () => {
    for (const applicationStatus of ["saved", "tailored", "applied", "interview", "offer", "rejected"]) {
      const patch = { version: 1, extracted: extraction, applicationStatus };
      expect(JobPatchSchema.parse(patch)).toEqual(patch);
      expect(JobPatchBodySchema.parse(patch)).toEqual(patch);
    }
  });

  it("ignores old thoughts and other unknown fields", () => {
    const patch = { version: 1, extracted: extraction };
    const oldPatch = { ...patch, userThoughts: "x".repeat(2001), unknown: "ignored" };
    expect(JobPatchSchema.parse(oldPatch)).toEqual(patch);
    expect(JobPatchBodySchema.parse(oldPatch)).toEqual(patch);
  });

  it("rejects unknown application statuses", () => {
    const patch = { version: 1, extracted: extraction, applicationStatus: "hired" };
    expect(JobPatchSchema.safeParse(patch).success).toBe(false);
    expect(JobPatchBodySchema.safeParse(patch).success).toBe(false);
  });
});

describe("JobListQuerySchema", () => {
  it("defaults to 50 and parses query string limits", () => {
    expect(JobListQuerySchema.parse({})).toEqual({ limit: 50 });
    for (const limit of ["1", "50", "100"]) {
      expect(JobListQuerySchema.parse({ limit, cursor: "next" })).toEqual({ limit: Number(limit), cursor: "next" });
    }
    expect(JobListQuerySchema.safeParse({ cursor: "x".repeat(200) }).success).toBe(true);
    expect(JobListQuerySchema.safeParse({ cursor: "x".repeat(201) }).success).toBe(false);
  });

  it.each(["0", "101", "abc", "1.5", ""])("rejects limit %s", (limit) => {
    expect(JobListQuerySchema.safeParse({ limit }).success).toBe(false);
  });
});

describe("job response schemas", () => {
  it("accepts list pages with an optional next page", () => {
    expect(JobListPageSchema.parse({ items: [listItem], nextCursor: "next" }))
      .toEqual({ items: [listItem], nextCursor: "next" });
    expect(JobListPageSchema.parse({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
    expect(JobListPageSchema.safeParse({ items: [listItem] }).success).toBe(false);
  });

  it("accepts queued list items and full jobs before extraction", () => {
    expect(JobListItemSchema.safeParse(listItem).success).toBe(true);
    expect(JobSchema.safeParse({
      ...listItem, rawText: null, extracted: null, editedByUser: false, version: 1, updatedAt: listItem.createdAt,
      applicationStatus: "saved",
    }).success).toBe(true);
  });

  it("accepts ready jobs and validates response enums", () => {
    expect(JobSchema.safeParse({
      ...listItem, status: "ready", source: "extension", title: extraction.title,
      rawText: "Original job text", extracted: extraction, editedByUser: true, version: 2, updatedAt: listItem.createdAt,
      applicationStatus: "applied",
    }).success).toBe(true);
    for (const invalid of [{ status: "done" }, { source: "email" }, { errorCode: "unknown" }]) {
      expect(JobListItemSchema.safeParse({ ...listItem, ...invalid }).success).toBe(false);
    }
  });

  it("requires rawText on full jobs", () => {
    expect(JobSchema.safeParse({
      ...listItem, extracted: null, editedByUser: false, version: 1, updatedAt: listItem.createdAt,
      applicationStatus: "saved",
    }).success).toBe(false);
  });

  it("validates application statuses on full jobs", () => {
    const job = {
      ...listItem, rawText: null, extracted: null, editedByUser: false, version: 1, updatedAt: listItem.createdAt,
      applicationStatus: "saved",
    };
    for (const applicationStatus of ["saved", "tailored", "applied", "interview", "offer", "rejected"]) {
      expect(JobSchema.parse({ ...job, applicationStatus })).toEqual({ ...job, applicationStatus });
    }
    expect(JobSchema.safeParse({ ...job, applicationStatus: "hired" }).success).toBe(false);
  });
});

describe("findJobPosting", () => {
  it.each(["JobPosting", ["JobPosting"], ["Thing", "JobPosting"]])
  ("finds a top-level job posting (%#)", (type) => {
    const posting = { "@type": type, title: "Developer" };
    expect(findJobPosting([null, 1, [], { "@type": "Organization" }, posting])).toBe(posting);
  });

  it("finds the first job inside a graph before later top-level jobs", () => {
    const posting = { "@type": ["JobPosting"], title: "First" };
    expect(findJobPosting([
      { "@graph": [null, { "@type": "Organization" }, posting] },
      { "@type": "JobPosting", title: "Second" },
    ])).toBe(posting);
  });

  it("returns null when no job posting exists", () => {
    expect(findJobPosting([{ "@type": "Organization" }])).toBeNull();
    expect(findJobPosting([null, "JobPosting", { "@graph": {} }])).toBeNull();
    expect(findJobPosting([])).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import type { JobExtraction } from "@resumora/shared";
import { ApiError } from "../src/errors.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { JOBS_PER_DAY } from "../src/jobs/repo.ts";

const extracted: JobExtraction = {
  title: "Engineer", company: "Example", location: "Bucharest", workMode: "hybrid",
  employmentType: "full_time", seniority: "mid", salary: null, summary: "Build things",
  responsibilities: [], requirements: [], benefits: [], applyBy: null, isJobPosting: true,
};
const input = (id: string) => ({
  id, source: "extension" as const, url: `https://example.test/jobs/${id}`,
  urlNormalized: `https://example.test/jobs/${id}`, rawText: "Private page text",
  jsonLd: { "@type": "JobPosting" },
});
let clock: Date;
let store: ReturnType<typeof memoryJobs>;
beforeEach(() => {
  clock = new Date("2026-11-05T10:00:00Z");
  store = memoryJobs({ now: () => clock });
});

describe("memoryJobs", () => {
  it("returns the first job for a duplicate URL without adding another run", async () => {
    const repo = store.repoFor("a");
    expect(await repo.create(input("first"))).toEqual({ id: "first", existing: false });
    expect(await repo.create({ ...input("second"), urlNormalized: input("first").urlNormalized }))
      .toEqual({ id: "first", existing: true });
    expect(await repo.findByUrl(input("first").urlNormalized)).toBe("first");
    expect(await repo.findByUrl("https://example.test/missing")).toBeNull();
    expect(store.rows.size).toBe(1);
    expect(store.runs).toHaveLength(1);
  });

  it.each(["a", "b"])("rejects an existing id for user %s without changing the original job or runs", async (userId) => {
    const owner = store.repoFor("a");
    await owner.create(input("original"));
    const original = structuredClone(store.rows.get("original"));
    const runs = structuredClone(store.runs);

    await expect(store.repoFor(userId).create({ ...input("different-url"), id: "original" }))
      .rejects.toThrow("duplicate id");

    expect(store.rows.size).toBe(1);
    expect(store.rows.get("original")).toEqual(original);
    expect(store.runs).toEqual(runs);
    expect(await owner.get("original")).not.toBeNull();
  });

  it("refuses the 31st run and leaves no job or run behind", async () => {
    const repo = store.repoFor("a");
    expect(JOBS_PER_DAY).toBe(30);
    for (let i = 0; i < 30; i++) await repo.create(input(String(i)));
    const error = await repo.create(input("over-limit")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "job_limit", message: "You can add up to 30 jobs per day." });
    expect(store.rows.size).toBe(30);
    expect(store.runs).toHaveLength(30);
    expect(await repo.create(input("0"))).toEqual({ id: "0", existing: true });
    expect(await store.repoFor("b").create(input("other-user"))).toEqual({ id: "other-user", existing: false });
  });

  it("keeps deleted jobs' runs and excludes runs at least 24 hours old", async () => {
    const repo = store.repoFor("a");
    await repo.create(input("old"));
    await repo.remove("old");
    expect(await repo.countRunsSince("2026-11-05T00:00:00Z")).toBe(1);
    clock = new Date("2026-11-06T10:00:00Z");
    for (let i = 0; i < 30; i++) await repo.create(input(String(i)));
    expect(await repo.countRunsSince(clock.toISOString())).toBe(30);
    await expect(repo.create(input("blocked"))).rejects.toMatchObject({ code: "job_limit" });
    clock = new Date("2026-11-07T10:00:01Z");
    await expect(repo.create(input("new-day"))).resolves.toEqual({ id: "new-day", existing: false });
    expect(store.runs).toHaveLength(32);
  });

  it("only edits ready jobs with the current version and updates the displayed fields", async () => {
    const repo = store.repoFor("a");
    await repo.create(input("job"));
    expect(await repo.patch("missing", 1, extracted)).toBe("not_found");
    expect(await repo.patch("job", 1, extracted)).toBe("wrong_status");
    await store.admin.finish("job", extracted);
    expect(await repo.patch("job", 0, extracted)).toBe("conflict");
    clock = new Date("2026-11-05T11:00:00Z");
    const edited = { ...extracted, title: "Lead engineer", company: null, location: "Remote" };
    expect(await repo.patch("job", 1, edited)).toBe("ok");
    expect(await repo.get("job")).toMatchObject({
      title: edited.title, company: null, location: "Remote", extracted: edited,
      version: 2, editedByUser: true, updatedAt: clock.toISOString(),
    });
    expect(await repo.patch("job", 1, extracted)).toBe("conflict");
    expect((await repo.get("job"))?.title).toBe(edited.title);
  });

  it("keeps each user's jobs private while allowing the same URL for different users", async () => {
    const a = store.repoFor("a");
    const b = store.repoFor("b");
    await a.create(input("private"));
    expect(await b.get("private")).toBeNull();
    expect(await b.remove("private")).toBe(false);
    expect(await b.patch("private", 1, extracted)).toBe("not_found");
    expect(await b.findByUrl(input("private").urlNormalized)).toBeNull();
    expect(await b.countRunsSince("2026-01-01T00:00:00Z")).toBe(0);
    expect(await b.list()).toEqual([]);
    await b.create({ ...input("other"), urlNormalized: input("private").urlNormalized });
    expect((await b.list()).map((job) => job.id)).toEqual(["other"]);
  });

  it("lists newest first and excludes source text and JSON-LD from public results", async () => {
    const repo = store.repoFor("a");
    await repo.create(input("first"));
    clock = new Date("2026-11-05T11:00:00Z");
    await repo.create(input("second"));
    expect((await repo.list()).map((job) => job.id)).toEqual(["second", "first"]);
    for (const job of [...await repo.list(), await repo.get("first")]) {
      for (const field of ["rawText", "raw_text", "jsonLd", "json_ld"]) expect(job).not.toHaveProperty(field);
    }
    expect((await repo.list())[0]).not.toHaveProperty("extracted");
  });

  it.each(["queued", "processing"])("allows only one concurrent start of a %s job", async (status) => {
    await store.repoFor("a").create(input("job"));
    if (status === "processing") await store.admin.start("job");
    const attempts = store.rows.get("job")!.attempts;

    const results = await Promise.all([store.admin.start("job"), store.admin.start("job")]);

    expect(results.filter((result) => result !== null)).toEqual([
      { id: "job", userId: "a", rawText: "Private page text", jsonLd: { "@type": "JobPosting" } },
    ]);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(store.rows.get("job")).toMatchObject({ status: "processing", attempts: attempts + 1 });
  });

  it("starts queued jobs, counts retries, and skips finished or deleted jobs", async () => {
    const repo = store.repoFor("a");
    await repo.create(input("job"));
    expect(await store.admin.start("job")).toEqual({ id: "job", userId: "a", rawText: input("job").rawText, jsonLd: input("job").jsonLd });
    expect(await store.admin.start("job")).not.toBeNull();
    expect(store.rows.get("job")).toMatchObject({ status: "processing", attempts: 2 });
    await store.admin.fail("job", "ai_failed");
    expect(await repo.get("job")).toMatchObject({ status: "failed", errorCode: "ai_failed" });
    expect(await store.admin.start("job")).toBeNull();
    await store.admin.finish("job", extracted);
    expect(await repo.get("job")).toMatchObject({ status: "ready", errorCode: null, title: extracted.title, company: extracted.company, location: extracted.location });
    expect(await store.admin.start("job")).toBeNull();
    expect(await repo.remove("job")).toBe(true);
    expect(await repo.remove("job")).toBe(false);
    expect(await store.admin.start("job")).toBeNull();
  });
});

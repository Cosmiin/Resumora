import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, MAX_CV_BYTES, TailoredCvSchema, type CvContent, type JobExtraction } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs } from "../src/tailor/memory-repo.ts";

const USERS: Record<string, string> = { "token-a": "user-a", "token-b": "user-b" };
const job: JobExtraction = {
  title: "Engineer", company: "Acme", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [], requirements: [],
  summary: "We are looking for an engineer who will build the tools and work with our team.",
  responsibilities: ["Work with the product team on the reports for our clients"],
};
const base: CvContent = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop", titles: ["Engineer"] } };

let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let cvs: Record<string, CvRepo>;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  jobs = memoryJobs({ now: () => new Date("2026-11-08T10:00:00Z") });
  docs = memoryTailorDocs();
  cvs = { "user-a": memoryCvRepo(), "user-b": memoryCvRepo() };
  await cvs["user-a"]!.save(base, 0);
  const deps: AppDeps = {
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (USERS[token] ? { id: USERS[token], token } : null),
    cvRepo: (user) => cvs[user.id]!,
    importRepo: () => { throw new Error("not used"); },
    jobRepo: (user) => jobs.repoFor(user.id),
    tailorRepo: (user) => memoryTailorRepo(user.id, new Map(), docs),
    insightsRepo: () => { throw new Error("not used"); },
    model: () => { throw new Error("not used"); },
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
    log: vi.fn(),
  };
  app = createApp(deps);
});

const auth = (token = "token-a") => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
async function tailoredCv() {
  const jobId = crypto.randomUUID();
  await jobs.repoFor("user-a").create({ id: jobId, source: "link", url: `https://example.test/${jobId}`, urlNormalized: jobId, rawText: "x", jsonLd: null });
  await jobs.admin.finish(jobId, job);
  const res = await app.request(`/v1/jobs/${jobId}/tailor`, { method: "POST", headers: auth(), body: JSON.stringify({ tone: "neutral" }) });
  const { tailoredCvId } = await res.json() as { tailoredCvId: string };
  return { jobId, id: tailoredCvId };
}
const get = (id: string, token = "token-a") => app.request(`/v1/tailored/${id}`, { headers: auth(token) });
const put = (id: string, body: unknown, token = "token-a") =>
  app.request(`/v1/tailored/${id}`, { method: "PUT", headers: auth(token), body: typeof body === "string" ? body : JSON.stringify(body) });
const patch = (id: string, body: unknown, token = "token-a") =>
  app.request(`/v1/tailored/${id}`, { method: "PATCH", headers: auth(token), body: JSON.stringify(body) });
const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status);
  expect(await res.json()).toMatchObject({ error: { code } });
};

describe("tailored CV read and save", () => {
  it("lists a job's tailored CVs", async () => {
    const { jobId, id } = await tailoredCv();
    const res = await app.request(`/v1/jobs/${jobId}/tailored`, { headers: auth() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id, language: "en", translatedFrom: null, updatedAt: expect.any(String) }] });
  });

  it("reads the whole tailored CV", async () => {
    const { jobId, id } = await tailoredCv();
    const res = await get(id);
    expect(res.status).toBe(200);
    const body = TailoredCvSchema.parse(await res.json());
    expect(body).toMatchObject({ id, jobId, language: "en", content: base, baseSnapshot: base, template: "classic", version: 1 });
  });

  it("round-trips a save and bumps the version", async () => {
    const { id } = await tailoredCv();
    const content = { ...base, basics: { ...base.basics, fullName: "Ana Maria Pop" } };
    const res = await put(id, { content, expectedVersion: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 2, updatedAt: expect.any(String) });
    const read = await (await get(id)).json() as { content: CvContent; version: number };
    expect(read).toMatchObject({ content, version: 2 });
  });

  it("answers a stale version with the version_conflict 409 shape of PUT /v1/cv", async () => {
    const { id } = await tailoredCv();
    await put(id, { content: base, expectedVersion: 1 });
    const res = await put(id, { content: base, expectedVersion: 1 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "version_conflict" }, current: { version: 2, updatedAt: expect.any(String) } });
  });

  it("changes the template", async () => {
    const { id } = await tailoredCv();
    const res = await patch(id, { template: "modern" });
    expect(res.status).toBe(200);
    expect(await (await get(id)).json()).toMatchObject({ template: "modern", version: 1 });
    await expectError(await patch(id, { template: "fancy" }), 400, "invalid_content");
  });

  it("hides another user's tailored CV and job as 404", async () => {
    const { jobId, id } = await tailoredCv();
    await expectError(await get(id, "token-b"), 404, "not_found");
    await expectError(await put(id, { content: base, expectedVersion: 1 }, "token-b"), 404, "not_found");
    await expectError(await patch(id, { template: "modern" }, "token-b"), 404, "not_found");
    await expectError(await app.request(`/v1/jobs/${jobId}/tailored`, { headers: auth("token-b") }), 404, "job_not_found");
    await expectError(await get("not-a-uuid"), 404, "not_found");
    expect(docs.cvs.get(id)).toMatchObject({ content: base, version: 1, template: "classic" });
  });

  it("rejects invalid or oversized content with 400 / 413", async () => {
    const { id } = await tailoredCv();
    await expectError(await put(id, { content: { basics: 1 }, expectedVersion: 1 }), 400, "invalid_content");
    await expectError(await put(id, "{nope"), 400, "invalid_json");
    const huge = { ...base, basics: { ...base.basics, summary: "x".repeat(MAX_CV_BYTES) } };
    await expectError(await put(id, { content: huge, expectedVersion: 1 }), 413, "content_too_large");
    expect(docs.cvs.get(id)).toMatchObject({ version: 1 });
  });
});

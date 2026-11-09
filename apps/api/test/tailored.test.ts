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

describe("PATCH /v1/tailored/:id/review (guided review)", () => {
  const role = { id: "00000000-0000-4000-8000-0000000000a1", company: "Beta", title: "Payroll Lead", location: "", startDate: "2020-01",
    endDate: "", current: true, description: "", bullets: [{ id: "00000000-0000-4000-8000-0000000000b1", text: "Moved payroll" }], notes: [] };
  const bullet = role.bullets[0]!.id;
  const guess = (text: string) => ({ kept: true, inferred: true, reviewed: false, text, reason: "From your notes." });
  async function seeded() {
    const { id } = await tailoredCv();
    const row = docs.cvs.get(id)!;
    row.baseSnapshot = { ...base, basics: { ...base.basics, summary: "Payroll lead." }, experience: [role] };
    row.content = { ...base, basics: { ...base.basics, summary: "Payroll lead who works abroad." },
      experience: [{ ...role, bullets: [{ id: bullet, text: "Led the payroll migration" }] }],
      technicalSkills: [{ id: "00000000-0000-4000-8000-0000000000c1", name: "BPMN" }] };
    row.review = { summary: { "summary#0": guess("who works abroad") }, experience: { [bullet]: guess("Led the payroll migration") },
      skills: { "new-skill:BPMN": guess("BPMN") } };
    return { id, version: row.version };
  }
  const review = (id: string, body: unknown, token = "token-a") =>
    app.request(`/v1/tailored/${id}/review`, { method: "PATCH", headers: auth(token), body: JSON.stringify(body) });
  const row = async (res: Response) => TailoredCvSchema.parse(await res.json());

  it("Remove restores the Base wording and marks the item reviewed, keeping its reason", async () => {
    const { id, version } = await seeded();
    const res = await review(id, { section: "experience", key: bullet, action: "remove", version });
    expect(res.status).toBe(200);
    const cv = await row(res);
    expect(cv.content.experience[0]!.bullets[0]!.text).toBe("Moved payroll");
    expect(cv.review!.experience).toEqual({ [bullet]: { kept: false, inferred: true, reviewed: true, text: "Led the payroll migration", reason: "From your notes." } });
    expect(cv.version).toBe(version + 1);
  });

  it("Remove and Edit work on a guessed project bullet too (E6 Task 9)", async () => {
    const { id, version } = await seeded();
    const project = { ...role, id: "00000000-0000-4000-8000-0000000000a2", title: "Payroll checker", company: "Personal project", url: "",
      bullets: [{ id: "00000000-0000-4000-8000-0000000000b2", text: "Built a checker" }] };
    const line = project.bullets[0]!.id;
    const doc = docs.cvs.get(id)!;
    doc.baseSnapshot = { ...doc.baseSnapshot, projects: [project] };
    doc.content = { ...doc.content, projects: [{ ...project, bullets: [{ id: line, text: "Built a payroll accuracy checker" }] }] };
    doc.review = { ...doc.review, projects: { [line]: guess("Built a payroll accuracy checker") } };
    const edited = await review(id, { section: "projects", key: line, action: "edit", text: "Built a payroll checker in Excel", version });
    expect(edited.status).toBe(200);
    const after = await row(edited);
    expect(after.content.projects[0]!.bullets[0]!.text).toBe("Built a payroll checker in Excel");
    const removed = await row(await review(id, { section: "projects", key: line, action: "remove", version: after.version }));
    expect(removed.content.projects[0]!.bullets[0]!.text).toBe("Built a checker");
  });

  it("Remove cuts a guessed summary phrase and drops a new skill", async () => {
    const { id, version } = await seeded();
    const first = await row(await review(id, { section: "summary", key: "summary#0", action: "remove", version }));
    expect(first.content.basics.summary).toBe("Payroll lead.");
    const second = await row(await review(id, { section: "skills", key: "new-skill:BPMN", action: "remove", version: first.version }));
    expect(second.content.technicalSkills).toEqual([]);
    expect(second.review!.skills).toMatchObject({ "new-skill:BPMN": { kept: false, reviewed: true } });
  });

  it("Edit saves the typed text and marks it reviewed; Keep only marks it reviewed", async () => {
    const { id, version } = await seeded();
    const edited = await row(await review(id, { section: "experience", key: bullet, action: "edit", text: "Led the payroll move", version }));
    expect(edited.content.experience[0]!.bullets[0]!.text).toBe("Led the payroll move");
    expect(edited.review!.experience).toMatchObject({ [bullet]: { kept: true, reviewed: true, text: "Led the payroll move" } });
    const summary = await row(await review(id, { section: "summary", key: "summary#0", action: "edit", text: "who led teams abroad", version: edited.version }));
    expect(summary.content.basics.summary).toBe("Payroll lead who led teams abroad.");
    const kept = await row(await review(id, { section: "skills", key: "new-skill:BPMN", action: "keep", version: summary.version }));
    expect(kept.content.technicalSkills.map((s) => s.name)).toEqual(["BPMN"]);
    expect(kept.review!.skills).toMatchObject({ "new-skill:BPMN": { kept: true, reviewed: true, text: "BPMN" } });
  });

  it("Remove leaves a skill the Base CV already has; an edit that makes the CV too long is 400 and saves nothing", async () => {
    const { id, version } = await seeded();
    const stored = docs.cvs.get(id)!;
    stored.baseSnapshot = { ...stored.baseSnapshot, technicalSkills: [{ id: "00000000-0000-4000-8000-0000000000c2", name: "bpmn" }] };
    const kept = await row(await review(id, { section: "skills", key: "new-skill:BPMN", action: "remove", version }));
    expect(kept.content.technicalSkills.map((s) => s.name)).toEqual(["BPMN"]);
    expect(kept.review!.skills).toMatchObject({ "new-skill:BPMN": { kept: false, reviewed: true } });
    docs.cvs.get(id)!.content.basics.summary = `${"x".repeat(3990)} who works abroad`;
    const long = await review(id, { section: "summary", key: "summary#0", action: "edit", text: "y".repeat(1500), version: kept.version });
    await expectError(long, 400, "invalid_content");
    expect(docs.cvs.get(id)!.version).toBe(kept.version);
  });

  it("a stale version is 409 version_conflict and changes nothing; an unknown item is 404; another user's CV is 404", async () => {
    const { id, version } = await seeded();
    await expectError(await review(id, { section: "experience", key: bullet, action: "remove", version: version + 1 }), 409, "version_conflict");
    expect(docs.cvs.get(id)!.content.experience[0]!.bullets[0]!.text).toBe("Led the payroll migration");
    await expectError(await review(id, { section: "experience", key: "nope", action: "keep", version }), 404, "not_found");
    // Never the prototype: an inherited name is not an item.
    await expectError(await review(id, { section: "__proto__", key: "toString", action: "keep", version }), 404, "not_found");
    await expectError(await review(id, { section: "summary", key: "constructor", action: "keep", version }), 404, "not_found");
    expect(typeof Object.prototype.toString).toBe("function");
    await expectError(await review(id, { section: "experience", key: bullet, action: "keep", version }, "token-b"), 404, "not_found");
    expect((await review(id, { section: "experience", key: bullet, action: "edit", version })).status).toBe(400);
  });
});

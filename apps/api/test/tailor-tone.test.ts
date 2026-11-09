import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, TONES, type CvContent, type JobExtraction } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { roleWith } from "../src/enrich/fake-model.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs } from "../src/tailor/memory-repo.ts";

const job: JobExtraction = {
  title: "Analyst", company: "DSV", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [], requirements: [],
  summary: "Process automation.", responsibilities: ["Map processes"],
};
const older = roleWith(["Ran payroll for 40 staff"], { id: "old", startDate: "2015-01", endDate: "2018-01" });
const newest = roleWith(["Built automations in Make for onboarding"], { id: "new", startDate: "2023-01", endDate: "", current: true });
const base: CvContent = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop" }, experience: [older, newest] };
const lines = Object.fromEntries(TONES.map((tone) => [tone, `${tone}: built automations in Make for onboarding.`]));

let replies: unknown[];
let failing = false;
let model: ReturnType<typeof fakeModel>;
let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let cv: CvRepo;
let app: ReturnType<typeof createApp>;
let jobId: string;

beforeEach(async () => {
  replies = [];
  failing = false;
  model = fakeModel(() => {
    if (failing) throw new Error("down");
    const next = replies.shift();
    return next ?? { examples: lines };
  });
  jobs = memoryJobs({ now: () => new Date("2026-11-09T10:00:00Z") });
  docs = memoryTailorDocs();
  cv = memoryCvRepo();
  await cv.save(base, 0);
  const deps: AppDeps = {
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "token-a" ? { id: "user-a", token } : token === "token-b" ? { id: "user-b", token } : null),
    cvRepo: () => cv,
    importRepo: () => { throw new Error("not used"); },
    jobRepo: (user) => jobs.repoFor(user.id),
    tailorRepo: (user) => memoryTailorRepo(user.id, new Map(), docs),
    insightsRepo: () => { throw new Error("not used"); },
    model: () => model.deps,
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
    log: vi.fn(),
  };
  app = createApp(deps);
  jobId = crypto.randomUUID();
  await jobs.repoFor("user-a").create({ id: jobId, source: "link", url: "https://example.test/j", urlNormalized: "j", rawText: "x", jsonLd: null });
  await jobs.admin.finish(jobId, job);
});

const toneExamples = (token = "token-a", id = jobId) => app.request(`/v1/jobs/${id}/tone-examples`, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}",
});

describe("POST /v1/jobs/:id/tone-examples", () => {
  it("rewrites one bullet of the newest role in all 7 tones with one cheap call", async () => {
    const res = await toneExamples();
    expect(res.status).toBe(200);
    const body = await res.json() as { bullet: string; examples: Record<string, string> };
    expect(body.bullet).toBe("Built automations in Make for onboarding");
    expect(Object.keys(body.examples).sort()).toEqual([...TONES].sort());
    expect(model.logged.map((call) => call.task)).toEqual(["tailor_tone_examples"]);
    const sent = JSON.stringify(model.requests[0]);
    expect(sent).toContain("Built automations in Make for onboarding");
    expect(sent).not.toContain("Ran payroll");
    expect(sent).not.toContain("Ana Pop");
  });

  it("reuses the cache while the bullet is unchanged, and makes new examples once it changes", async () => {
    await toneExamples();
    const again = await (await toneExamples()).json() as { examples: Record<string, string> };
    expect(again.examples).toEqual(lines);
    expect(model.requests).toHaveLength(1);
    const content = (await cv.get()).content;
    const edited = roleWith(["Built automations in Make and Airtable"], { id: "new", startDate: "2023-01", endDate: "", current: true });
    await cv.save({ ...content, experience: [older, edited] }, 1);
    await toneExamples();
    expect(model.requests).toHaveLength(2);
  });

  it("returns ai_failed when the model fails, so the screen can show its fixed examples", async () => {
    failing = true;
    const res = await toneExamples();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: "ai_failed" } });
  });

  it("returns no examples when the CV has no bullet, without calling the model", async () => {
    await cv.save({ ...base, experience: [] }, 1);
    expect(await (await toneExamples()).json()).toEqual({ bullet: null, examples: null });
    expect(model.requests).toHaveLength(0);
  });

  it("hides another user's job", async () => {
    const res = await toneExamples("token-b");
    expect(res.status).toBe(404);
  });
});

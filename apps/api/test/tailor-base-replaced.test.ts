import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction, type TailorRun } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { roleWith } from "../src/enrich/fake-model.ts";
import { fromOtherBaseCv } from "../src/tailor/base-changed.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs, type MemoryTailorStore } from "../src/tailor/memory-repo.ts";

const job: JobExtraction = {
  title: "Payroll Lead", company: "Beta", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [],
  summary: "We are looking for a payroll lead who will run the team and work with our clients.",
  requirements: [{ text: "Payroll accuracy", kind: "must", category: "skill" }], responsibilities: ["Run payroll"],
};
const cvWith = (name: string, roles: CvContent["experience"]): CvContent => ({
  ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: name, titles: ["Payroll Specialist"], summary: "Payroll person." },
  experience: roles, technicalSkills: [{ id: crypto.randomUUID(), name: "Excel" }],
});
const oldCv = cvWith("Ana Pop", [roleWith(["Ran payroll for 40 staff"], { title: "Team Lead" })]);
// The CV removed and a new one imported: every item has a new id.
const newCv = cvWith("Ana Pop", [roleWith(["Ran payroll for 60 staff"], { title: "Payroll Lead" }), roleWith(["Filed taxes"], { title: "Clerk" })]);
const scoreReply = { labels: [
  { ref: "r0", kind: "requirement", status: "met", evidence: "payroll", inferred: false },
  { ref: "k:Payroll", kind: "keyword", status: "met", evidence: "payroll", inferred: false },
], cvSeniority: "mid" };

let replies: unknown[];
let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let scores: MemoryTailorStore;
let cv: CvRepo;
let app: ReturnType<typeof createApp>;
let jobId: string;

beforeEach(async () => {
  replies = [];
  const model = fakeModel(() => replies.shift() ?? { results: [] });
  jobs = memoryJobs({ now: () => new Date("2026-11-08T10:00:00Z") });
  docs = memoryTailorDocs();
  scores = new Map();
  cv = memoryCvRepo();
  await cv.save(oldCv, 0);
  const deps: AppDeps = {
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "token-a" ? { id: "user-a", token } : null),
    cvRepo: () => cv,
    importRepo: () => { throw new Error("not used"); },
    jobRepo: (user) => jobs.repoFor(user.id),
    tailorRepo: (user) => memoryTailorRepo(user.id, scores, docs),
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

const post = (path: string, body: unknown = {}) => app.request(path, {
  method: "POST", headers: { authorization: "Bearer token-a", "content-type": "application/json" }, body: JSON.stringify(body),
});
type Started = { run: TailorRun; tailoredCvId: string; restarted?: true };
const start = async () => (await post(`/v1/jobs/${jobId}/tailor`, { tone: "formal" })).json() as Promise<Started>;
async function replaceCv() {
  const { version } = await cv.get();
  expect((await cv.save(newCv, version)).ok).toBe(true);
}

describe("fromOtherBaseCv", () => {
  it("is true only when no role, project or volunteering role of the copy is in the Base CV", () => {
    expect(fromOtherBaseCv(oldCv, newCv)).toBe(true);
    expect(fromOtherBaseCv(oldCv, oldCv)).toBe(false);
    // A role added to or removed from the same CV is an edit, not a replacement.
    expect(fromOtherBaseCv(oldCv, { ...oldCv, experience: [...oldCv.experience, ...newCv.experience] })).toBe(false);
    // An emptied CV has nothing to tailor from yet; a copy made from an empty CV gets the new one's items.
    expect(fromOtherBaseCv(oldCv, emptyCv("en"))).toBe(false);
    expect(fromOtherBaseCv(emptyCv("en"), newCv)).toBe(true);
  });
});

describe("a job tailored before the Base CV was replaced", () => {
  it("starts again from the current Base CV when Tailor is pressed", async () => {
    const first = await start();
    expect(first.restarted).toBeUndefined();
    expect(first.run.roleOrder).toEqual([oldCv.experience[0]!.id]);
    await replaceCv();

    replies.push(scoreReply);
    const again = await start();
    expect(again.restarted).toBe(true);
    expect(again.tailoredCvId).toBe(first.tailoredCvId);
    expect(again.run.id).not.toBe(first.run.id);
    expect(again.run).toMatchObject({ kind: "tailor", status: "running", currentSection: "experience",
      roleOrder: newCv.experience.map((r) => r.id), currentRoleId: newCv.experience[0]!.id });
    const doc = docs.cvs.get(first.tailoredCvId)!;
    expect(doc.content).toEqual(newCv);
    expect(doc.review).toEqual({});
    // Score 1 is worked out again for the new CV.
    expect(doc.score?.labels).toContainEqual(expect.objectContaining({ ref: "r0", status: "met" }));

    // From then on the new run is the one a start returns.
    const third = await start();
    expect(third.restarted).toBeUndefined();
    expect(third.run.id).toBe(again.run.id);
  });

  it("still starts again when the new score can't be worked out", async () => {
    const first = await start();
    await replaceCv();
    replies.push({ nonsense: true });
    const again = await start();
    expect(again.restarted).toBe(true);
    expect(again.run.roleOrder).toEqual(newCv.experience.map((r) => r.id));
    expect(docs.cvs.get(first.tailoredCvId)!.content).toEqual(newCv);
  });

  it("refuses the old run's steps with base_cv_changed, so the page starts again", async () => {
    const { run } = await start();
    await replaceCv();
    const res = await post(`/v1/tailor-runs/${run.id}/sections/experience/questions`, { roleId: run.currentRoleId });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "base_cv_changed" } });
    const run2 = await post(`/v1/tailor-runs/${run.id}/sections/experience/run`, { roleId: run.currentRoleId });
    expect(run2.status).toBe(409);
  });

  it("re-tailors every step from the current Base CV", async () => {
    const { tailoredCvId } = await start();
    await replaceCv();
    const res = await post(`/v1/tailored/${tailoredCvId}/retailor`, { sections: ["summary"] });
    expect(res.status).toBe(200);
    const { run } = await res.json() as { run: TailorRun };
    expect(run).toMatchObject({ kind: "tailor", currentSection: "experience", roleOrder: newCv.experience.map((r) => r.id) });
    expect(docs.cvs.get(tailoredCvId)!.content).toEqual(newCv);
  });
});

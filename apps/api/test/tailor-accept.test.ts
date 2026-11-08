import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, SECTION_KEYS, type CvContent, type JobExtraction, type MatchScore, type Proposal, type TailorRun } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { roleWith } from "../src/enrich/fake-model.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs, type MemoryTailorStore } from "../src/tailor/memory-repo.ts";

const job: JobExtraction = {
  title: "Payroll Lead", company: "Beta", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [],
  summary: "We are looking for a payroll lead who will run the team and work with our clients.",
  requirements: [{ text: "Payroll accuracy", kind: "must", category: "skill" }], responsibilities: ["Run payroll"],
};
const role = roleWith(["Ran payroll for 40 staff", "Filed taxes"], { title: "Team Lead" });
const [first, second] = role.bullets as [CvContent["experience"][0]["bullets"][0], CvContent["experience"][0]["bullets"][0]];
const base: CvContent = {
  ...emptyCv("en"),
  basics: { ...emptyCv("en").basics, fullName: "Ana Pop", email: "ana@example.test", titles: ["Payroll Specialist"], summary: "Payroll person." },
  experience: [role], technicalSkills: [{ id: "s1", name: "Excel" }],
};
const scoreReply = (evidence = "payroll", inferred = false) => ({
  labels: [
    { ref: "r0", kind: "requirement", status: "met", evidence, inferred },
    { ref: "k:Payroll", kind: "keyword", status: "met", evidence, inferred: false },
  ],
  cvSeniority: "mid",
});

type ModelProposal = Omit<Proposal, "flags">;
let replies: unknown[];
let model: ReturnType<typeof fakeModel>;
let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let scores: MemoryTailorStore;
let cv: CvRepo;
let app: ReturnType<typeof createApp>;
let jobId: string;

beforeEach(async () => {
  replies = [];
  model = fakeModel(() => replies.shift() ?? { results: [] });
  jobs = memoryJobs({ now: () => new Date("2026-11-08T10:00:00Z") });
  docs = memoryTailorDocs();
  scores = new Map();
  cv = memoryCvRepo();
  await cv.save(base, 0);
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
const reword = (itemId: string, text: string, over: Partial<ModelProposal> = {}): ModelProposal =>
  ({ itemId, field: "text", text, inferred: false, ...over });
const repo = () => memoryTailorRepo("user-a", scores, docs);
const tailored = () => [...docs.cvs.values()][0]!;

async function start(): Promise<string> {
  const body = await (await post(`/v1/jobs/${jobId}/tailor`, { tone: "formal" })).json() as { run: { id: string } };
  return body.run.id;
}
async function run(runId: string, section: string, ...items: ModelProposal[]) {
  replies.push({ proposals: items }, { results: [] });
  const res = await post(`/v1/tailor-runs/${runId}/sections/${section}/run`);
  expect(res.status).toBe(200);
}
async function accept(runId: string, section: string, body: unknown = {}, score: unknown = scoreReply()) {
  replies.push(score);
  return post(`/v1/tailor-runs/${runId}/sections/${section}/accept`, body);
}

describe("accept section", () => {
  it("writes only the kept Experience proposals, saves Score 2 and moves to Skills", async () => {
    const runId = await start();
    await run(runId, "experience", reword(first.id, "Ran accurate payroll for 40 staff"), reword(second.id, "Filed payroll taxes"));
    const res = await accept(runId, "experience", { decisions: [{ itemId: first.id, keep: true }, { itemId: second.id, keep: false }] });
    expect(res.status).toBe(200);
    const body = await res.json() as { run: TailorRun; score: MatchScore };
    const doc = tailored();
    expect(doc.content.experience[0]!.bullets.map((b) => b.text)).toEqual(["Ran accurate payroll for 40 staff", "Filed taxes"]);
    expect(doc.content.technicalSkills).toEqual(base.technicalSkills);
    expect(doc.content.basics).toEqual(base.basics);
    expect(doc.version).toBe(2);
    expect(doc.review).toMatchObject({ experience: { [first.id]: { kept: true }, [second.id]: { kept: false } } });
    expect(body.run).toMatchObject({ currentSection: "skills", status: "running" });
    expect(body.score.total).not.toBeNull();
    expect(await repo().getScore(jobId, "tailored", doc.id)).toEqual(body.score);
    expect(doc.score).toEqual(body.score);
    expect(model.logged.at(-1)?.task).toBe("tailor_score");
  });

  it("reverts a rejected flag and keeps a confirmed one as a job note", async () => {
    const flagged = reword(first.id, "Cut payroll errors by 30% for 40 staff");
    const runId = await start();
    replies.push({ proposals: [flagged] }, { results: [] });
    await run(runId, "experience", flagged);
    const [flag] = (await repo().getRun(runId))!.questions!.filter((q) => q.kind === "flag");
    const rejected = await accept(runId, "experience", { decisions: [{ itemId: first.id, keep: true }], flags: [{ questionId: flag!.id, confirmed: false }] });
    expect(rejected.status).toBe(200);
    expect(tailored().content.experience[0]!.bullets[0]!.text).toBe("Ran payroll for 40 staff");
    expect((await cv.get()).content.experience[0]!.notes).toEqual([]);

    // A fresh job with the same proposal, this time confirmed.
    docs.cvs.clear();
    docs.runs.clear();
    const again = await start();
    replies.push({ proposals: [flagged] }, { results: [] });
    await run(again, "experience", flagged);
    const [flag2] = (await repo().getRun(again))!.questions!.filter((q) => q.kind === "flag");
    const confirmed = await accept(again, "experience", { flags: [{ questionId: flag2!.id, confirmed: true }] });
    expect(confirmed.status).toBe(200);
    expect(tailored().content.experience[0]!.bullets[0]!.text).toBe("Cut payroll errors by 30% for 40 staff");
    expect((await cv.get()).content.experience[0]!.notes).toEqual([
      expect.objectContaining({ jobId, answer: "Cut payroll errors by 30% for 40 staff" }),
    ]);
  });

  it("counts a kept inferred skill in Score 2 and leaves a removed one out", async () => {
    const runId = await start();
    await accept(runId, "experience");
    await run(runId, "skills",
      { itemId: "new-skill", field: "name", text: "Payroll software", inferred: true },
      { itemId: "new-skill", field: "name", text: "Gusto", inferred: true });
    const res = await accept(runId, "skills", {
      inferred: [{ itemId: "new-skill:Payroll software", keep: true }, { itemId: "new-skill:Gusto", keep: false }],
    }, scoreReply("Payroll software", true));
    const body = await res.json() as { score: MatchScore };
    expect(tailored().content.technicalSkills.map((s) => s.name)).toEqual(["Excel", "Payroll software"]);
    // 1 = full credit; an inferred label without a kept item would get 0.5.
    expect(body.score.parts.requirements).toMatchObject({ points: 1 });
    expect(tailored().review).toMatchObject({ skills: { "new-skill:Payroll software": { kept: true, inferred: true } } });
  });

  it("runs the layout step after Languages, then ends done with the job tailored", async () => {
    const runId = await start();
    for (const section of ["experience", "skills", "summary", "achievements", "languages"]) {
      expect((await accept(runId, section)).status).toBe(200);
    }
    expect((await repo().getRun(runId))!.currentSection).toBe("layout");
    const order = [...SECTION_KEYS].reverse();
    replies.push({ order, headline: "Payroll Lead" });
    const layout = await post(`/v1/tailor-runs/${runId}/sections/layout/run`);
    expect(layout.status).toBe(200);
    const proposals = (await layout.json() as { proposals: Proposal[] }).proposals;
    expect(proposals.map((p) => p.itemId)).toEqual(["layout", "headline"]);
    expect(JSON.stringify(model.requests.at(-1))).not.toContain("Ana Pop");

    const done = await accept(runId, "layout");
    expect(done.status).toBe(200);
    expect((await done.json() as { run: TailorRun }).run).toMatchObject({ status: "done", currentSection: null });
    expect(tailored().content.layout.order).toEqual(order);
    expect(tailored().content.basics.titles).toEqual(["Payroll Lead"]);
    expect((await jobs.repoFor("user-a").get(jobId))!.applicationStatus).toBe("tailored");
  });

  it("drops a headline with words the CV doesn't have and an order that isn't a reordering", async () => {
    const runId = await start();
    for (const section of ["experience", "skills", "summary", "achievements", "languages"]) await accept(runId, section);
    replies.push({ order: ["experience"], headline: "Payroll Director" });
    const proposals = (await (await post(`/v1/tailor-runs/${runId}/sections/layout/run`)).json() as { proposals: Proposal[] }).proposals;
    expect(proposals).toEqual([]);
  });

  it("refuses a section that isn't current with 409", async () => {
    const runId = await start();
    const res = await accept(runId, "skills");
    expect(res.status).toBe(409);
    expect(tailored().version).toBe(1);
    expect(await repo().getScore(jobId, "tailored")).toBeNull();
  });
});

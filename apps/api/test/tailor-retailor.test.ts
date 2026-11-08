import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction, type MatchScore, type Proposal, type TailorRun } from "@resumora/shared";
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
const [first] = role.bullets as [CvContent["experience"][0]["bullets"][0]];
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

const call = (method: string, path: string, body: unknown = {}, token = "token-a") => app.request(path, {
  method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
});
const retailor = (id: string, sections: unknown, token = "token-a") => call("POST", `/v1/tailored/${id}/retailor`, { sections }, token);

describe("re-tailor", () => {
  it("re-tailoring Skills leaves Experience (and its hand edits) byte-identical", async () => {
    const runId = await start();
    await run(runId, "experience", reword(first.id, "Ran accurate payroll for 40 staff"));
    expect((await accept(runId, "experience", { decisions: [{ itemId: first.id, keep: true }] })).status).toBe(200);
    const doc = tailored();
    const edited = structuredClone(doc.content);
    edited.experience[0]!.bullets[1]!.text = "Filed taxes by hand";
    expect((await call("PUT", `/v1/tailored/${doc.id}`, { content: edited, expectedVersion: doc.version })).status).toBe(200);
    const experienceBefore = JSON.stringify(tailored().content.experience);

    const res = await retailor(doc.id, ["skills"]);
    expect(res.status).toBe(200);
    const { run: section } = await res.json() as { run: TailorRun };
    expect(section).toMatchObject({ kind: "section", sections: ["skills"], currentSection: "skills", status: "running", tailoredCvId: doc.id, jobId });
    await run(section.id, "skills", { itemId: "s1", field: "name", text: "Advanced Excel", inferred: false });
    const accepted = await accept(section.id, "skills", { decisions: [{ itemId: "s1", keep: true }] });
    expect(accepted.status).toBe(200);
    expect((await accepted.json() as { run: TailorRun }).run.status).toBe("done");
    expect(tailored().content.technicalSkills).toEqual([{ id: "s1", name: "Advanced Excel" }]);
    expect(JSON.stringify(tailored().content.experience)).toBe(experienceBefore);
    expect(tailored().review).toMatchObject({ experience: { [first.id]: { kept: true } }, skills: { s1: { kept: true } } });
  });

  it("a second Skills run doesn't add a new skill the tailored CV already has", async () => {
    const runId = await start();
    await run(runId, "experience");
    expect((await accept(runId, "experience")).status).toBe(200);
    const added = { itemId: "new-skill", field: "name", text: "Payroll", inferred: true };
    await run(runId, "skills", added);
    expect((await accept(runId, "skills", { inferred: [{ itemId: "new-skill:Payroll", keep: true }] })).status).toBe(200);
    expect(tailored().content.technicalSkills.map((s) => s.name)).toEqual(["Excel", "Payroll"]);

    const { run: again } = await (await retailor(tailored().id, ["skills"])).json() as { run: TailorRun };
    await run(again.id, "skills", { ...added, text: " payroll " });
    expect((await accept(again.id, "skills", { inferred: [{ itemId: "new-skill: payroll ", keep: true }] })).status).toBe(200);
    expect(tailored().content.technicalSkills.map((s) => s.name)).toEqual(["Excel", "Payroll"]);
  });

  it("orders the picked sections like a full run and marks several as a retailor run", async () => {
    await start();
    const { run: picked } = await (await retailor(tailored().id, ["summary", "experience", "summary"])).json() as { run: TailorRun };
    expect(picked).toMatchObject({ kind: "retailor", sections: ["experience", "summary"], currentSection: "experience" });
  });

  it("rejects an empty or unknown section list and hides other users' CVs", async () => {
    await start();
    const id = tailored().id;
    expect((await retailor(id, [])).status).toBe(400);
    expect((await retailor(id, ["hobbies"])).status).toBe(400);
    expect((await retailor(id, ["skills"], "token-b")).status).toBe(401);
    expect((await retailor(crypto.randomUUID(), ["skills"])).status).toBe(404);
  });

  it("does not ask again a question answered in the first run", async () => {
    await memoryTailorRepo("user-a", scores).saveScore(jobId, "base", null, {
      policy: "match/1", total: 50, band: "fair", capped: false, parts: { requirements: null, keywords: null, seniority: null, langEdu: null },
      labels: [{ ref: "r0", kind: "requirement", status: "missing", evidence: null, inferred: false }],
    } as unknown as MatchScore);
    const runId = await start();
    const ask = { roleId: role.id, text: "How many staff did you pay?", kind: "options", options: ["10", "40"], reason: "Gap" };
    replies.push({ questions: [ask] });
    const asked = await (await post(`/v1/tailor-runs/${runId}/sections/experience/questions`)).json() as { questions: { id: string }[] };
    expect(asked.questions).toHaveLength(1);
    expect((await post(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: asked.questions[0]!.id, value: "40", via: "option" }] })).status).toBe(200);

    const { run: again } = await (await retailor(tailored().id, ["experience"])).json() as { run: TailorRun };
    replies.push({ questions: [ask, { ...ask, text: "Which payroll tool did you use?" }] });
    const second = await (await post(`/v1/tailor-runs/${again.id}/sections/experience/questions`)).json() as { questions: { text: string }[] };
    expect(second.questions.map((q) => q.text)).toEqual(["Which payroll tool did you use?"]);
  });
});

describe("job changes the re-tailor notice reads", () => {
  it("only an extraction edit moves the job's updatedAt; status and thoughts saves don't", async () => {
    let clock = new Date("2026-11-08T10:00:00Z");
    const own = memoryJobs({ now: () => clock });
    const repoA = own.repoFor("user-a");
    const id = crypto.randomUUID();
    await repoA.create({ id, source: "link", url: "https://example.test/k", urlNormalized: "k", rawText: "x", jsonLd: null });
    await own.admin.finish(id, job);
    const before = (await repoA.get(id))!;
    clock = new Date("2026-11-08T11:00:00Z");
    expect(await repoA.patch(id, before.version, job, { applicationStatus: "tailored", userThoughts: "Nice team" })).toBe("ok");
    const afterStatus = (await repoA.get(id))!;
    expect(afterStatus).toMatchObject({ applicationStatus: "tailored", updatedAt: before.updatedAt, editedByUser: false });
    clock = new Date("2026-11-08T12:00:00Z");
    expect(await repoA.patch(id, afterStatus.version, { ...job, title: "Payroll Manager" })).toBe("ok");
    expect((await repoA.get(id))!).toMatchObject({ updatedAt: "2026-11-08T12:00:00.000Z", editedByUser: true });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction, type Proposal, type TailorRun } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { roleWith } from "../src/enrich/fake-model.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs, type MemoryTailorStore } from "../src/tailor/memory-repo.ts";

// E6 Task 10b: courses, publications and interests are reworded in Final touches, most relevant first,
// with items unrelated to the job hidden on this tailored CV only.
const job: JobExtraction = {
  title: "Payroll Lead", company: "Beta", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [],
  summary: "We are looking for a payroll lead who will run the team and work with our clients.",
  requirements: [{ text: "Payroll accuracy", kind: "must", category: "skill" }], responsibilities: ["Run payroll"],
};
const role = roleWith(["Ran payroll for 40 staff"], { title: "Team Lead" });
const excel = { id: "c1", name: "Excel for finance", provider: "Coursera", date: "2024", bullets: [{ id: "c1-l1", text: "Pivot tables for payroll" }] };
const tax = { id: "c2", name: "Payroll tax law", provider: "CECCAR", date: "2023" };
const base: CvContent = {
  ...emptyCv("en"),
  basics: { ...emptyCv("en").basics, fullName: "Ana Pop", titles: ["Payroll Specialist"], summary: "Payroll person." },
  experience: [role], courses: [excel, tax], interests: [{ id: "i1", name: "Knitting" }, { id: "i2", name: "Spreadsheets" }],
};
const scoreReply = { labels: [
  { ref: "r0", kind: "requirement", status: "met", evidence: "payroll", inferred: false },
  { ref: "k:Payroll", kind: "keyword", status: "met", evidence: "payroll", inferred: false },
], cvSeniority: "mid" };

type ModelProposal = Omit<Proposal, "flags">;
let replies: unknown[];
let model: ReturnType<typeof fakeModel>;
let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let scores: MemoryTailorStore;
let cv: CvRepo;
let app: ReturnType<typeof createApp>;
let jobId: string;

async function setup(content: CvContent) {
  replies = [];
  model = fakeModel(() => replies.shift() ?? { results: [] });
  jobs = memoryJobs({ now: () => new Date("2026-11-08T10:00:00Z") });
  docs = memoryTailorDocs();
  scores = new Map();
  cv = memoryCvRepo();
  await cv.save(content, 0);
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
}
beforeEach(() => setup(base));

const post = (path: string, body: unknown = {}) => app.request(path, {
  method: "POST", headers: { authorization: "Bearer token-a", "content-type": "application/json" }, body: JSON.stringify(body),
});
const tailored = () => [...docs.cvs.values()][0]!;

async function start(): Promise<{ run: TailorRun; tailoredCvId: string }> {
  return await (await post(`/v1/jobs/${jobId}/tailor`, { tone: "formal" })).json() as { run: TailorRun; tailoredCvId: string };
}
/** A run over one section of the tailored CV (re-tailor), so the test starts on that step. */
async function only(section: string): Promise<TailorRun> {
  const { tailoredCvId } = await start();
  const res = await post(`/v1/tailored/${tailoredCvId}/retailor`, { sections: [section] });
  expect(res.status).toBe(200);
  return ((await res.json()) as { run: TailorRun }).run;
}
async function runWith(runId: string, section: string, ...items: ModelProposal[]) {
  replies.push({ proposals: items.map((item) => ({ reason: null, guesses: null, ...item })) }, { results: [] });
  const res = await post(`/v1/tailor-runs/${runId}/sections/${section}/run`);
  expect(res.status).toBe(200);
  return (await res.json()) as { proposals: Proposal[]; removed: number };
}
async function accept(runId: string, section: string, decisions: { itemId: string; keep: boolean }[]) {
  replies.push(scoreReply);
  const res = await post(`/v1/tailor-runs/${runId}/sections/${section}/accept`, { decisions });
  expect(res.status).toBe(200);
  return (await res.json()) as { run: TailorRun };
}
const line = (itemId: string, text: string): ModelProposal => ({ itemId, field: "text", text, inferred: false });
const hide = (id: string, why: string): ModelProposal => ({ itemId: `hide:${id}`, field: "hidden", text: why, inferred: false });
const order = (...ids: string[]): ModelProposal => ({ itemId: "order", field: "order", text: ids.join(","), inferred: false });

describe("lighter sections in Final touches", () => {
  it("are steps after Achievements, only when the CV has items in them", async () => {
    const { run } = await start();
    expect(run.sections.slice(run.sections.indexOf("achievements"))).toEqual(["achievements", "courses", "interests", "languages", "layout"]);
    await setup({ ...base, courses: [], interests: [] });
    expect((await start()).run.sections).not.toContain("courses");
  });

  it("rewords a course's line and puts the most relevant course first, on the tailored CV only", async () => {
    const run = await only("courses");
    const { proposals } = await runWith(run.id, "courses", order("c2", "c1"), line("c1-l1", "Pivot tables for payroll accuracy checks"));
    expect(proposals.map((p) => p.itemId)).toEqual(["order", "c1-l1"]);
    await accept(run.id, "courses", proposals.map((p) => ({ itemId: p.itemId, keep: true })));
    const content = tailored().content;
    expect(content.courses.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(content.courses[1]!.bullets![0]!.text).toBe("Pivot tables for payroll accuracy checks");
    expect((await cv.get()).content.courses).toEqual(base.courses);
  });

  it("offers an unrelated interest for hiding; kept, it is hidden on the tailored CV only", async () => {
    const run = await only("interests");
    // The reason names nothing the CV backs up, but a hide isn't CV text: it is never flagged or dropped.
    const { proposals, removed } = await runWith(run.id, "interests", hide("i1", "Not linked to a payroll role at Beta in 2026"));
    expect(removed).toBe(0);
    expect(proposals).toEqual([expect.objectContaining({ itemId: "hide:i1", field: "hidden", flags: [] })]);
    const done = await accept(run.id, "interests", [{ itemId: "hide:i1", keep: true }]);
    expect(done.run.status).toBe("done");
    const content = tailored().content;
    expect(content.interests).toEqual([{ id: "i1", name: "Knitting", hidden: true }, { id: "i2", name: "Spreadsheets" }]);
    expect((await cv.get()).content.interests[0]!.hidden).toBeUndefined();
  });

  it("Keep the original changes nothing: no rewording, order or hiding", async () => {
    const run = await only("courses");
    const { proposals } = await runWith(run.id, "courses", order("c2", "c1"), hide("c1", "Not about payroll"), line("c1-l1", "Pivot tables"));
    await accept(run.id, "courses", proposals.map((p) => ({ itemId: p.itemId, keep: false })));
    expect(tailored().content.courses).toEqual(base.courses);
  });

  it("drops an order that doesn't list every item once, and a hide for an item not in the section", async () => {
    const run = await only("courses");
    const { proposals } = await runWith(run.id, "courses", order("c2"), hide("i1", "Not about payroll"));
    await accept(run.id, "courses", proposals.map((p) => ({ itemId: p.itemId, keep: true })));
    expect(tailored().content.courses.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(tailored().content.interests.every((i) => !i.hidden)).toBe(true);
  });

  it("a hide the model marks as a guess is still the person's to untick, and never a guess to review", async () => {
    const run = await only("interests");
    const { proposals } = await runWith(run.id, "interests", { ...hide("i1", "Not about payroll"), inferred: true, reason: "A guess" });
    expect(proposals).toEqual([expect.objectContaining({ itemId: "hide:i1", inferred: false })]);
    expect(proposals[0]!.reason).toBeUndefined();
    await accept(run.id, "interests", [{ itemId: "hide:i1", keep: false }]);
    expect(tailored().content.interests.every((i) => !i.hidden)).toBe(true);
    expect(tailored().review).toMatchObject({ interests: { "hide:i1": { kept: false, inferred: false } } });
  });

  it("re-tailoring a section with Keep the original undoes an earlier hide and order", async () => {
    const first = await only("courses");
    const { proposals } = await runWith(first.id, "courses", order("c2", "c1"), hide("c1", "Not about payroll"));
    await accept(first.id, "courses", proposals.map((p) => ({ itemId: p.itemId, keep: true })));
    expect(tailored().content.courses.map((c) => [c.id, c.hidden ?? false])).toEqual([["c2", false], ["c1", true]]);
    const again = ((await (await post(`/v1/tailored/${tailored().id}/retailor`, { sections: ["courses"] })).json()) as { run: TailorRun }).run;
    const redone = await runWith(again.id, "courses", order("c2", "c1"), hide("c1", "Not about payroll"));
    await accept(again.id, "courses", redone.proposals.map((p) => ({ itemId: p.itemId, keep: false })));
    expect(tailored().content.courses).toEqual(base.courses);
  });

  it("an order that changes nothing is no change, so the step has nothing to show", async () => {
    const run = await only("courses");
    const { proposals } = await runWith(run.id, "courses", order("c1", " c2"));
    expect(proposals).toEqual([]);
  });

  it("asks no questions in these steps", async () => {
    const run = await only("courses");
    const calls = model.requests.length;
    const res = await post(`/v1/tailor-runs/${run.id}/sections/courses/questions`);
    expect(await res.json()).toEqual({ questions: [] });
    expect(model.requests.length).toBe(calls);
  });

  it("gives Awards the same hide and order", async () => {
    await setup({ ...base, awards: [{ id: "a1", name: "Chess cup", issuer: "", date: "", description: "" }, { id: "a2", name: "Payroll award", issuer: "", date: "", description: "" }] });
    const run = await only("achievements");
    const { proposals } = await runWith(run.id, "achievements", order("a2", "a1"), hide("a1", "Not about payroll"));
    await accept(run.id, "achievements", proposals.map((p) => ({ itemId: p.itemId, keep: true })));
    expect(tailored().content.awards.map((a) => [a.id, a.hidden ?? false])).toEqual([["a2", false], ["a1", true]]);
  });
});

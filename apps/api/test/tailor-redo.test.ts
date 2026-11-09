import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction, type Proposal, type TailorRun } from "@resumora/shared";
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
const one = roleWith(["Ran payroll", "Filed taxes"], { title: "Team Lead" });
const two = roleWith(["Checked timesheets"], { title: "Payroll Clerk", company: "Gamma" });
const base: CvContent = {
  ...emptyCv("en"),
  basics: { ...emptyCv("en").basics, fullName: "Ana Pop", titles: ["Payroll Specialist"], summary: "Payroll person." },
  experience: [one, two], technicalSkills: [{ id: "s1", name: "Excel" }],
};
const scoreReply = { labels: [
  { ref: "r0", kind: "requirement", status: "met", evidence: "payroll", inferred: false },
  { ref: "k:Payroll", kind: "keyword", status: "met", evidence: "payroll", inferred: false },
], cvSeniority: "mid" };

type ModelProposal = Omit<Proposal, "flags">;
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
const reword = (itemId: string, text: string): ModelProposal => ({ itemId, field: "text", text, inferred: false });
const tailored = () => [...docs.cvs.values()][0]!;
const getRun = async (id: string) => (await memoryTailorRepo("user-a", scores, docs).getRun(id))!;
const proposals = (...items: ModelProposal[]) => replies.push({ proposals: items.map((item) => ({ reason: null, ...item })) }, { results: [] });

async function start(): Promise<string> {
  const body = await (await post(`/v1/jobs/${jobId}/tailor`, { tone: "formal" })).json() as { run: { id: string } };
  return body.run.id;
}
/** One role: a question, its answer, a proposal and the accept. */
async function tailorRole(runId: string, roleId: string, answer: string, itemId: string, text: string) {
  replies.push({ questions: [{ roleId, bulletId: null, skill: null, text: `About ${roleId}?`, kind: "options", options: [], reason: "Gap", gap: "r0" }] });
  const asked = await (await post(`/v1/tailor-runs/${runId}/sections/experience/questions`, { roleId })).json() as { questions: { id: string }[] };
  expect((await post(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: asked.questions[0]!.id, value: answer, via: "typed" }] })).status).toBe(200);
  proposals(reword(itemId, text));
  expect((await post(`/v1/tailor-runs/${runId}/sections/experience/run`, { roleId })).status).toBe(200);
  replies.push(scoreReply);
  expect((await post(`/v1/tailor-runs/${runId}/sections/experience/accept`, { roleId, decisions: [{ itemId, keep: true }] })).status).toBe(200);
  return asked.questions[0]!.id;
}

describe("going back to a finished role", () => {
  it("a redo of role 2 changes only role 2's items in review and content, its answers and notes, not the current section", async () => {
    const runId = await start();
    await tailorRole(runId, one.id, "Weekly", one.bullets[0]!.id, "Ran payroll every week");
    const asked = await tailorRole(runId, two.id, "Daily", two.bullets[0]!.id, "Checked timesheets daily");
    const before = tailored();
    const roleOne = JSON.stringify(before.content.experience[0]);
    const reviewOne = (before.review as { experience: Record<string, unknown> }).experience[one.bullets[0]!.id];
    expect((await getRun(runId)).currentSection).toBe("skills");

    proposals(reword(two.bullets[0]!.id, "Checked timesheets for the whole team"));
    const res = await post(`/v1/tailor-runs/${runId}/roles/${two.id}/redo`, { answers: [{ questionId: asked, value: "For the whole team", via: "typed" }] });
    expect(res.status).toBe(200);
    const redone = await res.json() as { proposals: Proposal[] };
    expect(redone.proposals.map((p) => p.text)).toEqual(["Checked timesheets for the whole team"]);
    expect((await getRun(runId)).answers).toEqual([expect.anything(), { questionId: asked, value: "For the whole team", via: "typed" }]);
    const notes = (await cv.get()).content.experience[1]!.notes.filter((note) => note.jobId === jobId);
    expect(notes.map((note) => note.answer)).toEqual(["For the whole team"]);

    replies.push(scoreReply);
    const accepted = await post(`/v1/tailor-runs/${runId}/roles/${two.id}/accept`, { decisions: [{ itemId: two.bullets[0]!.id, keep: true }] });
    expect(accepted.status).toBe(200);
    const after = tailored();
    expect(after.content.experience[1]!.bullets[0]!.text).toBe("Checked timesheets for the whole team");
    expect(JSON.stringify(after.content.experience[0])).toBe(roleOne);
    const review = (after.review as { experience: Record<string, { text: string }> }).experience;
    expect(review[one.bullets[0]!.id]).toEqual(reviewOne);
    expect(review[two.bullets[0]!.id]!.text).toBe("Checked timesheets for the whole team");
    const run = await getRun(runId);
    expect(run).toMatchObject({ currentSection: "skills", status: "running" });
  });

  it("refuses a role that isn't finished yet, and an answer to another role's question", async () => {
    const runId = await start();
    expect((await post(`/v1/tailor-runs/${runId}/roles/${one.id}/redo`, { answers: [] })).status).toBe(409);
    const asked = await tailorRole(runId, one.id, "Weekly", one.bullets[0]!.id, "Ran payroll every week");
    expect((await post(`/v1/tailor-runs/${runId}/roles/${two.id}/redo`, { answers: [] })).status).toBe(409);
    expect((await post(`/v1/tailor-runs/${runId}/roles/${two.id}/accept`, {})).status).toBe(409);
    const res = await post(`/v1/tailor-runs/${runId}/roles/${one.id}/redo`, { answers: [{ questionId: "other", value: "x", via: "typed" }] });
    expect(res.status).toBe(400);
    expect(asked).toBeTruthy();
  });

  it("redoes the role under review (its pass is done, not yet accepted), replacing its notes; the run stays on that role", async () => {
    const runId = await start();
    replies.push({ questions: [{ roleId: one.id, bulletId: null, skill: null, text: "How often?", kind: "options", options: [], reason: "Gap", gap: "r0" }] });
    const asked = (await (await post(`/v1/tailor-runs/${runId}/sections/experience/questions`, { roleId: one.id })).json() as { questions: { id: string }[] }).questions[0]!.id;
    await post(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: asked, value: "Weekly", via: "typed" }] });
    proposals(reword(one.bullets[0]!.id, "Ran payroll every week"));
    expect((await post(`/v1/tailor-runs/${runId}/sections/experience/run`, { roleId: one.id })).status).toBe(200);

    proposals(reword(one.bullets[0]!.id, "Ran payroll every day"));
    const res = await post(`/v1/tailor-runs/${runId}/roles/${one.id}/redo`, { answers: [{ questionId: asked, value: "Daily", via: "typed" }] });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { proposals: Proposal[] }).proposals.map((p) => p.text)).toEqual(["Ran payroll every day"]);
    const notes = (await cv.get()).content.experience[0]!.notes.filter((note) => note.jobId === jobId);
    expect(notes.map((note) => note.answer)).toEqual(["Daily"]);
    expect(await getRun(runId)).toMatchObject({ currentSection: "experience", currentRoleId: one.id });

    replies.push(scoreReply);
    expect((await post(`/v1/tailor-runs/${runId}/sections/experience/accept`, { roleId: one.id, decisions: [{ itemId: one.bullets[0]!.id, keep: true }] })).status).toBe(200);
    expect(tailored().content.experience[0]!.bullets[0]!.text).toBe("Ran payroll every day");
    expect((await getRun(runId)).currentRoleId).toBe(two.id);
    // The role-accept route still refuses the role under review.
    expect((await post(`/v1/tailor-runs/${runId}/roles/${two.id}/accept`, {})).status).toBe(409);
  });
});

describe("changing steering after Experience", () => {
  it("creates a new run with the same answers and the new steering, from the Base wording", async () => {
    const runId = await start();
    await tailorRole(runId, one.id, "Weekly", one.bullets[0]!.id, "Ran payroll every week");
    const old = await getRun(runId);

    const res = await post(`/v1/tailor-runs/${runId}/steering`, { tone: "confident", instruction: " Lead with payroll " });
    expect(res.status).toBe(200);
    const { run } = await res.json() as { run: TailorRun };
    expect(run.id).not.toBe(runId);
    expect(run).toMatchObject({ kind: "retailor", currentSection: "experience", currentRoleId: one.id, tailoredCvId: old.tailoredCvId });
    expect(run.sections).toEqual(old.sections);
    expect(run.answers).toEqual(old.answers);
    expect(run.questions).toEqual(old.questions);
    expect((await memoryTailorRepo("user-a", scores, docs).getSteering(old.tailoredCvId!))).toMatchObject({
      tone: "confident", instruction: "Lead with payroll", steering: { tone: "confident", instruction: "Lead with payroll" },
    });
    expect(tailored().content.experience[0]!.bullets[0]!.text).toBe("Ran payroll");
  });

  it("from a one-section re-tailor still redoes every step, clears the old review, and the stored steering can be read", async () => {
    const runId = await start();
    await tailorRole(runId, one.id, "Weekly", one.bullets[0]!.id, "Ran payroll every week");
    const picked = await post(`/v1/tailored/${tailored().id}/retailor`, { sections: ["skills"] });
    const { run: skillsOnly } = await picked.json() as { run: TailorRun };
    expect(skillsOnly.sections).toEqual(["skills"]);

    const res = await post(`/v1/tailor-runs/${skillsOnly.id}/steering`, { tone: "confident" });
    expect(res.status).toBe(200);
    const { run } = await res.json() as { run: TailorRun };
    expect(run.sections).toEqual(["experience", "skills", "summary", "achievements", "languages", "layout"]);
    expect(run.currentSection).toBe("experience");
    expect(tailored().review).toEqual({});

    const read = await app.request(`/v1/tailor-runs/${run.id}/steering`, { headers: { authorization: "Bearer token-a" } });
    expect(await read.json()).toEqual({ steering: { tone: "confident" } });
  });
});

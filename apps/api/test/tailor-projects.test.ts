import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction, type Proposal, type TailorRun } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { roleWith } from "../src/enrich/fake-model.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs, type MemoryTailorStore } from "../src/tailor/memory-repo.ts";

// E6 Task 9: Projects and volunteering are tailored like roles, in their own step after Experience.
const job: JobExtraction = {
  title: "Payroll Lead", company: "Beta", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [],
  summary: "We are looking for a payroll lead who will run the team and work with our clients.",
  requirements: [{ text: "Payroll accuracy", kind: "must", category: "skill" }], responsibilities: ["Run payroll"],
};
const role = roleWith(["Ran payroll for 40 staff"], { title: "Team Lead" });
const project = { ...roleWith(["Built a payroll checker in Excel"], { title: "Payroll checker", company: "Personal project" }), url: "" };
const volunteer = roleWith(["Taught budgeting to students"], { title: "Mentor", company: "Junior Achievement" });
const withItems: CvContent = {
  ...emptyCv("en"),
  basics: { ...emptyCv("en").basics, fullName: "Ana Pop", titles: ["Payroll Specialist"], summary: "Payroll person." },
  experience: [role], projects: [project], volunteering: [volunteer], technicalSkills: [{ id: "s1", name: "Excel" }],
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
beforeEach(() => setup(withItems));

const post = (path: string, body: unknown = {}) => app.request(path, {
  method: "POST", headers: { authorization: "Bearer token-a", "content-type": "application/json" }, body: JSON.stringify(body),
});
const reword = (itemId: string, text: string): ModelProposal => ({ itemId, field: "text", text, inferred: false });
const tailored = () => [...docs.cvs.values()][0]!;
/** The newest model request's user message that has `key` (the section pass sends "items", the questions "role"). */
const lastUser = (key: string) => model.requests.map((body) => (body.messages as { role: string; content: string }[]).find((m) => m.role === "user")!.content)
  .map((content) => { try { return JSON.parse(content) as Record<string, unknown>; } catch { return {}; } }).filter((body) => key in body).at(-1)!;
const getRun = async (id: string) => (await memoryTailorRepo("user-a", scores, docs).getRun(id))!;

async function start(): Promise<TailorRun> {
  const body = await (await post(`/v1/jobs/${jobId}/tailor`, { tone: "formal" })).json() as { run: TailorRun };
  return body.run;
}
async function runItem(runId: string, section: string, roleId: string, ...items: ModelProposal[]) {
  replies.push({ proposals: items.map((item) => ({ reason: null, guesses: null, ...item })) }, { results: [] });
  const res = await post(`/v1/tailor-runs/${runId}/sections/${section}/run`, { roleId });
  expect(res.status).toBe(200);
  return res.json() as Promise<{ proposals: Proposal[] }>;
}
async function acceptItem(runId: string, section: string, roleId: string, keep: string[] = []) {
  replies.push(scoreReply);
  return post(`/v1/tailor-runs/${runId}/sections/${section}/accept`, { roleId, decisions: keep.map((itemId) => ({ itemId, keep: true })) });
}

describe("Projects & volunteering step", () => {
  it("comes right after Experience, with one item order for both steps in CV order", async () => {
    const run = await start();
    expect(run.sections.slice(0, 3)).toEqual(["experience", "projects", "skills"]);
    expect(run.roleOrder).toEqual([role.id, project.id, volunteer.id]);
    expect(run.currentRoleId).toBe(role.id);
  });

  it("is left out of the run when the CV has no projects and no volunteering", async () => {
    await setup({ ...withItems, projects: [], volunteering: [] });
    const run = await start();
    expect(run.sections).not.toContain("projects");
    expect(run.roleOrder).toEqual([role.id]);
  });

  it("goes project, then volunteering, then Skills, writing each item's kept changes", async () => {
    const run = await start();
    await runItem(run.id, "experience", role.id);
    const afterRole = await (await acceptItem(run.id, "experience", role.id)).json() as { run: TailorRun };
    expect(afterRole.run).toMatchObject({ currentSection: "projects", currentRoleId: project.id });

    const projectBullet = project.bullets[0]!.id;
    const { proposals } = await runItem(run.id, "projects", project.id, reword(projectBullet, "Built an Excel payroll accuracy checker"));
    expect(proposals.map((p) => p.itemId)).toEqual([projectBullet]);
    // The model edits only the current item; the others are read-only context.
    const sent = lastUser("items") as { items: { edit: { id: string }[] } };
    expect(sent.items.edit.map((item) => item.id)).toEqual([project.id]);
    const afterProject = await (await acceptItem(run.id, "projects", project.id, [projectBullet])).json() as { run: TailorRun };
    expect(afterProject.run).toMatchObject({ currentSection: "projects", currentRoleId: volunteer.id });

    const volunteerBullet = volunteer.bullets[0]!.id;
    await runItem(run.id, "projects", volunteer.id, reword(volunteerBullet, "Taught budgeting and payroll basics to students"));
    const afterVolunteer = await (await acceptItem(run.id, "projects", volunteer.id, [volunteerBullet])).json() as { run: TailorRun };
    expect(afterVolunteer.run).toMatchObject({ currentSection: "skills", status: "running" });

    const doc = tailored();
    expect(doc.content.projects[0]!.bullets[0]!.text).toBe("Built an Excel payroll accuracy checker");
    expect(doc.content.projects[0]!.url).toBe("");
    expect(doc.content.volunteering[0]!.bullets[0]!.text).toBe("Taught budgeting and payroll basics to students");
    // Never labelled Experience: the role list is untouched.
    expect(doc.content.experience).toEqual([role]);
    expect(doc.review).toMatchObject({ projects: { [projectBullet]: { kept: true }, [volunteerBullet]: { kept: true } } });
  });

  it("refuses an item that isn't the current one (409)", async () => {
    const run = await start();
    await runItem(run.id, "experience", role.id);
    await acceptItem(run.id, "experience", role.id);
    const early = await post(`/v1/tailor-runs/${run.id}/sections/projects/run`, { roleId: volunteer.id });
    expect(early.status).toBe(409);
    await runItem(run.id, "projects", project.id);
    const res = await acceptItem(run.id, "projects", volunteer.id);
    expect(res.status).toBe(409);
    expect((await getRun(run.id)).currentRoleId).toBe(project.id);
  });

  it("asks a project's questions about that project, at most 5", async () => {
    const run = await start();
    await runItem(run.id, "experience", role.id);
    await acceptItem(run.id, "experience", role.id);
    replies.push({ questions: Array.from({ length: 7 }, (_, i) => ({
      roleId: project.id, bulletId: project.bullets[0]!.id, skill: null, text: `Which checks did it run ${i}?`, kind: "options", options: [], reason: "Gap", gap: "r0",
    })) });
    const res = await post(`/v1/tailor-runs/${run.id}/sections/projects/questions`, { roleId: project.id });
    expect(res.status).toBe(200);
    const { questions } = await res.json() as { questions: { roleId: string; bulletId?: string; section: string }[] };
    expect(questions).toHaveLength(5);
    expect(questions[0]).toMatchObject({ roleId: project.id, bulletId: project.bullets[0]!.id, section: "projects" });
    const sent = lastUser("role") as { role: { id: string } };
    expect(sent.role.id).toBe(project.id);
  });

  it("redoes a finished project with new answers", async () => {
    const run = await start();
    await runItem(run.id, "experience", role.id);
    await acceptItem(run.id, "experience", role.id);
    replies.push({ questions: [{ roleId: project.id, bulletId: null, skill: null, text: "What did it check?", kind: "options", options: [], reason: "Gap", gap: "r0" }] });
    const asked = await (await post(`/v1/tailor-runs/${run.id}/sections/projects/questions`, { roleId: project.id })).json() as { questions: { id: string }[] };
    const saved = await post(`/v1/tailor-runs/${run.id}/answers`, { answers: [{ questionId: asked.questions[0]!.id, value: "Tax codes", via: "typed" }] });
    expect(saved.status).toBe(200);
    // The answer is saved as a job note on the project itself.
    expect((await cv.get()).content.projects[0]!.notes.map((note) => note.answer)).toEqual(["Tax codes"]);
    await runItem(run.id, "projects", project.id);
    await acceptItem(run.id, "projects", project.id);

    const bullet = project.bullets[0]!.id;
    replies.push({ proposals: [{ ...reword(bullet, "Built an Excel checker for payroll tax codes"), reason: null, guesses: null }] }, { results: [] });
    const redo = await post(`/v1/tailor-runs/${run.id}/roles/${project.id}/redo`, { answers: [{ questionId: asked.questions[0]!.id, value: "Payroll tax codes", via: "typed" }] });
    expect(redo.status).toBe(200);
    expect((await cv.get()).content.projects[0]!.notes.map((note) => note.answer)).toEqual(["Payroll tax codes"]);
    replies.push(scoreReply);
    const accepted = await post(`/v1/tailor-runs/${run.id}/roles/${project.id}/accept`, { decisions: [{ itemId: bullet, keep: true }] });
    expect(accepted.status).toBe(200);
    expect(tailored().content.projects[0]!.bullets[0]!.text).toBe("Built an Excel checker for payroll tax codes");
    expect((await getRun(run.id)).currentRoleId).toBe(volunteer.id);
  });

  it("a steering change starts a new run that includes the step again", async () => {
    const run = await start();
    const res = await post(`/v1/tailor-runs/${run.id}/steering`, { tone: "warm" });
    expect(res.status).toBe(200);
    const { run: created } = await res.json() as { run: TailorRun };
    expect(created.sections).toContain("projects");
    expect(created.roleOrder).toEqual([role.id, project.id, volunteer.id]);
  });
});

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
/** Experience steps name the run's current role, as the web does. */
const roleOf = async (runId: string, section: string) =>
  section === "experience" ? { roleId: (await repo().getRun(runId))!.currentRoleId } : {};
async function run(runId: string, section: string, ...items: ModelProposal[]) {
  // The real (strict) model always returns every field: proposals carry reason, null when unused.
  replies.push({ proposals: items.map((item) => ({ reason: null, ...item })) }, { results: [] });
  const res = await post(`/v1/tailor-runs/${runId}/sections/${section}/run`, await roleOf(runId, section));
  expect(res.status).toBe(200);
}
async function accept(runId: string, section: string, body: Record<string, unknown> = {}, score: unknown = scoreReply()) {
  replies.push(score);
  return post(`/v1/tailor-runs/${runId}/sections/${section}/accept`, { ...await roleOf(runId, section), ...body });
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

  it("never writes a flagged proposal: the item keeps its Base wording and no flag question exists", async () => {
    const runId = await start();
    const title = reword(role.id, "Payroll Lead", { field: "title" });
    const claim = reword(first.id, "Cut payroll errors by 30% for 40 staff");
    replies.push({ proposals: [title, claim].map((p) => ({ reason: null, ...p })) }, { results: [] });
    await run(runId, "experience", title, claim);
    expect((await repo().getRun(runId))!.questions ?? []).toEqual([]);
    const res = await accept(runId, "experience", { decisions: [{ itemId: first.id, keep: true }, { itemId: role.id, keep: true }] });
    expect(res.status).toBe(200);
    expect(tailored().content.experience[0]).toMatchObject({ title: role.title, bullets: role.bullets });
    expect((await cv.get()).content.experience[0]!.notes).toEqual([]);
  });

  it("counts a kept inferred skill in Score 2 and leaves a removed one out", async () => {
    const runId = await start();
    await accept(runId, "experience");
    await run(runId, "skills",
      { itemId: "new-skill", field: "name", text: "Payroll software", inferred: true, reason: "Shown in: Team Lead · Acme Payroll" },
      { itemId: "new-skill", field: "name", text: "Tax filing", inferred: true, reason: "Shown in: Team Lead · Acme Payroll" });
    const res = await accept(runId, "skills", {
      inferred: [{ itemId: "new-skill:Payroll software", keep: true }, { itemId: "new-skill:Tax filing", keep: false }],
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
    // Logged under a task the ai_calls allow-list knows.
    expect(model.logged.at(-1)?.task).toBe("tailor_section");

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

  it("drops a headline that is a sentence or too long, keeping the existing title, and asks for a short one", async () => {
    const runId = await start();
    for (const section of ["experience", "skills", "summary", "achievements", "languages"]) await accept(runId, section);
    replies.push({ order: [...base.layout.order], headline: "Payroll specialist, ran payroll for 40 staff, filed taxes." });
    const proposals = (await (await post(`/v1/tailor-runs/${runId}/sections/layout/run`)).json() as { proposals: Proposal[] }).proposals;
    expect(proposals).toEqual([]);
    expect(JSON.stringify(model.requests.at(-1))).toContain("at most 8 words");
  });

  it("adds no new skill past the skills cap", async () => {
    const full = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, name: `Skill ${i}` }));
    await cv.save({ ...base, technicalSkills: full }, 1);
    const runId = await start();
    await accept(runId, "experience");
    await run(runId, "skills", { itemId: "new-skill", field: "name", text: "Payroll software", inferred: true, reason: "Shown in: Team Lead · Acme Payroll" });
    expect((await accept(runId, "skills")).status).toBe(200);
    expect(tailored().content.technicalSkills).toHaveLength(40);
  });

  it("refuses a section that isn't current with 409", async () => {
    const runId = await start();
    const res = await accept(runId, "skills");
    expect(res.status).toBe(409);
    expect(tailored().version).toBe(1);
    expect(await repo().getScore(jobId, "tailored")).toBeNull();
  });
});

describe("experience role by role", () => {
  const roleA = roleWith(["Ran payroll for 40 staff"], { title: "Payroll Lead", company: "Gamma", startDate: "2022-01", current: true, endDate: "" });
  const roleB = roleWith(["Filed taxes"], { title: "Payroll Officer", company: "Delta", startDate: "2019-01", endDate: "2021-12" });
  const roleC = roleWith(["Kept records"], { title: "Clerk", company: "Epsilon", startDate: "2016-01", endDate: "2018-12" });
  const three: CvContent = { ...base, experience: [roleA, roleB, roleC] };
  const sentEdit = () => {
    const body = JSON.parse(String((model.requests.at(-2)!.messages as { content: string }[])[1]!.content)) as {
      items: { edit: { id: string }[]; context: { roles: { id: string }[] } };
    };
    return { edit: body.items.edit.map((r) => r.id), context: body.items.context.roles.map((r) => r.id) };
  };

  beforeEach(async () => { await cv.save(three, 1); });

  it("runs 3 roles in CV order, one run and accept each, with a score after every role, then Skills", async () => {
    const runId = await start();
    expect(await repo().getRun(runId)).toMatchObject({ roleOrder: [roleA.id, roleB.id, roleC.id], currentRoleId: roleA.id });
    for (const [i, current] of [roleA, roleB, roleC].entries()) {
      const bullet = current.bullets[0]!;
      await run(runId, "experience", reword(bullet.id, `${bullet.text} on time`));
      expect(sentEdit()).toEqual({ edit: [current.id], context: [roleA, roleB, roleC].filter((r) => r !== current).map((r) => r.id) });
      const scored = model.logged.filter((call) => call.task === "tailor_score").length;
      const res = await accept(runId, "experience", { decisions: [{ itemId: bullet.id, keep: true }] });
      expect(res.status).toBe(200);
      expect(model.logged.filter((call) => call.task === "tailor_score")).toHaveLength(scored + 1);
      const next = (await res.json() as { run: TailorRun }).run;
      if (i < 2) expect(next).toMatchObject({ currentSection: "experience", currentRoleId: [roleB, roleC][i]!.id });
      else expect(next).toMatchObject({ currentSection: "skills", currentRoleId: null });
    }
    const doc = tailored();
    expect(doc.content.experience.map((r) => r.bullets[0]!.text)).toEqual(["Ran payroll for 40 staff on time", "Filed taxes on time", "Kept records on time"]);
    expect(Object.keys(doc.review!.experience as object)).toEqual([roleA.bullets[0]!.id, roleB.bullets[0]!.id, roleC.bullets[0]!.id]);
  });

  it("accepts a role with nothing to change and moves on", async () => {
    const runId = await start();
    await run(runId, "experience");
    const res = await accept(runId, "experience");
    expect(res.status).toBe(200);
    expect((await res.json() as { run: TailorRun }).run).toMatchObject({ currentSection: "experience", currentRoleId: roleB.id });
  });

  it("refuses a role that isn't current with 409 role_not_current", async () => {
    const runId = await start();
    const runRes = await post(`/v1/tailor-runs/${runId}/sections/experience/run`, { roleId: roleB.id });
    expect(runRes.status).toBe(409);
    expect(await runRes.json()).toMatchObject({ error: { code: "role_not_current" } });
    const res = await accept(runId, "experience", { roleId: roleB.id });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "role_not_current" } });
    expect(await post(`/v1/tailor-runs/${runId}/sections/experience/accept`, {})).toMatchObject({ status: 409 });
    expect(tailored().version).toBe(1);
    expect((await repo().getRun(runId))!.currentRoleId).toBe(roleA.id);
  });

  it("names every role a confirmed skill was used in as a new skill's reason", async () => {
    const runId = await start();
    const question = { id: "q-sql", section: "skills" as const, roleId: null, text: "Do you know SQL?", kind: "skill" as const,
      options: ["Yes", "A little", "No"], reason: "Gap", skill: "SQL" };
    await repo().updateRun(runId, { currentSection: "skills", currentRoleId: null, questions: [question],
      answers: [{ questionId: "q-sql", value: "Yes", via: "option", roleIds: [roleA.id, roleB.id] }] });
    await run(runId, "skills", { itemId: "new-skill", field: "name", text: "SQL", inferred: true, reason: "Shown in: Clerk · Epsilon" });
    const proposals = (await repo().getRun(runId))!.proposals!;
    expect(proposals).toEqual([expect.objectContaining({ itemId: "new-skill", text: "SQL", reason: "Used in: Payroll Lead · Gamma, Payroll Officer · Delta", flags: [] })]);
  });
});

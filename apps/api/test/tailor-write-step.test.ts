import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction, type Proposal, type TailorSection } from "@resumora/shared";
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
const newer = roleWith(["Ran payroll for 40 staff"], { company: "Northwind", title: "Payroll Specialist" });
const older = roleWith(["Checked timesheets every week"], { company: "Contoso", title: "Payroll Assistant" });
const base: CvContent = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop", email: "ana@example.test", titles: ["Payroll Specialist"] },
  experience: [newer, older], technicalSkills: [{ id: "s1", name: "Excel" }] };

let replies: unknown[];
let model: ReturnType<typeof fakeModel>;
let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let scores: MemoryTailorStore;
let cv: CvRepo;
let app: ReturnType<typeof createApp>;
let jobId: string;
/** How many of the next saves of the tailored CV report that someone else saved first. */
let conflicts: number;

beforeEach(async () => {
  replies = [];
  conflicts = 0;
  model = fakeModel(() => replies.shift() ?? { results: [] });
  jobs = memoryJobs({ now: () => new Date("2026-11-27T10:00:00Z") });
  docs = memoryTailorDocs();
  scores = new Map();
  cv = memoryCvRepo();
  await cv.save(base, 0);
  const deps: AppDeps = {
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "token-a" ? { id: "user-a", token } : token === "token-b" ? { id: "user-b", token } : null),
    cvRepo: () => cv,
    importRepo: () => { throw new Error("not used"); },
    jobRepo: (user) => jobs.repoFor(user.id),
    tailorRepo: (user) => {
      const repo = memoryTailorRepo(user.id, scores, docs);
      return { ...repo, saveTailoredCv: async (...args) => (conflicts-- > 0 ? "conflict" : repo.saveTailoredCv(...args)) };
    },
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

const post = (path: string, body: unknown = {}, token = "token-a") => app.request(path, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
});
const repo = () => memoryTailorRepo("user-a", scores, docs);
async function start() {
  const started = await (await post(`/v1/jobs/${jobId}/tailor`, { tone: "formal" })).json() as { run: { id: string }; tailoredCvId: string };
  return { runId: started.run.id, docId: started.tailoredCvId };
}
const write = (runId: string, section: TailorSection, roleId?: string) => post(`/v1/tailor-runs/${runId}/steps/write`, { section, ...(roleId ? { roleId } : {}) });
const reword = (itemId: string, text: string, field = "text") => ({ itemId, field, text, inferred: false, reason: null, guesses: null });
const proposals = (...items: unknown[]) => ({ proposals: items });
const tailored = async (docId: string) => (await repo().readTailoredCv(docId))!;
/** What the scoring step answers. */
const scoreReply = () => ({
  labels: [
    { ref: "r0", kind: "requirement", status: "met", evidence: "payroll", inferred: false },
    { ref: "k:Payroll", kind: "keyword", status: "met", evidence: "payroll", inferred: false },
  ],
  cvSeniority: "mid",
});

describe("writing a step straight into the tailored CV", () => {
  it("writes a role that is not the run's current one, without scoring it or moving the run", async () => {
    const { runId, docId } = await start();
    replies = [proposals(reword(older.bullets[0]!.id, "Checked payroll timesheets every week")), { results: [] }];
    const res = await write(runId, "experience", older.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ changed: 1, removed: 0 });

    const doc = await tailored(docId);
    expect(doc.content.experience[1]!.bullets[0]!.text).toBe("Checked payroll timesheets every week");
    expect(doc.content.experience[0]!.bullets[0]!.text).toBe("Ran payroll for 40 staff");
    expect((doc.review as Record<string, Record<string, unknown>>).experience![older.bullets[0]!.id])
      .toMatchObject({ kept: true, inferred: false, reviewed: false, text: "Checked payroll timesheets every week" });
    expect(model.logged.map((call) => call.task)).toEqual(["tailor_section", "tailor_verify"]);
    expect(docs.scoreStale.has(docId)).toBe(true);
    expect(await repo().getRun(runId)).toMatchObject({ status: "running", currentSection: "experience", currentRoleId: newer.id });
  });

  it("a role no longer ticked for a gap doesn't hand the writer the note its earlier yes left", async () => {
    const { runId } = await start();
    const question = { id: "g1", section: "experience" as const, roleId: null, text: "Did you use KissFlow?", kind: "skill" as const, options: [],
      reason: "The ad asks for KissFlow.", gap: "k:KissFlow", skill: "KissFlow", scope: "all" as const };
    // The first answer ticked both roles, so both carry its note; the answer was then changed to the older role only.
    const note = { id: "n1", question: question.text, answer: "Used KissFlow (Yes)", via: ["pick" as const], askedAt: "2026-11-27T10:00:00.000Z", jobId };
    await cv.addJobNotes(newer.id, [note]);
    await cv.addJobNotes(older.id, [{ ...note, id: "n2" }]);
    await repo().updateRun(runId, { questions: [question], answers: [{ questionId: "g1", value: "Yes", via: "option", use: "used", roleIds: [older.id] }] });

    replies = [proposals(reword(newer.bullets[0]!.id, "Ran accurate payroll for 40 staff")), { results: [] }];
    expect((await write(runId, "experience", newer.id)).status).toBe(200);
    expect(JSON.stringify(model.requests)).not.toContain("Used KissFlow");

    const before = model.requests.length;
    replies = [proposals(reword(older.bullets[0]!.id, "Checked payroll timesheets every week")), { results: [] }];
    expect((await write(runId, "experience", older.id)).status).toBe(200);
    expect(JSON.stringify(model.requests.slice(before))).toContain("Used KissFlow");
    // The note itself stays on the Base CV: only this run's writer doesn't see it.
    expect((await cv.get()).content.experience[0]!.notes).toHaveLength(1);
  });

  it("two steps written at the same time both end up in the tailored CV", async () => {
    const { runId, docId } = await start();
    // Each reply is picked by what the request holds, since the two steps' model calls interleave.
    model = fakeModel(() => {
      const text = JSON.stringify(model.requests.at(-1));
      if (!text.includes("You tailor one section")) return { results: [] };
      return text.includes("Checked timesheets") ? proposals(reword(older.bullets[0]!.id, "Checked payroll timesheets every week"))
        : proposals(reword(newer.bullets[0]!.id, "Ran accurate payroll for 40 staff"));
    });
    const [a, b] = await Promise.all([write(runId, "experience", newer.id), write(runId, "experience", older.id)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const doc = await tailored(docId);
    expect(doc.content.experience.map((role) => role.bullets[0]!.text)).toEqual(["Ran accurate payroll for 40 staff", "Checked payroll timesheets every week"]);
    expect(Object.keys((doc.review as Record<string, Record<string, unknown>>).experience!).sort())
      .toEqual([newer.bullets[0]!.id, older.bullets[0]!.id].sort());
  });

  it("saves again when another step saved first, and gives up with a 409 after 5 tries", async () => {
    const { runId, docId } = await start();
    const reply = () => [proposals(reword(newer.bullets[0]!.id, "Ran accurate payroll for 40 staff")), { results: [] }];
    replies = reply();
    conflicts = 2;
    expect((await write(runId, "experience", newer.id)).status).toBe(200);
    expect((await tailored(docId)).content.experience[0]!.bullets[0]!.text).toBe("Ran accurate payroll for 40 staff");

    replies = reply();
    conflicts = 5;
    const res = await write(runId, "experience", newer.id);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("version_conflict");
  });

  it("writing a role again starts from its Base wording", async () => {
    const { runId, docId } = await start();
    replies = [proposals(reword(newer.bullets[0]!.id, "Ran accurate payroll for 40 staff")), { results: [] }];
    await write(runId, "experience", newer.id);
    replies = [proposals()];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 0, removed: 0 });
    const doc = await tailored(docId);
    expect(doc.content.experience[0]!.bullets[0]!.text).toBe("Ran payroll for 40 staff");
    expect((doc.review as Record<string, Record<string, unknown>>).experience).toEqual({});
  });

  it("writes the skills and the summary like any other step", async () => {
    const { runId, docId } = await start();
    replies = [proposals(reword("s1", "Microsoft Excel", "name")), { results: [] }];
    expect(await (await write(runId, "skills")).json()).toEqual({ changed: 1, removed: 0 });
    replies = [proposals({ ...reword("summary", "Payroll specialist who ran payroll for 40 staff.", "summary"), guesses: [] }), { results: [] }];
    expect((await write(runId, "summary")).status).toBe(200);
    const doc = await tailored(docId);
    expect(doc.content.technicalSkills[0]!.name).toBe("Microsoft Excel");
    expect(doc.content.basics.summary).toBe("Payroll specialist who ran payroll for 40 staff.");
  });

  it("the layout step reads the tailored CV, writes the section order and leaves the headline for the person to choose", async () => {
    const { runId, docId } = await start();
    replies = [proposals({ ...reword("summary", "Payroll lead for 40 staff.", "summary"), guesses: [] }), { results: [] }];
    await write(runId, "summary");
    const order = [...base.layout.order].reverse();
    // "Lead" stands only in the tailored summary: the headline may use it because this step reads the tailored CV.
    replies = [{ order, headline: "Payroll Lead" }];
    expect(await (await write(runId, "layout")).json()).toEqual({ changed: 1, removed: 0 });
    const doc = await tailored(docId);
    expect(doc.content.layout.order).toEqual(order);
    // The headline is proposed, not applied: the titles stay, and the proposal waits in the review state.
    expect(doc.content.basics.titles).toEqual(["Payroll Specialist"]);
    expect((doc.review as Record<string, Record<string, unknown>>).layout).toMatchObject({
      layout: { kept: true, text: order.join(",") },
      headline: { kept: false, reviewed: false, text: "Payroll Lead" },
    });
    expect(await repo().getRun(runId)).toMatchObject({ currentSection: "experience" });
  });

  it("refuses a finished run, a step the run doesn't have, a role the CV doesn't have, and someone else's run", async () => {
    const { runId } = await start();
    expect((await write(runId, "experience", "no-such-role")).status).toBe(409);
    expect((await write(runId, "experience")).status).toBe(409);
    expect((await write(runId, "courses")).status).toBe(409);
    expect((await post(`/v1/tailor-runs/${runId}/steps/write`, { section: "skills" }, "token-b")).status).toBe(404);
    await repo().updateRun(runId, { status: "done", currentSection: null });
    expect((await write(runId, "skills")).status).toBe(409);
    expect(model.requests).toHaveLength(0);
  });
});

describe("the step-by-step routes", () => {
  it("still run and accept a role as before", async () => {
    const { runId, docId } = await start();
    replies = [proposals(reword(newer.bullets[0]!.id, "Ran accurate payroll for 40 staff")), { results: [] }];
    const ran = await (await post(`/v1/tailor-runs/${runId}/sections/experience/run`, { roleId: newer.id })).json() as { proposals: Proposal[] };
    expect(ran.proposals).toHaveLength(1);
    replies = [scoreReply()];
    const accepted = await post(`/v1/tailor-runs/${runId}/sections/experience/accept`, { roleId: newer.id });
    expect(accepted.status).toBe(200);
    expect((await tailored(docId)).content.experience[0]!.bullets[0]!.text).toBe("Ran accurate payroll for 40 staff");
    expect(await repo().getRun(runId)).toMatchObject({ currentRoleId: older.id });
  });
});

describe("finishing a run written step by step", () => {
  const finish = (runId: string, token = "token-a") => post(`/v1/tailor-runs/${runId}/finish`, {}, token);

  it("scores the tailored CV once, saves the score and ends the run", async () => {
    const { runId, docId } = await start();
    replies = [proposals(reword(newer.bullets[0]!.id, "Ran accurate payroll for 40 staff")), { results: [] }];
    await write(runId, "experience", newer.id);
    expect(docs.scoreStale.has(docId)).toBe(true);

    replies = [scoreReply()];
    const res = await finish(runId);
    expect(res.status).toBe(200);
    const body = await res.json() as { run: { status: string; currentSection: string | null }; score: { total: number | null } };
    expect(body.run).toMatchObject({ status: "done", currentSection: null });
    expect(typeof body.score.total).toBe("number");
    expect(model.logged.filter((call) => call.task === "tailor_score")).toHaveLength(1);
    expect(docs.scoreStale.has(docId)).toBe(false);
    expect((await tailored(docId)).score).toMatchObject({ total: body.score.total });
    expect(await repo().getScore(jobId, "tailored", docId)).toMatchObject({ total: body.score.total });

    // Asked again (a second click, a lost reply): the same answer, and no second scoring.
    const calls = model.requests.length;
    const again = await (await finish(runId)).json() as { run: { status: string }; score: { total: number | null } };
    expect(again).toMatchObject({ run: { status: "done" }, score: { total: body.score.total } });
    expect(model.requests).toHaveLength(calls);
  });

  it("does not end the run with a score that misses a step written meanwhile", async () => {
    const { runId, docId } = await start();
    const doc = await tailored(docId);
    // While the score is being worked out, another step saves the tailored CV.
    model = fakeModel(() => {
      void repo().saveTailoredCv(docId, doc.version, { content: doc.content, review: doc.review ?? {}, score: null, scoreStale: true });
      return scoreReply();
    });
    const res = await finish(runId);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("version_conflict");
    expect(await repo().getRun(runId)).toMatchObject({ status: "running" });
    expect(docs.scoreStale.has(docId)).toBe(true);
  });

  it("leaves the run open when the score could not be worked out, and is someone else's run for another user", async () => {
    const { runId } = await start();
    replies = [{ labels: [], cvSeniority: "mid" }];
    expect((await finish(runId)).status).toBe(502);
    expect(await repo().getRun(runId)).toMatchObject({ status: "running", currentSection: "experience" });
    expect((await finish(runId, "token-b")).status).toBe(404);
  });
});

describe("the headline and the section order on the final page", () => {
  const review = async (docId: string, key: string, action: "keep" | "remove") => {
    const doc = await tailored(docId);
    return app.request(`/v1/tailored/${docId}/review`, { method: "PATCH", headers: { authorization: "Bearer token-a", "content-type": "application/json" },
      body: JSON.stringify({ section: "layout", key, action, version: doc.version }) });
  };
  const order = [...base.layout.order].reverse();
  /** A run whose layout step proposed a headline and a new order. */
  async function written(headline: string, titles = ["Payroll Specialist"]) {
    // "and" stands in the summary, so a headline may use it.
    await cv.save({ ...base, basics: { ...base.basics, titles, summary: "Payroll and teams." } }, 1);
    const { runId, docId } = await start();
    replies = [{ order, headline }];
    expect((await write(runId, "layout")).status).toBe(200);
    return docId;
  }
  const state = async (docId: string) => ((await tailored(docId)).review as Record<string, Record<string, { kept: boolean; reviewed: boolean }>>).layout!;

  it("uses the proposed headline when the person picks it, and puts their own titles back when they change their mind", async () => {
    const docId = await written("Payroll Specialist for Staff");
    expect((await review(docId, "headline", "keep")).status).toBe(200);
    expect((await tailored(docId)).content.basics.titles).toEqual(["Payroll Specialist for Staff"]);
    expect((await state(docId)).headline).toMatchObject({ kept: true, reviewed: true });

    expect((await review(docId, "headline", "remove")).status).toBe(200);
    expect((await tailored(docId)).content.basics.titles).toEqual(["Payroll Specialist"]);
    expect((await state(docId)).headline).toMatchObject({ kept: false, reviewed: true });
  });

  it("a headline that holds the other title drops that title", async () => {
    const docId = await written("Payroll Specialist and Team Lead", ["Payroll Specialist", "Team Lead"]);
    expect((await review(docId, "headline", "keep")).status).toBe(200);
    expect((await tailored(docId)).content.basics.titles).toEqual(["Payroll Specialist and Team Lead"]);
    // Their own titles come back whole.
    await review(docId, "headline", "remove");
    expect((await tailored(docId)).content.basics.titles).toEqual(["Payroll Specialist", "Team Lead"]);
  });

  it("a headline keeps the other title when it doesn't hold it", async () => {
    const docId = await written("Payroll Specialist for Staff", ["Payroll Specialist", "Team Lead"]);
    await review(docId, "headline", "keep");
    expect((await tailored(docId)).content.basics.titles).toEqual(["Payroll Specialist for Staff", "Team Lead"]);
  });

  it("writing the layout step again starts from the person's own titles and order, with the headline undecided", async () => {
    const docId = await written("Payroll Specialist and Team Lead", ["Payroll Specialist", "Team Lead"]);
    await review(docId, "headline", "keep");
    const run = (await repo().readTailoredCv(docId))!;
    const runId = [...docs.runs.values()].find((r) => r.tailoredCvId === run.id)!.id;
    // This time nothing new is proposed: the same order as the person's, and the headline they already have.
    replies = [{ order: base.layout.order, headline: "Payroll Specialist" }];
    expect(await (await write(runId, "layout")).json()).toEqual({ changed: 0, removed: 0 });
    const doc = await tailored(docId);
    expect(doc.content.basics.titles).toEqual(["Payroll Specialist", "Team Lead"]);
    expect(doc.content.layout.order).toEqual(base.layout.order);
    expect((doc.review as Record<string, unknown>).layout).toEqual({});
  });

  it("puts the person's own section order back, and the proposed one again", async () => {
    const docId = await written("Payroll Specialist for Staff");
    expect((await tailored(docId)).content.layout.order).toEqual(order);
    expect((await review(docId, "layout", "remove")).status).toBe(200);
    expect((await tailored(docId)).content.layout.order).toEqual(base.layout.order);
    expect((await state(docId)).layout).toMatchObject({ kept: false, reviewed: true });
    expect((await review(docId, "layout", "keep")).status).toBe(200);
    expect((await tailored(docId)).content.layout.order).toEqual(order);
  });

  it("shows an item hidden for this job again, and puts a section's items back in the person's order", async () => {
    const interests = [{ id: "i1", name: "Knitting" }, { id: "i2", name: "Spreadsheets" }];
    await cv.save({ ...base, interests }, 1);
    const { runId, docId } = await start();
    replies = [proposals({ ...reword("order", "i2,i1", "order") }, { ...reword("hide:i1", "Not about payroll", "hidden") }), { results: [] }];
    expect(await (await write(runId, "interests")).json()).toEqual({ changed: 2, removed: 0 });
    expect((await tailored(docId)).content.interests).toEqual([{ id: "i2", name: "Spreadsheets" }, { id: "i1", name: "Knitting", hidden: true }]);
    const undo = async (key: string) => app.request(`/v1/tailored/${docId}/review`, { method: "PATCH", headers: { authorization: "Bearer token-a", "content-type": "application/json" },
      body: JSON.stringify({ section: "interests", key, action: "remove", version: (await tailored(docId)).version }) });

    expect((await undo("hide:i1")).status).toBe(200);
    expect((await tailored(docId)).content.interests).toEqual([{ id: "i2", name: "Spreadsheets" }, { id: "i1", name: "Knitting" }]);
    expect((await undo("order")).status).toBe(200);
    const doc = await tailored(docId);
    expect(doc.content.interests).toEqual(interests);
    expect(doc.review).toMatchObject({ interests: { order: { kept: false, reviewed: true }, "hide:i1": { kept: false, reviewed: true } } });
  });

  it("takes the person's own wording for the headline, and refuses to edit an order", async () => {
    const docId = await written("Payroll Specialist for Staff", ["Payroll Specialist", "Team Lead"]);
    const edit = async (key: string, text: string) => app.request(`/v1/tailored/${docId}/review`, { method: "PATCH", headers: { authorization: "Bearer token-a", "content-type": "application/json" },
      body: JSON.stringify({ section: "layout", key, action: "edit", text, version: (await tailored(docId)).version }) });
    expect((await edit("headline", "Payroll and Team Lead")).status).toBe(200);
    expect((await tailored(docId)).content.basics.titles).toEqual(["Payroll and Team Lead"]);
    expect((await edit("layout", "summary")).status).toBe(400);
    expect((await tailored(docId)).content.layout.order).toEqual(order);
  });

  it("the step-by-step accept drops a doubled title too", async () => {
    await cv.save({ ...base, basics: { ...base.basics, titles: ["Payroll Specialist", "Team Lead"], summary: "Payroll and teams." } }, 1);
    const { runId, docId } = await start();
    await repo().updateRun(runId, { currentSection: "layout" });
    replies = [{ order: base.layout.order, headline: "Payroll Specialist and Team Lead" }];
    await post(`/v1/tailor-runs/${runId}/sections/layout/run`);
    replies = [scoreReply()];
    expect((await post(`/v1/tailor-runs/${runId}/sections/layout/accept`)).status).toBe(200);
    expect((await tailored(docId)).content.basics.titles).toEqual(["Payroll Specialist and Team Lead"]);
  });
});

describe("a new line for a gap the person ticked, when no line of the role can carry it", () => {
  const question = { id: "g1", section: "experience" as const, roleId: null, text: "Did you use KissFlow for approvals?", kind: "skill" as const, options: [],
    reason: "The ad asks for KissFlow.", gap: "k:KissFlow", skill: "KissFlow", scope: "all" as const };
  const line = (text: string) => ({ itemId: "new-bullet", field: "text", text, inferred: false, reason: null, guesses: null });
  const added = (roleId: string, n = 0) => `new-bullet:${roleId}:${n}`;
  /** A run in which the person ticked the newer role for KissFlow, sent as the site sends it. */
  async function ticked() {
    const started = await start();
    await repo().updateRun(started.runId, { questions: [question] });
    expect((await post(`/v1/tailor-runs/${started.runId}/answers`, { answers: [{ questionId: "g1", value: "Yes", via: "option", use: "used", roleIds: [newer.id] }] })).status).toBe(200);
    return started;
  }
  const bullets = async (docId: string, at = 0) => (await tailored(docId)).content.experience[at]!.bullets;

  it("adds the line the writer makes from the answer, after the role's own lines", async () => {
    const { runId, docId } = await ticked();
    replies = [proposals(line("Used KissFlow for payroll approvals for 40 staff")), { results: [] }];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 1, removed: 0 });
    expect(await bullets(docId)).toEqual([newer.bullets[0], { id: added(newer.id), text: "Used KissFlow for payroll approvals for 40 staff" }]);
    expect((await tailored(docId)).review).toMatchObject({ experience: { [added(newer.id)]: { kept: true, inferred: false, reviewed: false, text: "Used KissFlow for payroll approvals for 40 staff" } } });
    // The writer is told which gaps the person confirmed for this role, and when it may add a line.
    const sent = JSON.stringify(model.requests[0]);
    expect(sent).toContain("new-bullet");
    expect(JSON.parse((model.requests[0] as { messages: { content: string }[] }).messages[1]!.content)).toMatchObject({ confirmed: [{ gap: "KissFlow", question: question.text }] });
  });

  it("asks once more, for the ticked gap alone, when the first answer passes it over", async () => {
    const { runId, docId } = await ticked();
    replies = [proposals(), proposals(line("Used KissFlow for payroll approvals")), { results: [] }];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 1, removed: 0 });
    expect((await bullets(docId)).at(-1)).toEqual({ id: added(newer.id), text: "Used KissFlow for payroll approvals" });
    const second = JSON.parse((model.requests[1] as { messages: { content: string }[] }).messages[1]!.content) as { stillMissing?: { gaps: unknown } };
    expect(second.stillMissing?.gaps).toEqual([{ gap: "KissFlow", question: question.text }]);
    // A role nobody ticked is asked once, as before.
    const before = model.requests.length;
    replies = [proposals()];
    await write(runId, "experience", older.id);
    expect(model.requests.length - before).toBe(1);
  });

  it("the second ask can't replace a change the first one made, and a failure of it changes nothing", async () => {
    const { runId, docId } = await ticked();
    // The first answer rewords a line without naming the gap; the second tries to reword the same line and adds one.
    replies = [proposals(reword(newer.bullets[0]!.id, "Ran accurate payroll for 40 staff")), { results: [] },
      proposals(reword(newer.bullets[0]!.id, "Ran payroll for 40 staff in KissFlow"), line("Used KissFlow for payroll approvals")), { results: [] }];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 2, removed: 0 });
    expect((await bullets(docId)).map((bullet) => bullet.text)).toEqual(["Ran accurate payroll for 40 staff", "Used KissFlow for payroll approvals"]);

    // The second ask fails (the model answers with something else): the first answer's change stands.
    replies = [proposals(reword(newer.bullets[0]!.id, "Ran accurate payroll for 40 staff")), { results: [] }, { nonsense: true }];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 1, removed: 0 });
    expect((await bullets(docId)).map((bullet) => bullet.text)).toEqual(["Ran accurate payroll for 40 staff"]);
  });

  it("the second ask adds a line only for the gap still missing, never a second one for a gap the first answer covered", async () => {
    const started = await start();
    const sap = { ...question, id: "g2", text: "Did you use SAP for payroll?", gap: "k:SAP", skill: "SAP" };
    await repo().updateRun(started.runId, { questions: [question, sap] });
    await post(`/v1/tailor-runs/${started.runId}/answers`, { answers: [
      { questionId: "g1", value: "Yes", via: "option", use: "used", roleIds: [newer.id] }, { questionId: "g2", value: "Yes", via: "option", use: "used", roleIds: [newer.id] }] });
    replies = [proposals(line("Used KissFlow for payroll approvals")), { results: [] },
      proposals(line("Used KissFlow for staff approvals"), line("Used SAP for payroll")), { results: [] }];
    expect(await (await write(started.runId, "experience", newer.id)).json()).toEqual({ changed: 2, removed: 0 });
    expect((await bullets(started.docId)).map((bullet) => bullet.text)).toEqual(["Ran payroll for 40 staff", "Used KissFlow for payroll approvals", "Used SAP for payroll"]);
    // Only the missing gap is asked for again.
    const second = JSON.parse((model.requests[2] as { messages: { content: string }[] }).messages[1]!.content) as { stillMissing: { gaps: { gap: string }[] } };
    expect(second.stillMissing.gaps.map((entry) => entry.gap)).toEqual(["SAP"]);
  });

  it("a gap named in two letters gets its line too, and is not asked for again once it is there", async () => {
    const started = await start();
    await repo().updateRun(started.runId, { questions: [{ ...question, text: "Did you use AI for payroll?", gap: "k:AI", skill: "AI" }] });
    await post(`/v1/tailor-runs/${started.runId}/answers`, { answers: [{ questionId: "g1", value: "Yes", via: "option", use: "used", roleIds: [newer.id] }] });
    replies = [proposals(line("Used AI for payroll")), { results: [] }];
    expect(await (await write(started.runId, "experience", newer.id)).json()).toEqual({ changed: 1, removed: 0 });
    expect((await bullets(started.docId)).at(-1)?.text).toBe("Used AI for payroll");
    expect(model.requests).toHaveLength(2);
  });

  it("a role that is full takes no new line, and says nothing changed", async () => {
    const full = { ...newer, bullets: Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, text: `Ran payroll for staff group ${i + 1}` })) };
    await cv.save({ ...base, experience: [full, older] }, 1);
    const { runId, docId } = await ticked();
    replies = [proposals(line("Used KissFlow for payroll approvals")), { results: [] }];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 0, removed: 0 });
    expect(await bullets(docId)).toHaveLength(20);
    expect(JSON.stringify((await tailored(docId)).review)).not.toContain("new-bullet");
  });

  it("sends a line back once when it has words neither the role nor the question has, naming them", async () => {
    const { runId, docId } = await ticked();
    replies = [proposals(line("Used KissFlow to automate invoice approvals across finance")), { results: [] },
      proposals(line("Used KissFlow for payroll approvals")), { results: [] }];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 1, removed: 0 });
    expect((await bullets(docId)).at(-1)).toEqual({ id: added(newer.id), text: "Used KissFlow for payroll approvals" });
    const retry = JSON.stringify(model.requests[2]);
    expect(retry).toContain("automate");
    expect(retry).toContain("invoice");
    expect(retry).toContain("finance");
  });

  it("leaves the role as written when the line still has such words after the retry", async () => {
    const { runId, docId } = await ticked();
    replies = [proposals(line("Used KissFlow to automate invoice approvals")), { results: [] }, proposals(line("Automated invoice approvals in KissFlow")), { results: [] },
      // Asked once more for the gap nothing names yet, the writer has nothing it may say.
      proposals()];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 0, removed: 1 });
    expect(await bullets(docId)).toEqual(newer.bullets);
  });

  it("adds no line that does not name the gap, and none for a role the gap was not ticked for", async () => {
    const { runId, docId } = await ticked();
    // A line made only of the role's own words, with no gap in it, is not what a tick allows.
    replies = [proposals(line("Ran payroll for staff")), { results: [] }, proposals()];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 0, removed: 0 });
    replies = [proposals(line("Used KissFlow for timesheets")), { results: [] }];
    expect(await (await write(runId, "experience", older.id)).json()).toEqual({ changed: 0, removed: 0 });
    expect(await bullets(docId)).toEqual(newer.bullets);
    expect(await bullets(docId, 1)).toEqual(older.bullets);
  });

  it("rewording comes first: a line that already names the gap leaves no room for a new one", async () => {
    const { runId, docId } = await ticked();
    replies = [proposals(reword(newer.bullets[0]!.id, "Ran payroll for 40 staff, with approvals in KissFlow"), line("Used KissFlow for payroll approvals")), { results: [] }];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 1, removed: 0 });
    expect(await bullets(docId)).toEqual([{ id: newer.bullets[0]!.id, text: "Ran payroll for 40 staff, with approvals in KissFlow" }]);
  });

  it("one line per gap, however many the writer sends", async () => {
    const { runId, docId } = await ticked();
    replies = [proposals(line("Used KissFlow for payroll approvals"), line("Used KissFlow for staff approvals")), { results: [] }];
    expect(await (await write(runId, "experience", newer.id)).json()).toEqual({ changed: 1, removed: 0 });
    expect(await bullets(docId)).toHaveLength(2);
  });

  it("writing the role again adds the line once, and Remove takes it out", async () => {
    const { runId, docId } = await ticked();
    const reply = () => [proposals(line("Used KissFlow for payroll approvals")), { results: [] }];
    replies = reply();
    await write(runId, "experience", newer.id);
    replies = reply();
    await write(runId, "experience", newer.id);
    expect(await bullets(docId)).toHaveLength(2);

    const res = await app.request(`/v1/tailored/${docId}/review`, { method: "PATCH", headers: { authorization: "Bearer token-a", "content-type": "application/json" },
      body: JSON.stringify({ section: "experience", key: added(newer.id), action: "remove", version: (await tailored(docId)).version }) });
    expect(res.status).toBe(200);
    expect(await bullets(docId)).toEqual(newer.bullets);
    expect((await tailored(docId)).review).toMatchObject({ experience: { [added(newer.id)]: { kept: false, reviewed: true } } });
  });
});

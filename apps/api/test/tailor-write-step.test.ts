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

  it("the layout step reads the tailored CV and writes the headline and the section order", async () => {
    const { runId, docId } = await start();
    replies = [proposals({ ...reword("summary", "Payroll lead for 40 staff.", "summary"), guesses: [] }), { results: [] }];
    await write(runId, "summary");
    const order = [...base.layout.order].reverse();
    // "Lead" stands only in the tailored summary: the headline may use it because this step reads the tailored CV.
    replies = [{ order, headline: "Payroll Lead" }];
    expect(await (await write(runId, "layout")).json()).toEqual({ changed: 2, removed: 0 });
    const doc = await tailored(docId);
    expect(doc.content.basics.titles[0]).toBe("Payroll Lead");
    expect(doc.content.layout.order).toEqual(order);
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

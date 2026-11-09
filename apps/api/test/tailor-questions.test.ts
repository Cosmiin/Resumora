import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction, type MatchScore, type TailorQuestion as Question } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { roleWith } from "../src/enrich/fake-model.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs, type MemoryTailorStore } from "../src/tailor/memory-repo.ts";

const job: JobExtraction = {
  title: "Engineer", company: "Acme", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [],
  summary: "We are looking for an engineer who will build the tools and work with our team.",
  requirements: [{ text: "Kubernetes", kind: "must", category: "skill" }, { text: "Team lead", kind: "nice", category: "experience" }],
  responsibilities: ["Run the platform"],
};
const score: MatchScore = {
  policy: "match/1", total: 40, band: "low", capped: true,
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null },
  labels: [
    { ref: "r0", kind: "requirement", status: "missing", evidence: null, inferred: false },
    { ref: "r1", kind: "requirement", status: "partial", evidence: "Led 3 people", inferred: true },
  ],
};
const older = roleWith(["Ran payroll"], { startDate: "2018-01", endDate: "2020-01" });
const newest = roleWith(["Led 3 people"], { startDate: "2021-01", endDate: "", current: true });
// CV order: the newest role first, so it is the first current role.
const base: CvContent = { ...emptyCv("en"), experience: [newest, older] };

type ModelQuestion = Omit<Question, "id" | "section" | "gap" | "bulletId"> & { gap: string; bulletId: string | null };
const ask = (text: string, over: Partial<ModelQuestion> = {}): ModelQuestion =>
  ({ roleId: newest.id, bulletId: null, text, kind: "options", options: ["Yes", "No"], reason: "Gap", gap: "r0", ...over });

let replies: ModelQuestion[][];
let model: ReturnType<typeof fakeModel>;
let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let scores: MemoryTailorStore;
let cv: CvRepo;
let app: ReturnType<typeof createApp>;
let jobId: string;

beforeEach(async () => {
  replies = [];
  model = fakeModel(() => ({ questions: replies.shift() ?? [] }));
  jobs = memoryJobs({ now: () => new Date("2026-11-08T10:00:00Z") });
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
  await memoryTailorRepo("user-a", scores).saveScore(jobId, "base", null, score);
});

const call = (path: string, body: unknown = {}, token = "token-a") => app.request(path, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
});
async function startRun() {
  const res = await call(`/v1/jobs/${jobId}/tailor`, { tone: "neutral" });
  return (await res.json() as { run: { id: string } }).run.id;
}
/** Experience questions name the run's current role, as the web does. */
const questions = async (runId: string, section: string, roleId?: string) => {
  const current = (await memoryTailorRepo("user-a", scores, docs).getRun(runId))!.currentRoleId;
  const res = await call(`/v1/tailor-runs/${runId}/sections/${section}/questions`,
    section === "experience" ? { roleId: roleId ?? current } : {});
  expect(res.status).toBe(200);
  return (await res.json() as { questions: Question[] }).questions;
};
const jobNotes = async () => (await cv.get()).content.experience.flatMap((role) =>
  role.notes.filter((note) => note.jobId === jobId).map((note) => ({ roleId: role.id, ...note })));

describe("job questions", () => {
  it("asks from the section's gaps with the cheap tier: 5 per role, 5 in Skills, 8 across the other sections", async () => {
    const runId = await startRun();
    replies = [Array.from({ length: 6 }, (_, i) => ask(`Experience ${i}?`)), Array.from({ length: 6 }, (_, i) => ask(`Skill ${i}?`, { roleId: null })),
      Array.from({ length: 6 }, (_, i) => ask(`Summary ${i}?`, { roleId: null, gap: "r1" }))];
    const first = await questions(runId, "experience");
    expect(first).toHaveLength(5);
    expect(first[0]).toMatchObject({ section: "experience", roleId: newest.id, text: "Experience 0?", id: expect.any(String) });
    expect(model.logged[0]).toMatchObject({ task: "tailor_questions", userId: "user-a" });
    const sent = JSON.stringify(model.requests[0]);
    expect(sent).toContain("Kubernetes");
    expect(sent).toContain("ask for it instead of guessing");
    expect(sent).toContain("experience");
    expect(await questions(runId, "skills")).toHaveLength(5);
    expect(await questions(runId, "summary")).toHaveLength(3);
    expect(await questions(runId, "achievements")).toEqual([]);
    expect(model.requests).toHaveLength(3);
  });

  it("gives every Experience question the current role, whatever role the model names, and keeps only that role's bullets", async () => {
    const runId = await startRun();
    replies = [[ask("We think you led a team because of 'Led 3 people'. Correct?", { kind: "confirm_inferred", bulletId: newest.bullets[0]!.id }),
      ask("Ghost role?", { roleId: "nope" }), ask("Older role?", { roleId: older.id, bulletId: older.bullets[0]!.id }), ask("No role?", { roleId: null })]];
    const got = await questions(runId, "experience");
    expect(got.map((q) => [q.kind, q.roleId, q.bulletId])).toEqual([
      ["confirm_inferred", newest.id, newest.bullets[0]!.id], ["options", newest.id, undefined], ["options", newest.id, undefined], ["options", newest.id, undefined],
    ]);
    expect((await memoryTailorRepo("user-a", scores, docs).getRun(runId))!.questions!.every((q) => q.roleId === newest.id)).toBe(true);
    // The model sees the role to ask about, and the other roles as read-only context.
    const sent = JSON.parse(String((model.requests[0]!.messages as { content: string }[])[1]!.content)) as { role: { id: string }; cv: CvContent };
    expect(sent.role.id).toBe(newest.id);
    expect(sent.cv.experience.map((r) => r.id)).toEqual([older.id]);
  });

  it("asks a gap open in 2 roles once in each role, but not twice in one role", async () => {
    const runId = await startRun();
    replies = [[ask("Have you used Kubernetes?")]];
    const [inFirst] = await questions(runId, "experience");
    await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: inFirst!.id, value: "No", via: "option" }] });
    replies = [[ask("Have you used Kubernetes?")]];
    expect(await questions(runId, "experience")).toEqual([]);
    // Accept moves the run to the next role (set directly here: the accept flow has its own tests).
    await memoryTailorRepo("user-a", scores, docs).updateRun(runId, { currentRoleId: older.id });
    replies = [[ask("Have you used Kubernetes?")]];
    const inSecond = await questions(runId, "experience");
    expect(inSecond).toEqual([expect.objectContaining({ text: "Have you used Kubernetes?", gap: "r0", roleId: older.id })]);
  });

  it("refuses an Experience question for a role that isn't current with 409", async () => {
    const runId = await startRun();
    for (const body of [{ roleId: older.id }, {}]) {
      const res = await call(`/v1/tailor-runs/${runId}/sections/experience/questions`, body);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: { code: "role_not_current" } });
    }
    expect(model.requests).toHaveLength(0);
  });

  it("never asks about a gap again once it was answered in the run, however the question is worded", async () => {
    const runId = await startRun();
    replies = [[ask("How many clusters did you run on Kubernetes?")]];
    const [first] = await questions(runId, "experience");
    expect(first).toMatchObject({ gap: "r0" });
    await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: first!.id, value: "Three", via: "typed" }] });
    replies = [[ask("What size were your Kubernetes clusters?"), ask("Did you lead the team?", { gap: "r1" }), ask("Off-topic?", { gap: "r9" })]];
    const second = await questions(runId, "skills");
    expect(second.map((q) => q.text)).toEqual(["Did you lead the team?"]);
    expect(JSON.stringify(JSON.parse(String((model.requests[1]!.messages as { content: string }[])[1]!.content)).gaps)).not.toContain("Kubernetes");
    await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: second[0]!.id, value: "Yes", via: "option" }] });
    // Every gap is answered: no model call at all.
    expect(await questions(runId, "summary")).toEqual([]);
    expect(model.requests).toHaveLength(2);
  });

  it("lets a skipped gap come back once, not repeatedly", async () => {
    const runId = await startRun();
    const skip = async (question: Question) =>
      call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: question.id, value: null, via: "skip" }] });
    replies = [[ask("Kubernetes?")]];
    await skip((await questions(runId, "experience"))[0]!);
    replies = [[ask("Kubernetes, any at all?")]];
    const again = await questions(runId, "skills");
    expect(again.map((q) => q.text)).toEqual(["Kubernetes, any at all?"]);
    await skip(again[0]!);
    replies = [[ask("Kubernetes, really none?"), ask("Lead?", { gap: "r1" })]];
    expect((await questions(runId, "summary")).map((q) => q.text)).toEqual(["Lead?"]);
  });

  it("does not ask again what was already answered for this job in an earlier run", async () => {
    const runId = await startRun();
    replies = [[ask("Have you used Kubernetes?")]];
    const [asked] = await questions(runId, "experience");
    expect((await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: asked!.id, value: "Yes, 2 years", via: "typed" }] })).status).toBe(200);
    const later = await memoryTailorRepo("user-a", scores, docs).createRun({
      jobId, tailoredCvId: (await memoryTailorRepo("user-a", scores, docs).getRun(runId))!.tailoredCvId!,
      kind: "retailor", sections: ["experience"], currentSection: "experience", roleOrder: [newest.id, older.id],
    });
    replies = [[ask("  have you used kubernetes? "), ask("Which cloud did you run it on?")]];
    const again = await questions(later.id, "experience");
    expect(again.map((q) => q.text)).toEqual(["Which cloud did you run it on?"]);
    expect(JSON.stringify(model.requests[1])).toContain("Yes, 2 years");
  });

  it("returns 404 job_not_found for another user's run", async () => {
    const runId = await startRun();
    const res = await call(`/v1/tailor-runs/${runId}/sections/experience/questions`, {}, "token-b");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "job_not_found" } });
  });
});

describe("answers", () => {
  it("stores answers in the run and saves job notes: skip none, voice and option mapped, each on its question's role", async () => {
    const runId = await startRun();
    await memoryTailorRepo("user-a", scores, docs).updateRun(runId, { currentRoleId: older.id });
    replies = [[ask("Kubernetes?"), ask("Docker?")]];
    const [k] = await questions(runId, "experience");
    await memoryTailorRepo("user-a", scores, docs).updateRun(runId, { currentRoleId: newest.id });
    replies = [[ask("Lead?")]];
    const [lead] = await questions(runId, "experience");
    replies = [[ask("Terraform?", { roleId: null })]];
    const [terraform] = await questions(runId, "skills");
    const answers = [
      { questionId: k!.id, value: "Yes", via: "option" },
      { questionId: lead!.id, value: "I led four people", via: "voice" },
      { questionId: terraform!.id, value: null, via: "skip" },
    ];
    const res = await call(`/v1/tailor-runs/${runId}/answers`, { answers });
    expect(res.status).toBe(200);
    const notes = await jobNotes();
    expect(notes).toHaveLength(2);
    expect(notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: older.id, question: "Kubernetes?", answer: "Yes", via: ["pick"], jobId }),
      expect.objectContaining({ roleId: newest.id, question: "Lead?", answer: "I led four people", via: ["voice"], jobId }),
    ]));
    const run = await (await app.request(`/v1/tailor-runs/${runId}`, { headers: { authorization: "Bearer token-a" } })).json() as { answers: unknown };
    expect(run.answers).toEqual(answers);
  });

  it("puts a skills question's typed answer on the newest role", async () => {
    const runId = await startRun();
    replies = [[ask("Terraform?", { roleId: null })]];
    const [terraform] = await questions(runId, "skills");
    await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: terraform!.id, value: "Some", via: "typed" }] });
    expect(await jobNotes()).toEqual([expect.objectContaining({ roleId: newest.id, via: ["type"] })]);
  });

  it("rejects an answer to a question the run never asked", async () => {
    const runId = await startRun();
    const res = await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: "unknown", value: "x", via: "typed" }] });
    expect(res.status).toBe(400);
    expect(await jobNotes()).toEqual([]);
  });
});

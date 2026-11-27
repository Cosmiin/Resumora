import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction, type MatchScore, type TailorQuestion as Question } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { roleWith } from "../src/enrich/fake-model.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { stripHeader } from "../src/tailor/strip-header.ts";
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

type ModelQuestion = Omit<Question, "id" | "section" | "gap" | "bulletId" | "skill"> & { gap: string; bulletId: string | null; skill: string | null };
const ask = (text: string, over: Partial<ModelQuestion> = {}): ModelQuestion =>
  ({ roleId: newest.id, bulletId: null, skill: null, text, kind: "options", options: ["Yes", "No"], reason: "Gap", gap: "r0", ...over });

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
    (section === "experience" || section === "projects") ? { roleId: roleId ?? current } : {});
  expect(res.status).toBe(200);
  return (await res.json() as { questions: Question[] }).questions;
};
/** One more gap in the base score, for a step after a gap was already asked (a gap is asked once per run). */
const addKeywordGap = (word: string) => memoryTailorRepo("user-a", scores).saveScore(jobId, "base", null,
  { ...score, labels: [...score.labels, { ref: `k:${word}`, kind: "keyword", status: "missing", evidence: null, inferred: false }] });
const jobNotes = async () => (await cv.get()).content.experience.flatMap((role) =>
  role.notes.filter((note) => note.jobId === jobId).map((note) => ({ roleId: role.id, ...note })));

describe("job questions", () => {
  it("sends saved and current-run answers with their role's period in Skills questions", async () => {
    const content: CvContent = { ...base, experience: [
      { ...newest, notes: [{ id: "current-note", question: "Which tools?", answer: "Used SQL", via: ["type"], askedAt: "2026-11-01T10:00:00Z", jobId }] },
      { ...older, notes: [{ id: "past-note", question: "What changed?", answer: "Reduced payroll errors", via: ["voice"], askedAt: "2026-11-02T10:00:00Z", jobId }] },
    ] };
    await cv.save(content, 1);
    const runId = await startRun();
    await memoryTailorRepo("user-a", scores, docs).updateRun(runId, {
      questions: [{ id: "past-question", section: "experience", roleId: older.id, text: "How many accounts?",
        kind: "options", options: ["Ten", "Twenty"], reason: "Gap", gap: "r0" }],
      answers: [{ questionId: "past-question", value: "Twenty", via: "option" }],
    });
    await questions(runId, "skills");
    const sent = JSON.parse((model.requests[0]!.messages as { content: string }[])[1]!.content);
    expect(sent.answered).toEqual([
      { question: "Which tools?", answer: "Used SQL", period: "2021-01 – present" },
      { question: "What changed?", answer: "Reduced payroll errors", period: "2018-01 – 2020-01" },
      { question: "How many accounts?", answer: "Twenty", period: "2018-01 – 2020-01" },
    ]);
  });

  it("asks from the section's gaps with the cheap tier: 5 per role, 5 in Skills, 8 across the other sections", async () => {
    await addKeywordGap("docker");
    const runId = await startRun();
    replies = [Array.from({ length: 6 }, (_, i) => ask(`Experience ${i}?`)), Array.from({ length: 6 }, (_, i) => ask(`Skill ${i}?`, { roleId: null, gap: "r1" })),
      Array.from({ length: 6 }, (_, i) => ask(`Summary ${i}?`, { roleId: null, gap: "k:docker" }))];
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

  it.each([
    { name: "a confirmed tailored match", inferred: false, offered: false },
    { name: "an inferred tailored match", inferred: true, offered: true },
    { name: "no tailored score yet", inferred: null, offered: true },
  ])("filters a later role's base gaps with $name", async ({ inferred, offered }) => {
    const repo = memoryTailorRepo("user-a", scores, docs);
    const gap: MatchScore["labels"][number] = { ref: "r2", kind: "requirement", status: "missing", inferred: false, evidence: null };
    await jobs.admin.finish(jobId, { ...job, requirements: [...job.requirements, { text: "Incident response", kind: "must", category: "skill" }] });
    await repo.saveScore(jobId, "base", null, { ...score, labels: [...score.labels, gap] });
    const runId = await startRun();
    const run = (await repo.getRun(runId))!;
    if (inferred !== null) {
      const tailoredScore: MatchScore = { ...score, requirementTexts: ["Kubernetes", "Team lead", "Incident response"],
        labels: [...score.labels, { ...gap, status: "met", inferred, evidence: "Handled incidents" }] };
      const doc = (await repo.readTailoredCv(run.tailoredCvId!))!;
      await repo.saveTailoredCv(doc.id, doc.version, { content: doc.content, review: {}, score: tailoredScore });
      await repo.saveScore(jobId, "tailored", doc.id, tailoredScore);
    }
    await repo.updateRun(runId, { currentRoleId: older.id });
    replies = [[ask("Did you handle incidents?", { gap: "r2" }), ask("Did you lead a team?", { gap: "r1" })]];
    const got = await questions(runId, "experience");
    const sent = JSON.parse((model.requests[0]!.messages as { content: string }[])[1]!.content);
    expect(sent.gaps.map((label: { ref: string }) => label.ref)).toEqual(offered ? ["r0", "r1", "r2"] : ["r0", "r1"]);
    expect(got.map((question) => question.gap)).toEqual(offered ? ["r2", "r1"] : ["r1"]);
    expect((await repo.getRun(runId))!.questions).toEqual(got);
  });

  it.each([
    { baseRef: "k:sql", tailoredRef: "k:SQL", inferred: false, offered: false },
    { baseRef: "k:SQL", tailoredRef: "k:sql", inferred: false, offered: false },
    { baseRef: "k:sql", tailoredRef: "k:SQL", inferred: true, offered: true },
  ])("matches keyword gaps $baseRef and $tailoredRef with inferred=$inferred", async ({ baseRef, tailoredRef, inferred, offered }) => {
    const repo = memoryTailorRepo("user-a", scores, docs);
    const keyword: MatchScore["labels"][number] = { ref: baseRef, kind: "keyword", status: "missing", evidence: null, inferred: false };
    await repo.saveScore(jobId, "base", null, { ...score, labels: [...score.labels, keyword] });
    const runId = await startRun();
    const run = (await repo.getRun(runId))!;
    const doc = (await repo.readTailoredCv(run.tailoredCvId!))!;
    const tailoredScore: MatchScore = { ...score, requirementTexts: ["Kubernetes", "Team lead"], labels: [
      { ...score.labels[0]!, ref: "R0", status: "met", evidence: "Ran Kubernetes clusters" },
      { ...keyword, ref: tailoredRef, status: "met", evidence: "Used SQL", inferred },
    ] };
    await repo.saveTailoredCv(doc.id, doc.version, { content: doc.content, review: {}, score: tailoredScore });
    await repo.saveScore(jobId, "tailored", doc.id, tailoredScore);
    replies = [[ask("Did you use SQL?", { gap: baseRef }), ask("Did you lead a team?", { gap: "r1" })]];
    const got = await questions(runId, "experience");
    const sent = JSON.parse((model.requests[0]!.messages as { content: string }[])[1]!.content);
    expect(sent.gaps.map((label: { ref: string }) => label.ref)).toEqual(offered ? ["r0", "r1", baseRef] : ["r0", "r1"]);
    expect(got.map((question) => question.gap)).toEqual(offered ? [baseRef, "r1"] : ["r1"]);
    expect((await repo.getRun(runId))!.questions).toEqual(got);
  });

  it.each(["changed requirement text", "no stored requirement texts"])("offers requirement gaps with %s while matching keywords by term", async (scenario) => {
    const repo = memoryTailorRepo("user-a", scores, docs);
    const keyword: MatchScore["labels"][number] = { ref: "k:platform", kind: "keyword", status: "missing", evidence: null, inferred: false };
    await repo.saveScore(jobId, "base", null, { ...score, labels: [...score.labels, keyword] });
    const runId = await startRun();
    const run = (await repo.getRun(runId))!;
    const doc = (await repo.readTailoredCv(run.tailoredCvId!))!;
    const tailoredScore: MatchScore = { ...score,
      ...(scenario === "changed requirement text" ? { requirementTexts: ["Kubernetes", "Team lead"] } : {}),
      labels: [
        { ...score.labels[0]!, status: "met", evidence: "Ran Kubernetes clusters" },
        score.labels[1]!, { ...keyword, status: "met", evidence: "Ran the platform" },
      ],
    };
    await repo.saveTailoredCv(doc.id, doc.version, { content: doc.content, review: {}, score: tailoredScore });
    await repo.saveScore(jobId, "tailored", doc.id, tailoredScore);
    if (scenario === "changed requirement text") {
      await jobs.admin.finish(jobId, { ...job, requirements: [{ ...job.requirements[0]!, text: "Docker" }, job.requirements[1]!] });
    }
    replies = [[ask("Have you used Docker?"), ask("Did you run the platform?", { gap: "k:platform" })]];
    const got = await questions(runId, "experience");
    const sent = JSON.parse((model.requests[0]!.messages as { content: string }[])[1]!.content);
    expect(sent.gaps.map((label: { ref: string }) => label.ref)).toEqual(["r0", "r1"]);
    expect(got).toEqual([expect.objectContaining({ gap: "r0" })]);
    expect((await repo.getRun(runId))!.questions).toEqual(got);
  });

  it("offers a gap again after a steering restart resets wording, despite the old tailored score", async () => {
    const runId = await startRun();
    const repo = memoryTailorRepo("user-a", scores, docs);
    const run = (await repo.getRun(runId))!;
    const doc = (await repo.readTailoredCv(run.tailoredCvId!))!;
    const tailoredScore: MatchScore = { ...score, requirementTexts: ["Kubernetes", "Team lead"], labels: score.labels.map((label) => label.ref === "r0"
      ? { ...label, status: "met", inferred: false, evidence: "Ran Kubernetes clusters" } : label) };
    const content = structuredClone(doc.content);
    content.experience[0]!.bullets[0]!.text = "Ran Kubernetes clusters";
    await repo.saveTailoredCv(doc.id, doc.version, { content, review: {}, score: tailoredScore });
    await repo.saveScore(jobId, "tailored", doc.id, tailoredScore);
    await repo.updateRun(runId, { currentRoleId: older.id });
    await questions(runId, "experience");
    const before = JSON.parse((model.requests[0]!.messages as { content: string }[])[1]!.content);
    expect(before.gaps.map((label: { ref: string }) => label.ref)).toEqual(["r1"]);

    const restarted = await call(`/v1/tailor-runs/${runId}/steering`, { tone: "warm" });
    expect(restarted.status).toBe(200);
    const { run: next } = await restarted.json() as { run: { id: string } };
    expect(await repo.getScore(jobId, "tailored", doc.id)).toEqual(tailoredScore);
    expect(await repo.readTailoredCv(doc.id)).toMatchObject({ content: base, score });
    replies = [[ask("Have you used Kubernetes?")]];
    expect(await questions(next.id, "experience")).toEqual([expect.objectContaining({ gap: "r0" })]);
    const after = JSON.parse((model.requests[1]!.messages as { content: string }[])[1]!.content);
    expect(after.gaps.map((label: { ref: string }) => label.ref)).toEqual(["r0", "r1"]);
  });

  it.each([
    { name: "one focus role", focusRoleIds: [newest.id] },
    { name: "an empty focus list", focusRoleIds: [] },
    { name: "no focus setting", focusRoleIds: undefined },
  ])("enforces each role's prompt and stored question cap with $name", async ({ focusRoleIds }) => {
    const runId = await startRun();
    const repo = memoryTailorRepo("user-a", scores, docs);
    const run = (await repo.getRun(runId))!;
    await repo.setSteering(run.tailoredCvId!, { focusRoleIds });
    for (const role of [newest, older]) {
      await repo.updateRun(runId, { currentRoleId: role.id });
      replies = [Array.from({ length: 6 }, (_, i) => ask(`Question ${i} for ${role.id}?`, { gap: role === newest ? "r0" : "r1" }))];
      const got = await questions(runId, "experience");
      const nonFocus = !!focusRoleIds?.length && !focusRoleIds.includes(role.id);
      const max = nonFocus ? 2 : 5;
      expect(got).toHaveLength(max);
      const sent = JSON.parse((model.requests.at(-1)!.messages as { content: string }[])[1]!.content);
      expect(sent.max).toBe(max);
      // Focus roles change the number of questions only; the model is not told which roles are in focus.
      expect(sent).not.toHaveProperty("focus");
      expect(sent.steering).not.toMatch(/lean/i);
      expect((await repo.getRun(runId))!.questions!.filter((question) => question.roleId === role.id)).toEqual(got);
      const calls = model.requests.length;
      expect(await questions(runId, "experience")).toEqual([]);
      expect(model.requests).toHaveLength(calls);
    }
  });

  it("gives every role five questions when all focus roles have been deleted", async () => {
    const runId = await startRun();
    const repo = memoryTailorRepo("user-a", scores, docs);
    const run = (await repo.getRun(runId))!;
    await repo.setSteering(run.tailoredCvId!, { focusRoleIds: ["deleted-role"] });
    for (const role of [newest, older]) {
      await repo.updateRun(runId, { currentRoleId: role.id });
      replies = [Array.from({ length: 6 }, (_, i) => ask(`Question ${i} for ${role.id}?`, { gap: role === newest ? "r0" : "r1" }))];
      const got = await questions(runId, "experience");
      expect(got).toHaveLength(5);
      const sent = JSON.parse((model.requests.at(-1)!.messages as { content: string }[])[1]!.content);
      expect(sent.max).toBe(5);
      expect(sent).not.toHaveProperty("focus");
      expect(sent.steering).not.toContain("They want to lean on other roles more than this one.");
      expect((await repo.getRun(runId))!.questions!.filter((question) => question.roleId === role.id)).toEqual(got);
    }
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
    const sent = JSON.parse(String((model.requests[0]!.messages as { content: string }[])[1]!.content));
    expect(sent.role.id).toBe(newest.id);
    expect(sent).not.toHaveProperty("cv");
  });

  // A project gets no tailoring questions (src/tailor/questions.test.ts).
  it.each(["experience", "volunteering"] as const)("sends only the current %s item, its period and notes; Skills still sees every role", async (kind) => {
    const roles = ["Northwind Traders", "Contoso Labs", "Fabrikam Ltd"].map((company, index) => roleWith([
      `Handled ${company} accounts`,
    ], { company, title: `Analyst ${index}`, startDate: `200${index}-01`, endDate: `200${index + 1}-12`, notes: [
      { id: crypto.randomUUID(), question: "Anything else?", answer: `Enrichment answer at ${company}`, via: ["type"], askedAt: "2026-11-01T10:00:00Z" },
      { id: crypto.randomUUID(), question: "Which methods?", answer: `Job answer at ${company}`, via: ["voice"], askedAt: "2026-11-02T10:00:00Z", jobId },
    ] }));
    const a = roles[0]!, b = roles[1]!, c = roles[2]!;
    const section = kind === "experience" ? "experience" : "projects";
    const content: CvContent = { ...emptyCv("ro"), experience: kind === "experience" ? roles : [a, c],
      projects: [], volunteering: kind === "volunteering" ? [b] : [] };
    await cv.save(content, 1);
    const repo = memoryTailorRepo("user-a", scores, docs);
    await repo.saveScore(jobId, "base", null, { ...score, labels: [
      score.labels[0]!, { ...score.labels[1]!, evidence: a.bullets[0]!.text },
      { ref: "k:platform", kind: "keyword", status: "partial", inferred: false, evidence: c.bullets[0]!.text },
    ] });
    const runId = await startRun();
    const run = (await repo.getRun(runId))!;
    await repo.setSteering(run.tailoredCvId!, { focusRoleIds: [a.id] });
    await repo.updateRun(runId, { currentSection: section, currentRoleId: b.id });
    await questions(runId, section, b.id);
    const messages = model.requests[0]!.messages as { content: string }[];
    const user = messages[1]!.content;
    const sent = JSON.parse(user);
    expect(Object.keys(sent).sort()).toEqual(["answered", "cvLanguage", "gaps", "job", "max", "questionLanguage", "role", "rolePeriod", "section", "steering"]);
    // When the role ran is spelled out, so a question can fit its years.
    expect(sent.rolePeriod).toBe(b.current ? `${b.startDate} to today` : `${b.startDate} to ${b.endDate}`);
    expect(messages[0]!.content).toContain("a role that ended in 2015 gets no question about AI-powered or prompt based tools");
    expect(sent.role).toMatchObject({ ...b, kind: kind === "experience" ? "role" : kind,
      notes: b.notes.map((note) => ({ ...note, period: "2001-01 – 2002-12" })) });
    expect((await cv.get()).content).toEqual(content);
    expect(sent.cvLanguage).toBe("ro");
    expect(sent.section).toBe(section);
    expect(sent).toMatchObject({ max: 2 });
    expect(sent.answered).toEqual([{ question: b.notes[1]!.question, answer: b.notes[1]!.answer, period: "2001-01 – 2002-12" }]);
    expect(sent.steering).not.toMatch(/lean/i);
    expect(sent.gaps).toContainEqual(expect.objectContaining({ ref: "r1", status: "partial" }));
    expect(sent.gaps.every((gap: object) => !("evidence" in gap))).toBe(true);
    for (const other of [a, c]) {
      for (const value of [other.company, other.title, ...other.bullets.map(bullet => bullet.text), ...other.notes.map(note => note.answer)]) {
        expect(user).not.toContain(value);
      }
    }
    expect(messages[0]!.content).toContain("One role at a time.");
    expect(messages[0]!.content).toContain('Do not mention another employer, role or project, and do not write "your previous roles" or "your other roles".');
    expect(messages[0]!.content).toContain("\"rolePeriod\" says when the role ran. Read it before you write anything, and ask only about tools, methods and practices that were in ordinary use at work in those years and fit that work.");
    expect(messages[0]!.content).toContain("Do not add an option meaning other, something else or none of the above");
    expect(messages[0]!.content).not.toMatch(/focus role/i);
    await questions(runId, "skills");
    const skills = JSON.parse((model.requests[1]!.messages as { content: string }[])[1]!.content);
    expect(skills).not.toHaveProperty("role");
    expect(skills).not.toHaveProperty("focus");
    expect(skills.cv).toEqual({ ...stripHeader(content).cv, layout: undefined });
    expect(skills.gaps).toContainEqual(expect.objectContaining({ ref: "r1", evidence: a.bullets[0]!.text }));
  });

  it.each([
    [["Yes", "No", "Other (please specify)", "Something else."], ["Yes", "No"]],
    [["Other teams in the region", " others! ", "NONE OF THE ABOVE..."], ["Other teams in the region"]],
    [[" Other (please specify). ", "Something else"], []],
  ])("stores the remaining options even when fewer than two survive: %j", async (options, expected) => {
    const runId = await startRun();
    replies = [[ask("Which methods did you use?", { options })]];
    const got = await questions(runId, "experience");
    expect(got).toHaveLength(1);
    expect(got[0]!.options).toEqual(expected);
    expect((await memoryTailorRepo("user-a", scores, docs).getRun(runId))!.questions).toEqual(got);
  });

  it("asks a gap in one role only: the next role does not ask it again", async () => {
    const runId = await startRun();
    replies = [[ask("Have you used Kubernetes?")]];
    const [inFirst] = await questions(runId, "experience");
    await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: inFirst!.id, value: "No", via: "option" }] });
    replies = [[ask("Have you used Kubernetes?")]];
    expect(await questions(runId, "experience")).toEqual([]);
    // Accept moves the run to the next role (set directly here: the accept flow has its own tests).
    await memoryTailorRepo("user-a", scores, docs).updateRun(runId, { currentRoleId: older.id });
    replies = [[ask("Kubernetes in this role?"), ask("Did you lead the team?", { gap: "r1" })]];
    const inSecond = await questions(runId, "experience");
    expect(inSecond.map((q) => q.gap)).toEqual(["r1"]);
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
    replies = [[ask("What size were your Kubernetes clusters?", { roleId: null }), ask("Did you lead the team?", { gap: "r1", roleId: null }), ask("Off-topic?", { gap: "r9", roleId: null })]];
    const second = await questions(runId, "skills");
    expect(second.map((q) => q.text)).toEqual(["Did you lead the team?"]);
    expect(JSON.stringify(JSON.parse(String((model.requests[1]!.messages as { content: string }[])[1]!.content)).gaps)).not.toContain("Kubernetes");
    await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: second[0]!.id, value: "Yes", via: "option" }] });
    // Every gap is answered: no model call at all.
    expect(await questions(runId, "summary")).toEqual([]);
    expect(model.requests).toHaveLength(2);
  });

  it("never asks a skipped gap again, in any section", async () => {
    const runId = await startRun();
    const skip = async (question: Question) =>
      call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: question.id, value: null, via: "skip" }] });
    replies = [[ask("Kubernetes?")]];
    await skip((await questions(runId, "experience"))[0]!);
    replies = [[ask("Kubernetes, any at all?", { roleId: null }), ask("Lead?", { gap: "r1", roleId: null })]];
    const again = await questions(runId, "skills");
    expect(again.map((q) => q.text)).toEqual(["Lead?"]);
    await skip(again[0]!);
    expect(await questions(runId, "summary")).toEqual([]);
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
    await addKeywordGap("terraform");
    const runId = await startRun();
    await memoryTailorRepo("user-a", scores, docs).updateRun(runId, { currentRoleId: older.id });
    replies = [[ask("Kubernetes?"), ask("Docker?")]];
    const [k] = await questions(runId, "experience");
    await memoryTailorRepo("user-a", scores, docs).updateRun(runId, { currentRoleId: newest.id });
    replies = [[ask("Lead?", { gap: "r1" })]];
    const [lead] = await questions(runId, "experience");
    replies = [[ask("Terraform?", { roleId: null, gap: "k:terraform" })]];
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

describe("skills questions", () => {
  const skillAsk = (skill: string, over: Partial<ModelQuestion> = {}) =>
    ask(`Do you know ${skill}?`, { roleId: null, skill, options: ["Yes", "A little", "No"], ...over });

  it("asks one skill per question with no role, and drops a question the model ties to a role", async () => {
    const runId = await startRun();
    replies = [[skillAsk("SQL"), skillAsk("Kubernetes", { roleId: newest.id }), skillAsk("Docker", { gap: "r1" })]];
    const got = await questions(runId, "skills");
    expect(got.map((q) => [q.text, q.kind, q.roleId, q.skill])).toEqual([
      ["Do you know SQL?", "skill", null, "SQL"], ["Do you know Docker?", "skill", null, "Docker"],
    ]);
    const system = JSON.stringify(model.requests[0]);
    expect(system).toContain("Do you know");
    expect(system).toContain("skill");
  });

  it("adds a note to every role a confirmed skill was used in", async () => {
    const runId = await startRun();
    replies = [[skillAsk("SQL")]];
    const [sql] = await questions(runId, "skills");
    const res = await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: sql!.id, value: "Yes", via: "option", roleIds: [newest.id, older.id] }] });
    expect(res.status).toBe(200);
    const notes = await jobNotes();
    expect(notes).toHaveLength(2);
    expect(notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: newest.id, question: "Do you know SQL?", answer: "Used SQL (Yes)", jobId }),
      expect.objectContaining({ roleId: older.id, question: "Do you know SQL?", answer: "Used SQL (Yes)", jobId }),
    ]));
  });

  it("ignores role ids that aren't the person's roles", async () => {
    const runId = await startRun();
    replies = [[skillAsk("SQL")]];
    const [sql] = await questions(runId, "skills");
    await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: sql!.id, value: "A little", via: "option", roleIds: ["ghost", older.id] }] });
    expect(await jobNotes()).toEqual([expect.objectContaining({ roleId: older.id, answer: "Used SQL (A little)" })]);
  });
});

describe("questions for every role at once", () => {
  const tool = (skill: string, over: Partial<ModelQuestion> = {}) =>
    ask(`Did you use ${skill}?`, { roleId: null, skill, options: [], ...over });
  const across = async (runId: string) => {
    const res = await call(`/v1/tailor-runs/${runId}/across-questions`);
    expect(res.status).toBe(200);
    return (await res.json() as { questions: Question[] }).questions;
  };
  const answer = (runId: string, body: unknown) => call(`/v1/tailor-runs/${runId}/answers`, { answers: [body] });

  it("asks a missing tool once for all roles, then never again", async () => {
    const runId = await startRun();
    replies = [[tool("Kubernetes"), tool("Docker", { gap: "nope" })]];
    const got = await across(runId);
    expect(got.map((q) => [q.text, q.kind, q.scope, q.roleId, q.section, q.skill, q.gap])).toEqual([
      ["Did you use Kubernetes?", "skill", "all", null, "experience", "Kubernetes", "r0"],
    ]);
    const sent = JSON.parse((model.requests[0]!.messages as { content: string }[])[1]!.content) as { roles: { id: string }[] };
    expect(sent.roles.map((r) => r.id)).toEqual([newest.id, older.id]);
    expect(await across(runId)).toEqual([]);
    expect(model.requests).toHaveLength(1);
  });

  it("asks nothing across a CV with one role, without calling the model", async () => {
    await cv.save({ ...base, experience: [newest] }, 1);
    const runId = await startRun();
    expect(await across(runId)).toEqual([]);
    expect(model.requests).toHaveLength(0);
  });

  it("puts a used tool on each role ticked, and a similar one as itself, never as the tool asked about", async () => {
    const runId = await startRun();
    replies = [[tool("Kubernetes"), tool("Team lead", { gap: "r1" })]];
    const [k8s, lead] = await across(runId);
    await call(`/v1/tailor-runs/${runId}/answers`, { answers: [
      { questionId: k8s!.id, value: "Nomad", via: "typed", use: "similar", roleIds: [older.id] },
      { questionId: lead!.id, value: "Yes", via: "option", use: "used", roleIds: [newest.id, older.id] },
    ] });
    const notes = await jobNotes();
    expect(notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: older.id, answer: "Used Nomad for the kind of work a tool the job names does (not that tool itself)" }),
      expect.objectContaining({ roleId: newest.id, answer: "Yes" }),
      expect.objectContaining({ roleId: older.id, answer: "Yes" }),
    ]));
    expect(notes).toHaveLength(3);
  });

  it("an all-roles question closes its gap in every role and in Skills, whatever the answer", async () => {
    const runId = await startRun();
    replies = [[tool("Kubernetes"), tool("Team lead", { gap: "r1" })]];
    const [k8s, lead] = await across(runId);
    await answer(runId, { questionId: k8s!.id, value: "No", via: "option", use: "none" });
    await answer(runId, { questionId: lead!.id, value: "Yes", via: "option", use: "used", roleIds: [newest.id] });
    const calls = model.requests.length;
    replies = [[ask("Did you lead the team on releases?", { gap: "r1" }), ask("Kubernetes here?", { gap: "r0" })]];
    expect(await questions(runId, "experience", newest.id)).toEqual([]);
    replies = [[ask("Do you know Kubernetes?", { roleId: null, gap: "r0" })]];
    expect(await questions(runId, "skills")).toEqual([]);
    // Nothing left to ask: no model call.
    expect(model.requests).toHaveLength(calls);
  });

  it("'something similar' is one tap: it saves no note, and no role asks the gap again", async () => {
    const runId = await startRun();
    replies = [[tool("Kubernetes")]];
    const [k8s] = await across(runId);
    await answer(runId, { questionId: k8s!.id, value: "No", via: "option", use: "similar" });
    expect(await jobNotes()).toEqual([]);
    // The role step still asks about the job's other gap, but Kubernetes is no longer among the gaps it is sent.
    replies = [[ask("Kubernetes here?", { gap: "r0" })]];
    expect(await questions(runId, "experience", newest.id)).toEqual([]);
    expect(JSON.stringify(JSON.parse(String((model.requests.at(-1)!.messages as { content: string }[])[1]!.content)).gaps)).not.toContain("Kubernetes");
  });

});

describe("gap questions: every gap asked once, with the roles it may fit", () => {
  type Row = { text: string; skill: string; reason: string; gap: string; roleIds: string[]; hint: string | null };
  const row = (skill: string, over: Partial<Row> = {}): Row =>
    ({ text: `Did you use ${skill}?`, skill, reason: "Gap", gap: "r0", roleIds: [], hint: null, ...over });
  const gaps = async (runId: string) => {
    const res = await call(`/v1/tailor-runs/${runId}/gap-questions`);
    expect(res.status).toBe(200);
    return (await res.json() as { questions: Question[] }).questions;
  };
  const reply = (...rows: Row[]) => { replies = [rows as unknown as ModelQuestion[]]; };

  it("asks every open gap once, with the roles whose own lines hint at it", async () => {
    const runId = await startRun();
    reply(row("Kubernetes"), row("Team lead", { gap: "r1", roleIds: [newest.id, "no-such-role"], hint: "Led 3 people" }), row("Docker", { gap: "nope" }));
    const asked = await gaps(runId);
    expect(asked).toEqual([
      expect.objectContaining({ text: "Did you use Kubernetes?", skill: "Kubernetes", gap: "r0", scope: "all", kind: "skill", roleId: null }),
      expect.objectContaining({ skill: "Team lead", gap: "r1", scope: "all", suggestedRoleIds: [newest.id], hint: "Led 3 people" }),
    ]);
    expect(asked[0]).not.toHaveProperty("suggestedRoleIds");
    expect(asked[0]).not.toHaveProperty("hint");
    const sent = JSON.parse((model.requests[0]!.messages as { content: string }[])[1]!.content);
    expect(sent.gaps.map((gap: { ref: string }) => gap.ref)).toEqual(["r0", "r1"]);
    expect(sent.roles).toEqual([
      expect.objectContaining({ id: newest.id, lines: expect.arrayContaining(["Led 3 people"]) }),
      expect.objectContaining({ id: older.id, lines: expect.arrayContaining(["Ran payroll"]) }),
    ]);

    // Asked once per run: the same questions come back, with no second model call.
    expect(await gaps(runId)).toEqual(asked);
    expect(model.requests).toHaveLength(1);
    // The older all-roles route has nothing more to ask.
    expect(await (await call(`/v1/tailor-runs/${runId}/across-questions`)).json()).toEqual({ questions: [] });
    expect(model.requests).toHaveLength(1);
  });

  it("drops a hint that is not in the suggested role's own words, with its suggestion", async () => {
    const runId = await startRun();
    reply(row("Team lead", { gap: "r1", roleIds: [older.id], hint: "Led 3 people" }), row("Kubernetes", { roleIds: [newest.id], hint: "Managed a squad" }));
    const asked = await gaps(runId);
    expect(asked.map((q) => q.skill)).toEqual(["Team lead", "Kubernetes"]);
    for (const question of asked) {
      expect(question).not.toHaveProperty("suggestedRoleIds");
      expect(question).not.toHaveProperty("hint");
    }
  });

  it("asks a CV with one role too, and nothing when the CV shows everything", async () => {
    await cv.save({ ...base, experience: [newest] }, 1);
    const runId = await startRun();
    reply(row("Kubernetes"));
    expect((await gaps(runId)).map((q) => q.skill)).toEqual(["Kubernetes"]);

    await memoryTailorRepo("user-a", scores).saveScore(jobId, "base", null,
      { ...score, labels: score.labels.map((label) => ({ ...label, status: "met" as const, inferred: false, evidence: "Led 3 people" })) });
    const other = await startRun();
    await memoryTailorRepo("user-a", scores, docs).updateRun(other, { questions: [] });
    const calls = model.requests.length;
    expect(await gaps(other)).toEqual([]);
    expect(model.requests).toHaveLength(calls);
  });

  it("notes each ticked role, and takes 12 answers in one request", async () => {
    const runId = await startRun();
    reply(row("Kubernetes"), row("Team lead", { gap: "r1" }));
    const [k8s, lead] = await gaps(runId);
    const res = await call(`/v1/tailor-runs/${runId}/answers`, { answers: [
      { questionId: k8s!.id, value: "No", via: "option", use: "similar" },
      { questionId: lead!.id, value: "Yes", via: "option", use: "used", roleIds: [newest.id] },
    ] });
    expect(res.status).toBe(200);
    expect(await jobNotes()).toEqual([expect.objectContaining({ roleId: newest.id, answer: "Yes" })]);

    // The same yes with another role ticked: the new role gets its note, the role noted before gets no second one.
    const again = await call(`/v1/tailor-runs/${runId}/answers`, { answers: [
      { questionId: lead!.id, value: "Yes", via: "option", use: "used", roleIds: [newest.id, older.id] },
    ] });
    expect(again.status).toBe(200);
    expect((await jobNotes()).map((note) => note.roleId).sort()).toEqual([newest.id, older.id].sort());
    // Sent once more as it stands: nothing new.
    await call(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: lead!.id, value: "Yes", via: "option", use: "used", roleIds: [newest.id, older.id] }] });
    expect(await jobNotes()).toHaveLength(2);

    const many: Question[] = Array.from({ length: 12 }, (_, i) => ({ id: `g${i}`, section: "experience", roleId: null, text: `Did you use tool ${i}?`,
      kind: "skill", options: [], reason: "Gap", gap: `k:tool ${i}`, scope: "all", skill: `Tool ${i}` }));
    await memoryTailorRepo("user-a", scores, docs).updateRun(runId, { questions: many });
    const all = await call(`/v1/tailor-runs/${runId}/answers`, { answers: many.map((q) => ({ questionId: q.id, value: "No", via: "option", use: "none" })) });
    expect(all.status).toBe(200);
  });
});

describe("the gap questions prompt", () => {
  it("asks only what ticking roles can answer", async () => {
    const { gapSystemPrompt } = await import("../src/tailor/question-prompts.ts");
    expect(gapSystemPrompt).toContain('Start it with "Did you" or "Have you"');
    expect(gapSystemPrompt).toContain('never with "Which", "What" or "How"');
  });
});

describe("gap questions say why they are asked", () => {
  it("each comes back with what the ad needs it for, also when it was stored before; the ad's sentence when the ad has one", async () => {
    const runId = await startRun();
    replies = [[{ text: "Did you use Kubernetes?", skill: "Kubernetes", reason: "Gap", gap: "r0", roleIds: [], hint: null }] as unknown as ModelQuestion[]];
    const ask = async () => ((await (await call(`/v1/tailor-runs/${runId}/gap-questions`)).json()) as { questions: Question[] }).questions;
    // This job's stored text is one letter, so there is no sentence to quote (the quoting itself: ad-line.test.ts).
    const [first] = await ask();
    expect(first).toMatchObject({ need: "must" });
    expect(first).not.toHaveProperty("adLine");
    // Stored without it (a run from before): it is added on the way out.
    const repo = memoryTailorRepo("user-a", scores, docs);
    const run = (await repo.getRun(runId))!;
    expect(run.questions![0]).toMatchObject({ need: "must" });
    await repo.updateRun(runId, { questions: run.questions!.map(({ need: _need, ...rest }) => rest) });
    expect((await ask())[0]).toMatchObject({ need: "must" });
  });
});

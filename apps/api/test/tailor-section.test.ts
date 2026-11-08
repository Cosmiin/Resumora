import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction, type Proposal, type TailorQuestion, type TailorSection } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { roleWith } from "../src/enrich/fake-model.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs } from "../src/tailor/memory-repo.ts";

const job: JobExtraction = {
  title: "Payroll Lead", company: "Beta", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [],
  summary: "We are looking for a payroll lead who will run the team and work with our clients.",
  requirements: [{ text: "Payroll accuracy", kind: "must", category: "skill" }], responsibilities: ["Run payroll"],
};
const role = roleWith(["Ran payroll for 40 staff"]);
const bullet = role.bullets[0]!;
const base: CvContent = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop", email: "ana@example.test" },
  experience: [role], technicalSkills: [{ id: "s1", name: "Excel" }] };

type ModelProposal = Omit<Proposal, "flags">;
let replies: unknown[];
let model: ReturnType<typeof fakeModel>;
let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let cv: CvRepo;
let app: ReturnType<typeof createApp>;
let jobId: string;
let log: ReturnType<typeof vi.fn<(entry: Record<string, unknown>) => void>>;

beforeEach(async () => {
  replies = [];
  model = fakeModel(() => replies.shift() ?? { results: [] });
  jobs = memoryJobs({ now: () => new Date("2026-11-08T10:00:00Z") });
  docs = memoryTailorDocs();
  cv = memoryCvRepo();
  await cv.save(base, 0);
  log = vi.fn<(entry: Record<string, unknown>) => void>();
  const deps: AppDeps = {
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "token-a" ? { id: "user-a", token } : null),
    cvRepo: () => cv,
    importRepo: () => { throw new Error("not used"); },
    jobRepo: (user) => jobs.repoFor(user.id),
    tailorRepo: (user) => memoryTailorRepo(user.id, new Map(), docs),
    insightsRepo: () => { throw new Error("not used"); },
    model: () => model.deps,
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
    log,
  };
  app = createApp(deps);
  jobId = crypto.randomUUID();
  await jobs.repoFor("user-a").create({ id: jobId, source: "link", url: "https://example.test/j", urlNormalized: "j", rawText: "x", jsonLd: null });
  await jobs.admin.finish(jobId, job);
});

const post = (path: string, body: unknown = {}) => app.request(path, {
  method: "POST", headers: { authorization: "Bearer token-a", "content-type": "application/json" }, body: JSON.stringify(body),
});
/** Starts a run, moves it to `current` (as accepting the earlier sections would), then runs `section`. */
async function runSection(section = "experience", current: TailorSection = section as TailorSection) {
  const start = await (await post(`/v1/jobs/${jobId}/tailor`, { tone: "formal", instruction: "Keep it short" })).json() as { run: { id: string } };
  await memoryTailorRepo("user-a", new Map(), docs).updateRun(start.run.id, { currentSection: current });
  const res = await post(`/v1/tailor-runs/${start.run.id}/sections/${section}/run`);
  return { res, runId: start.run.id };
}
const proposals = (...items: ModelProposal[]) => ({ proposals: items });
const reword = (text: string, over: Partial<ModelProposal> = {}): ModelProposal =>
  ({ itemId: bullet.id, field: "text", text, inferred: false, ...over });

describe("section pass", () => {
  it("uses the strong tier, retries a flagged proposal once, then returns the flag as a question", async () => {
    replies = [proposals(reword("Cut payroll errors by 30% for 40 staff")), { results: [] },
      proposals(reword("Cut payroll errors by 30% for 40 staff")), { results: [] }];
    const { res, runId } = await runSection();
    expect(res.status).toBe(200);
    const body = await res.json() as { proposals: Proposal[]; questions: TailorQuestion[] };
    expect(model.logged.map((call) => call.task)).toEqual(["tailor_section", "tailor_verify", "tailor_section", "tailor_verify"]);
    expect(JSON.stringify(model.requests[0])).toContain("Keep it short");
    expect(JSON.stringify(model.requests[0])).not.toContain("Ana Pop");
    expect(JSON.stringify(model.requests[0])).not.toContain("ana@example.test");
    expect(JSON.stringify(model.requests[2])).toContain("30");
    expect(body.proposals).toEqual([expect.objectContaining({ itemId: bullet.id, flags: [expect.objectContaining({ rule: "number" })] })]);
    expect(body.questions).toEqual([expect.objectContaining({ kind: "flag", section: "experience", roleId: role.id })]);
    const run = await memoryTailorRepo("user-a", new Map(), docs).getRun(runId);
    expect(run).toMatchObject({ status: "waiting_user", currentSection: "experience", proposals: body.proposals });
    expect(run?.questions).toEqual(body.questions);
    replies = [{ questions: Array.from({ length: 8 }, (_, i) => ({ roleId: null, text: `Q${i}?`, kind: "options", options: ["Yes"], reason: "Gap", gap: "r0" })) }];
    const asked = await (await post(`/v1/tailor-runs/${runId}/sections/skills/questions`)).json() as { questions: unknown[] };
    expect(asked.questions).toHaveLength(8);
  });

  it("keeps a proposal that passes on retry and drops unknown item ids (Review focus 5)", async () => {
    replies = [proposals(reword("Ran payroll on Kubernetes for 40 staff"), reword("Invented", { itemId: "ghost" })), { results: [] },
      proposals(reword("Ran accurate payroll for 40 staff")), { results: [] }];
    const body = await (await runSection()).res.json() as { proposals: Proposal[]; questions: TailorQuestion[] };
    expect(body.proposals).toEqual([{ itemId: bullet.id, field: "text", text: "Ran accurate payroll for 40 staff", inferred: false, flags: [] }]);
    expect(body.questions).toEqual([]);
  });

  it("keeps the model's order after a retry", async () => {
    const two = roleWith(["Ran payroll for 40 staff", "Filed taxes"]);
    await cv.save({ ...base, experience: [two] }, 1);
    const [first, second] = two.bullets;
    replies = [proposals(reword("Ran payroll on Kubernetes", { itemId: first!.id }), reword("Filed taxes on time", { itemId: second!.id })),
      { results: [] }, proposals(reword("Ran payroll for 40 staff", { itemId: first!.id })), { results: [] }];
    const body = await (await runSection()).res.json() as { proposals: Proposal[] };
    expect(body.proposals.map((p) => p.itemId)).toEqual([first!.id, second!.id]);
  });

  it("replaces a section's old flag questions on a rerun and never uses flag answers as sources", async () => {
    const flagged = proposals(reword("Cut payroll errors by 30% for 40 staff"));
    replies = [flagged, { results: [] }, flagged, { results: [] }];
    const { runId } = await runSection();
    const repo = memoryTailorRepo("user-a", new Map(), docs);
    const [flag] = (await repo.getRun(runId))!.questions!;
    await post(`/v1/tailor-runs/${runId}/answers`, { answers: [{ questionId: flag!.id, value: "Keep it", via: "option" }] });
    replies = [flagged, { results: [] }, flagged, { results: [] }];
    const again = await (await post(`/v1/tailor-runs/${runId}/sections/experience/run`)).json() as { proposals: Proposal[] };
    expect(again.proposals[0]?.flags.map((f) => f.rule)).toEqual(["number"]);
    expect(JSON.stringify(model.requests[4])).toContain(String.raw`\"answers\":[]`);
    const questions = (await repo.getRun(runId))!.questions!;
    expect(questions.filter((q) => q.kind === "flag")).toHaveLength(1);
    expect(questions[0]!.id).not.toBe(flag!.id);
  });

  it("does not retry when nothing is flagged, and an unknown id alone gives no proposals", async () => {
    replies = [proposals(reword("Invented", { itemId: "ghost" })), { results: [] }];
    const body = await (await runSection()).res.json() as { proposals: Proposal[] };
    expect(body.proposals).toEqual([]);
    expect(model.requests).toHaveLength(1);
  });

  it("flags a new outcome claim found by the verifier", async () => {
    replies = [proposals(reword("Ran payroll for 40 staff and won the team award")),
      { results: [{ itemId: bullet.id, claims: ["won the team award"] }] },
      proposals(reword("Ran payroll for 40 staff and won the team award")),
      { results: [{ itemId: bullet.id, claims: ["won the team award"] }] }];
    const body = await (await runSection()).res.json() as { proposals: Proposal[] };
    expect(body.proposals[0]?.flags).toEqual([{ rule: "achievement", detail: "won the team award" }]);
  });

  it("accepts a tagged inferred new skill and rejects the layout section here", async () => {
    replies = [proposals({ itemId: "new-skill", field: "name", text: "Kubernetes", inferred: true },
      { itemId: "s1", field: "name", text: "Microsoft Excel", inferred: false })];
    const body = await (await runSection("skills")).res.json() as { proposals: Proposal[] };
    expect(body.proposals.map((p) => [p.itemId, p.text, p.flags])).toEqual([["new-skill", "Kubernetes", []], ["s1", "Microsoft Excel", []]]);
    expect(JSON.stringify(model.requests[0])).toContain("Ran payroll for 40 staff");
    // The layout step has its own pass (Task 15) and runs only once it is the current section.
    expect((await runSection("layout", "experience")).res.status).toBe(409);
  });

  it("refuses a section that isn't the current step, and a finished run, without calling the model", async () => {
    expect((await runSection("summary", "experience")).res.status).toBe(409);
    const { runId } = await runSection("experience", "skills");
    const repo = memoryTailorRepo("user-a", new Map(), docs);
    expect((await repo.getRun(runId))!.currentSection).toBe("skills");
    await repo.updateRun(runId, { status: "done", currentSection: null });
    expect((await post(`/v1/tailor-runs/${runId}/sections/experience/run`)).status).toBe(409);
    expect((await repo.getRun(runId))!.status).toBe("done");
    expect(model.requests).toHaveLength(0);
  });

  it("gives the summary the roles as context", async () => {
    replies = [proposals({ itemId: "summary", field: "summary", text: "Payroll specialist for 40 staff", inferred: false })];
    const body = await (await runSection("summary")).res.json() as { proposals: Proposal[] };
    expect(body.proposals[0]?.flags).toEqual([]);
    expect(JSON.stringify(model.requests[0])).toContain("Ran payroll for 40 staff");
  });

  it("never treats digits inside item ids as known numbers", async () => {
    const id = "00000000-0000-4000-8000-000000000030";
    await cv.save({ ...base, experience: [{ ...role, bullets: [{ id, text: "Ran payroll for 40 staff" }]}] }, 1);
    replies = [proposals(reword("Cut payroll errors by 30% for 40 staff", { itemId: id })), { results: [] },
      proposals(reword("Cut payroll errors by 30% for 40 staff", { itemId: id })), { results: [] }];
    const body = await (await runSection()).res.json() as { proposals: Proposal[] };
    expect(body.proposals[0]?.flags.map((f) => f.rule)).toEqual(["number"]);
  });

  it("keeps a summary rewrite the model returned under field \"text\" (the item has one editable field)", async () => {
    replies = [proposals({ itemId: "summary", field: "text", text: "Payroll specialist for 40 staff", inferred: false }), { results: [] }];
    const body = await (await runSection("summary")).res.json() as { proposals: Proposal[] };
    expect(body.proposals).toEqual([{ itemId: "summary", field: "summary", text: "Payroll specialist for 40 staff", inferred: false, flags: [] }]);
    expect(model.logged.map((call) => call.task)).toEqual(["tailor_section", "tailor_verify"]);
    expect(log).not.toHaveBeenCalled();
  });

  it("maps a bullet's other field name to its text, drops a role-level bullets blob, and logs the drop without CV text", async () => {
    replies = [proposals(
      reword("Ran accurate payroll for 40 staff", { field: "bullet" }),
      { itemId: role.id, field: "bullets", text: "Ran payroll for 40 staff; filed taxes", inferred: false },
    ), { results: [] }];
    const body = await (await runSection()).res.json() as { proposals: Proposal[] };
    expect(body.proposals).toEqual([{ itemId: bullet.id, field: "text", text: "Ran accurate payroll for 40 staff", inferred: false, flags: [] }]);
    expect(log).toHaveBeenCalledWith({ msg: "tailor proposals dropped", section: "experience", count: 1, dropped: [{ itemId: role.id, field: "bullets" }] });
    expect(JSON.stringify(log.mock.calls)).not.toContain("filed taxes");
  });

  it("tells the model the exact item ids and fields it may edit", async () => {
    replies = [proposals()];
    await runSection();
    const system = JSON.stringify(model.requests[0]);
    expect(system).toContain("itemId = the bullet's id, field \\\"text\\\"");
    expect(system).toContain("field \\\"description\\\"");
  });

  it("names the flagged item in its question and shows only details that add something", async () => {
    const claim = "Ran payroll for 40 staff and won the team award";
    replies = [proposals(reword("Cut payroll errors by 30% for 40 staff")), { results: [] },
      proposals(reword("Cut payroll errors by 30% for 40 staff")), { results: [] }];
    let body = await (await runSection()).res.json() as { questions: TailorQuestion[] };
    expect(body.questions[0]).toMatchObject({ itemId: bullet.id,
      text: `Please check the bullet in Payroll Specialist at Acme Payroll: "Cut payroll errors by 30% for 40 staff". A number that isn't in your CV, notes or answers.` });
    replies = [proposals(reword(claim)), { results: [{ itemId: bullet.id, claims: [claim] }] },
      proposals(reword(claim)), { results: [{ itemId: bullet.id, claims: [claim, "won the team award"] }] }];
    body = await (await runSection()).res.json() as { questions: TailorQuestion[] };
    expect(body.questions[0]!.text).toBe(`Please check the bullet in Payroll Specialist at Acme Payroll: "${claim}". Not supported by your CV: "won the team award".`);
  });

  it("names a language level and a skill in flag questions", async () => {
    await cv.save({ ...base, languages: [{ id: "l1", name: "English", level: "B2" }] }, 1);
    replies = [proposals({ itemId: "l1", field: "level", text: "C2 (2024)", inferred: false }), { results: [] },
      proposals({ itemId: "l1", field: "level", text: "C2 (2024)", inferred: false }), { results: [] }];
    const body = await (await runSection("languages")).res.json() as { questions: TailorQuestion[] };
    expect(body.questions[0]!.text.startsWith('Please check the English level: "C2 (2024)".')).toBe(true);
  });
});

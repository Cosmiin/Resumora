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
  const res = await post(`/v1/tailor-runs/${start.run.id}/sections/${section}/run`, await roleOf(start.run.id));
  return { res, runId: start.run.id };
}
/** The run's current role, which the web sends with every Experience step. */
const roleOf = async (runId: string) => ({ roleId: (await memoryTailorRepo("user-a", new Map(), docs).getRun(runId))!.currentRoleId });
// The real (strict) model always returns every field: reason is null when unused.
const proposals = (...items: ModelProposal[]) => ({ proposals: items.map((item) => ({ reason: null, guesses: null, ...item })) });
const reword = (text: string, over: Partial<ModelProposal> = {}): ModelProposal =>
  ({ itemId: bullet.id, field: "text", text, inferred: false, ...over });

describe("section pass", () => {
  it.each(["experience", "summary"] as const)("scopes %s evidence and answers to the permitted roles", async (section) => {
    const roleA = roleWith(["Built reports on Kubernetes"], { company: "Northwind Traders", title: "Reporting Lead" });
    const roleB = roleWith(["Ran payroll"], { company: "Contoso Labs", description: "Handled monthly payroll",
      notes: [{ id: "note-b", question: "What else?", answer: "Checked tax codes", via: ["type"], askedAt: "2026-11-10T10:00:00Z" }],
      facts: { items: ["Filed returns"], fromNotes: "note-b", updatedAt: "2026-11-10T10:00:00Z" },
    });
    const project = { ...roleWith(["Built a scheduling app"], { company: "Fabrikam", title: "Scheduler" }), url: "" };
    const volunteer = roleWith(["Taught budgeting"], { company: "Woodgrove", title: "Mentor" });
    await cv.save({ ...base, experience: [roleA, roleB], projects: [project], volunteering: [volunteer] }, 1);
    const start = await (await post(`/v1/jobs/${jobId}/tailor`, { tone: "formal", focusRoleIds: [roleA.id] })).json() as { run: { id: string } };
    const questions: TailorQuestion[] = [
      { id: "q-a", roleId: roleA.id, text: "What reports?", section: "experience", kind: "options", options: [], reason: "Gap" },
      { id: "q-b", roleId: roleB.id, text: "What checks?", section: "experience", kind: "options", options: [], reason: "Gap" },
      { id: "q-all", roleId: null, text: "Which skills?", section: "skills", kind: "skill", options: [], reason: "Gap" },
      { id: "q-flag", roleId: roleB.id, text: "Unsupported claim?", section: "experience", kind: "flag", options: [], reason: "Flag" },
    ];
    await memoryTailorRepo("user-a", new Map(), docs).updateRun(start.run.id, {
      currentSection: section, currentRoleId: section === "experience" ? roleB.id : null, questions,
      answers: questions.map((q, i) => ({ questionId: q.id, value: ["Client reports", "Reconciled totals", "Excel formulas", "Invented outcome"][i]!, via: "typed" })),
    });
    const proposal = reword("Ran payroll on Kubernetes", { itemId: section === "experience" ? roleB.bullets[0]!.id : "summary", field: section === "experience" ? "text" : "summary" });
    replies = [proposals(proposal), { results: [] }, proposals(proposal), { results: [] }];
    const res = await post(`/v1/tailor-runs/${start.run.id}/sections/${section}/run`, { roleId: roleB.id });
    expect(res.status).toBe(200);
    const sent = JSON.parse(String((model.requests[0]!.messages as { content: string }[])[1]!.content));
    const verified = JSON.parse(String((model.requests[1]!.messages as { content: string }[])[1]!.content));
    const ownAnswer = { question: "What checks?", answer: "Reconciled totals" };
    expect(verified.sources).toEqual(expect.arrayContaining(["Contoso Labs", "Ran payroll", "Handled monthly payroll", "Checked tax codes", "Filed returns", ownAnswer.answer]));
    expect(JSON.stringify(sent)).not.toContain("Invented outcome");
    expect(verified.sources).not.toContain("Invented outcome");
    if (section === "experience") {
      expect(sent.items).toEqual({ edit: [expect.objectContaining({ id: roleB.id })] });
      expect(sent.answers).toEqual([ownAnswer]);
      for (const other of [roleA.company, roleA.title, roleA.bullets[0]!.text, project.company, volunteer.company, "Client reports", "Excel formulas"]) {
        expect(JSON.stringify(sent)).not.toContain(other);
        expect(verified.sources).not.toContain(other);
      }
      expect(sent.steering).toContain("They want to lean on other roles more than this one.");
      const retry = JSON.parse(String((model.requests[2]!.messages as { content: string }[])[1]!.content));
      expect(retry.fix.proposals[0].flags).toContainEqual({ rule: "tool", detail: "Kubernetes" });
      expect(await res.json()).toMatchObject({ proposals: [], removed: 1 });
      expect(model.logged.map((call) => call.task)).toEqual(["tailor_section", "tailor_verify", "tailor_section", "tailor_verify"]);
    } else {
      expect(sent.items.context.roles.map((item: { id: string }) => item.id)).toEqual([roleA.id, roleB.id]);
      expect(sent.answers).toEqual([{ question: "What reports?", answer: "Client reports" }, ownAnswer, { question: "Which skills?", answer: "Excel formulas" }]);
      expect(verified.sources).toContain(roleA.bullets[0]!.text);
      expect(await res.json()).toMatchObject({ proposals: [expect.objectContaining({ text: proposal.text, flags: [] })], removed: 0 });
    }
  });

  it("uses the strong tier, retries a flagged proposal once, then drops it: no flag question, counted in removed", async () => {
    replies = [proposals(reword("Cut payroll errors by 30% for 40 staff")), { results: [] },
      proposals(reword("Cut payroll errors by 30% for 40 staff")), { results: [] }];
    const { res, runId } = await runSection();
    expect(res.status).toBe(200);
    const body = await res.json() as { proposals: Proposal[]; questions: TailorQuestion[]; removed: number };
    expect(model.logged.map((call) => call.task)).toEqual(["tailor_section", "tailor_verify", "tailor_section", "tailor_verify"]);
    expect(JSON.stringify(model.requests[0])).toContain("Keep it short");
    expect(JSON.stringify(model.requests[0])).not.toContain("Ana Pop");
    expect(JSON.stringify(model.requests[0])).not.toContain("ana@example.test");
    expect(JSON.stringify(model.requests[2])).toContain("30");
    expect(body).toEqual({ proposals: [], questions: [], removed: 1 });
    const run = await memoryTailorRepo("user-a", new Map(), docs).getRun(runId);
    expect(run).toMatchObject({ status: "waiting_user", currentSection: "experience", proposals: [] });
    expect(run?.questions ?? []).toEqual([]);
    replies = [{ questions: Array.from({ length: 8 }, (_, i) => ({ roleId: null, bulletId: null, skill: null, text: `Q${i}?`, kind: "options", options: ["Yes"], reason: "Gap", gap: "r0" })) }];
    const asked = await (await post(`/v1/tailor-runs/${runId}/sections/skills/questions`)).json() as { questions: unknown[] };
    expect(asked.questions).toHaveLength(5);
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

  it("does not retry when nothing is flagged, and an unknown id alone gives no proposals", async () => {
    replies = [proposals(reword("Invented", { itemId: "ghost" })), { results: [] }];
    const body = await (await runSection()).res.json() as { proposals: Proposal[] };
    expect(body.proposals).toEqual([]);
    expect(model.requests).toHaveLength(1);
  });

  it("drops a new outcome claim found by the verifier", async () => {
    replies = [proposals(reword("Ran payroll for 40 staff and won the team award")),
      { results: [{ itemId: bullet.id, claims: ["won the team award"] }] },
      proposals(reword("Ran payroll for 40 staff and won the team award")),
      { results: [{ itemId: bullet.id, claims: ["won the team award"] }] }];
    const body = await (await runSection()).res.json() as { proposals: Proposal[]; removed: number };
    expect(body).toMatchObject({ proposals: [], removed: 1 });
  });

  it("keeps a backed inferred new skill and rejects the layout section here", async () => {
    replies = [proposals({ itemId: "new-skill", field: "name", text: "Payroll", inferred: true, reason: "Shown in: Payroll Specialist · Acme Payroll" } as ModelProposal,
      { itemId: "s1", field: "name", text: "Microsoft Excel", inferred: false, reason: null, guesses: null } as unknown as ModelProposal)];
    const body = await (await runSection("skills")).res.json() as { proposals: Proposal[] };
    expect(body.proposals.map((p) => [p.itemId, p.text, p.flags])).toEqual([["new-skill", "Payroll", []], ["s1", "Microsoft Excel", []]]);
    expect(JSON.stringify(model.requests[0])).toContain("Ran payroll for 40 staff");
    // The layout step has its own pass (Task 15) and runs only once it is the current section.
    expect((await runSection("layout", "experience")).res.status).toBe(409);
  });

  it("keeps a short reason on suggested new skills only, and asks for short skill names", async () => {
    replies = [proposals({ itemId: "new-skill", field: "name", text: "Payroll", inferred: true, reason: "Shown in: Payroll Officer · Acme" } as ModelProposal,
      { itemId: "s1", field: "name", text: "Microsoft Excel", inferred: false, reason: "Reworded to the job's words" } as ModelProposal)];
    const body = await (await runSection("skills")).res.json() as { proposals: Proposal[] };
    expect(body.proposals[0]).toMatchObject({ itemId: "new-skill", reason: "Shown in: Payroll Officer · Acme" });
    expect(body.proposals[1]).not.toHaveProperty("reason");
    const system = JSON.stringify(model.requests[0]);
    expect(system).toContain("at most 3 words");
    expect(system).toContain("reason");
    expect(system).not.toContain("\"default\"");
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

  it("keeps the summary's guesses that are exact spans of its text, each with its reason; the guesses carry the inference", async () => {
    const text = "Payroll lead who works across borders and runs payroll for 40 staff.";
    replies = [proposals({ itemId: "summary", field: "summary", text, inferred: true, guesses: [
      { text: "works across borders", reason: "From your roles in Hamburg and Bucharest." },
      { text: "speaks German", reason: "Not in the text." },
      { text: "across borders and", reason: "Overlaps the first guess." },
    ] }), { results: [] }];
    const body = await (await runSection("summary")).res.json() as { proposals: Proposal[] };
    expect(body.proposals).toEqual([{ itemId: "summary", field: "summary", text, inferred: false, flags: [],
      guesses: [{ text: "works across borders", reason: "From your roles in Hamburg and Bucharest." }] }]);
    expect(String((model.requests[0]!.messages as Array<{ content: string }>)[0]!.content)).toContain("guesses");
  });

  it("never treats digits inside item ids as known numbers", async () => {
    const id = "00000000-0000-4000-8000-000000000030";
    await cv.save({ ...base, experience: [{ ...role, bullets: [{ id, text: "Ran payroll for 40 staff" }]}] }, 1);
    replies = [proposals(reword("Cut payroll errors by 30% for 40 staff", { itemId: id })), { results: [] },
      proposals(reword("Cut payroll errors by 30% for 40 staff", { itemId: id })), { results: [] }];
    const body = await (await runSection()).res.json() as { proposals: Proposal[]; removed: number };
    expect(body).toMatchObject({ proposals: [], removed: 1 });
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

  it("drops a proposal adding a tool no source mentions, whether or not it is marked inferred", async () => {
    for (const inferred of [false, true]) {
      const powerBi = reword("Ran payroll reporting for 40 staff in Power BI", { inferred, reason: inferred ? "Ran payroll for 40 staff" : null } as Partial<ModelProposal>);
      replies = [proposals(powerBi), { results: [] }, proposals(powerBi), { results: [] }];
      const body = await (await runSection()).res.json() as { proposals: Proposal[]; removed: number };
      expect(body).toMatchObject({ proposals: [], removed: 1 });
    }
  });

  it("drops a guess without a reason and keeps a guess whose reason names its basis", async () => {
    const bare = reword("Led payroll for 40 staff", { inferred: true });
    replies = [proposals(bare), { results: [] }, proposals(bare), { results: [] }];
    expect(await (await runSection()).res.json()).toMatchObject({ proposals: [], removed: 1 });
    const based = reword("Led payroll for 40 staff", { inferred: true, reason: "Ran payroll for 40 staff" });
    replies = [proposals(based), { results: [] }];
    const body = await (await runSection()).res.json() as { proposals: Proposal[]; removed: number };
    expect(body.removed).toBe(0);
    expect(body.proposals).toEqual([expect.objectContaining({ text: "Led payroll for 40 staff", inferred: true, reason: "Ran payroll for 40 staff", flags: [] })]);
  });

  it("states the truth rule in the section prompt", async () => {
    replies = [proposals()];
    await runSection();
    const system = JSON.stringify(model.requests[0]);
    expect(system).toContain("Never invent numbers, tools, employers, titles, dates or outcomes");
    expect(system).toContain("never guess");
    expect(system).toContain("reason");
  });

  it("counts a flagged proposal the retry leaves out as removed", async () => {
    replies = [proposals(reword("Cut payroll errors by 30% for 40 staff")), { results: [] }, proposals(), { results: [] }];
    expect(await (await runSection()).res.json()).toMatchObject({ proposals: [], removed: 1 });
  });

  it("counts a dropped claim when a clean proposal shares its item (two new skills)", async () => {
    const clean = { itemId: "new-skill", field: "name", text: "Payroll", inferred: true, reason: "Shown in: Payroll Specialist" };
    const guessed = { itemId: "new-skill", field: "name", text: "Power BI", inferred: true, reason: "Reports" };
    replies = [proposals(clean, guessed), { results: [] }, proposals(clean, guessed), { results: [] }];
    const body = await (await runSection("skills")).res.json() as { proposals: { text: string }[]; removed: number };
    expect(body.proposals.map((p) => p.text)).toEqual(["Payroll"]);
    expect(body.removed).toBe(1);
  });
});

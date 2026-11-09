import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CoverLetter, type CvContent, type JobExtraction } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs } from "../src/tailor/memory-repo.ts";

const USERS: Record<string, string> = { "token-a": "user-a", "token-b": "user-b" };
const job: JobExtraction = {
  title: "Payroll Engineer", company: "Globex", location: "Cluj", workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [], requirements: [],
  summary: "We are looking for an engineer who will build payroll tools.",
  responsibilities: ["Build the payroll reports for our clients"],
};
const role = {
  id: "r1", company: "Acme", title: "Engineer", location: "Cluj", startDate: "2020-01", endDate: "", current: true,
  description: "Built payroll reports", bullets: [{ id: "b1", text: "Paid 40 staff on time every month" }], notes: [],
} as CvContent["experience"][number];
const base: CvContent = {
  ...emptyCv("en"),
  basics: { ...emptyCv("en").basics, fullName: "Ana Pop", email: "ana@example.test", phone: "+40 700 000 000", titles: ["Engineer"], summary: "Payroll engineer." },
  experience: [role], technicalSkills: [{ id: "s1", name: "Excel" }],
};

/** About 280 words, every fact taken from the CV above. */
const SAMPLE = [
  "I am writing to apply for the payroll engineer role at Globex. For the past years at Acme I have built payroll reports that people rely on every month, and I would like to bring that same care to your clients.",
  "At Acme I paid 40 staff on time every month. That work taught me how much trust depends on getting the small details right: the right figures, the right dates and a clear report that anyone on the team can read without help. I built those reports myself and kept them working as the company grew, and I learned to explain them to people who do not work with numbers every day.",
  "I also work every day in Excel, building the reports and checking each figure before it goes out. I enjoy turning a messy process into one that runs the same way every time, so that nobody has to worry about it at the end of the month. When something breaks, I find the cause and fix it for good rather than patching it again and again.",
  "Globex builds payroll tools for its clients, and that is exactly the kind of work I want to do next. I like products where accuracy matters and where the people using them notice when it is done well. I would be glad to talk about how my experience with payroll reports could help your team. Thank you for your time and for reading my application. I look forward to hearing from you soon.",
].join("\n\n");

type Reply = { body: string } | { results: { itemId: string; claims: string[] }[] };
let letters: string[];
let model: ReturnType<typeof fakeModel>;
let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let cvs: Record<string, CvRepo>;
let app: ReturnType<typeof createApp>;

/** The fake writer replies with the next queued letter (the sample when the queue is empty); the verifier finds no claims. */
beforeEach(async () => {
  letters = [];
  model = fakeModel((): Reply => {
    const system = (model.requests.at(-1)!.messages as { content: string }[])[0]!.content;
    if (system.startsWith("You check")) return { results: [] };
    return { body: letters.shift() ?? SAMPLE };
  });
  jobs = memoryJobs({ now: () => new Date("2026-11-08T10:00:00Z") });
  docs = memoryTailorDocs();
  cvs = { "user-a": memoryCvRepo(), "user-b": memoryCvRepo() };
  await cvs["user-a"]!.save(base, 0);
  const deps: AppDeps = {
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (USERS[token] ? { id: USERS[token], token } : null),
    cvRepo: (user) => cvs[user.id]!,
    importRepo: () => { throw new Error("not used"); },
    jobRepo: (user) => jobs.repoFor(user.id),
    tailorRepo: (user) => memoryTailorRepo(user.id, new Map(), docs),
    insightsRepo: () => { throw new Error("not used"); },
    model: () => model.deps,
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
    log: vi.fn(),
  };
  app = createApp(deps);
});

const auth = (token = "token-a") => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
async function tailored(extraction: JobExtraction = job) {
  const jobId = crypto.randomUUID();
  await jobs.repoFor("user-a").create({ id: jobId, source: "link", url: `https://example.test/${jobId}`, urlNormalized: jobId, rawText: "x", jsonLd: null });
  await jobs.admin.finish(jobId, extraction);
  const res = await app.request(`/v1/jobs/${jobId}/tailor`, { method: "POST", headers: auth(), body: JSON.stringify({ tone: "neutral" }) });
  const { tailoredCvId } = await res.json() as { tailoredCvId: string };
  return { jobId, id: tailoredCvId };
}
const write = (id: string, body: object = {}, token = "token-a") =>
  app.request(`/v1/tailored/${id}/cover-letter`, { method: "POST", headers: auth(token), body: JSON.stringify(body) });
const save = (id: string, body: object, token = "token-a") =>
  app.request(`/v1/tailored/${id}/cover-letter`, { method: "PUT", headers: auth(token), body: JSON.stringify(body) });
const writerRequests = () => model.requests.filter((r) => !(r.messages as { content: string }[])[0]!.content.startsWith("You check"));
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("POST /v1/tailored/:id/cover-letter", () => {
  it("writes the body with the strong model and saves it on the tailored CV", async () => {
    const { id } = await tailored();
    const res = await write(id, { whyCompany: "I like their payroll tools", hiringManager: "Maria Ionescu" });
    expect(res.status).toBe(200);
    const { coverLetter, flags } = await res.json() as { coverLetter: CoverLetter; flags: unknown[] };
    expect(flags).toEqual([]);
    expect(words(coverLetter.body)).toBeGreaterThanOrEqual(200);
    expect(words(coverLetter.body)).toBeLessThanOrEqual(400);
    expect(coverLetter).toMatchObject({ whyCompany: "I like their payroll tools", hiringManager: "Maria Ionescu" });
    expect(Number.isNaN(Date.parse(coverLetter.generatedAt))).toBe(false);
    expect(docs.cvs.get(id)!.coverLetter).toEqual(coverLetter);
    expect(model.logged.map((entry) => entry.task)).toContain("tailor_letter");
    expect(JSON.stringify(writerRequests().at(-1))).toContain("I like their payroll tools");
  });

  it("never sends the header (name, contact) or the hiring manager to the model", async () => {
    const { id } = await tailored();
    await write(id, { hiringManager: "Maria Ionescu" });
    const sent = JSON.stringify(model.requests);
    for (const secret of ["Ana Pop", "ana@example.test", "+40 700 000 000", "Maria Ionescu"]) expect(sent).not.toContain(secret);
  });

  it("sends the user's thoughts on the role", async () => {
    const { jobId, id } = await tailored();
    const current = (await jobs.repoFor("user-a").get(jobId))!;
    expect(await jobs.repoFor("user-a").patch(jobId, current.version, job, { userThoughts: "Love the remote setup" })).toBe("ok");
    await write(id);
    expect(JSON.stringify(writerRequests().at(-1))).toContain("Love the remote setup");
  });

  it("retries a letter with an invented number once and returns the flags that remain", async () => {
    const { id } = await tailored();
    const invented = SAMPLE.replace("40 staff", "400 staff");
    letters = [invented, invented];
    const res = await write(id);
    expect(res.status).toBe(200);
    const { coverLetter, flags } = await res.json() as { coverLetter: CoverLetter; flags: { rule: string }[] };
    expect(writerRequests()).toHaveLength(2);
    expect(JSON.stringify(writerRequests()[1])).toContain("number");
    expect(flags.map((flag) => flag.rule)).toContain("number");
    expect(coverLetter.body).toBe(invented);
  });

  it("doesn't flag facts the job ad states, and checks claims about the candidate against the CV only", async () => {
    const { id } = await tailored({ ...job, responsibilities: [...job.responsibilities, "Support our clients in Bulgaria and Hungary"],
      requirements: [{ text: "3 years of SAP payroll", kind: "must", category: "skill" }] });
    letters = [SAMPLE + "\n\nYour role covers clients in Bulgaria and Hungary and asks for 3 years of SAP payroll, which I would like to learn."];
    const { flags } = await (await write(id)).json() as { flags: unknown[] };
    expect(flags).toEqual([]);
    expect(writerRequests()).toHaveLength(1);
    const verify = model.requests.find((r) => (r.messages as { content: string }[])[0]!.content.startsWith("You check"))!;
    const sent = JSON.parse((verify.messages as { content: string }[])[1]!.content) as { sources: string[]; job: string[] };
    expect(sent.job.join(" ")).toContain("Bulgaria and Hungary");
    expect(sent.sources.join(" ")).not.toContain("Bulgaria");
    expect((verify.messages as { content: string }[])[0]!.content).toContain("about the candidate");
  });

  it("still flags an invented number about the candidate when the ad has other numbers", async () => {
    const { id } = await tailored({ ...job, requirements: [{ text: "3 years of SAP payroll", kind: "must", category: "skill" }] });
    letters = [SAMPLE.replace("40 staff", "70 staff"), SAMPLE.replace("40 staff", "70 staff")];
    const { flags } = await (await write(id)).json() as { flags: { rule: string }[] };
    expect(flags.map((flag) => flag.rule)).toContain("number");
  });

  it("checks only numbers in a German letter, where every noun is capitalised", async () => {
    const { id } = await tailored({ ...job,
      summary: "Wir suchen eine Fachkraft für die Gehaltsabrechnung, die mit unseren Kunden und dem Team zusammenarbeitet.",
      responsibilities: ["Sie betreuen die monatliche Abrechnung und die Kommunikation mit den Kunden."] });
    expect(docs.cvs.get(id)!.language).toBe("de");
    letters = [`${SAMPLE}\n\nIch freue mich auf die Zusammenarbeit mit Ihrem Team und Ihren Kunden.`];
    const { flags } = await (await write(id)).json() as { flags: unknown[] };
    expect(flags).toEqual([]);
    expect(writerRequests()).toHaveLength(1);
  });

  it("keeps the retried letter when the retry fixes the flag", async () => {
    const { id } = await tailored();
    letters = [SAMPLE.replace("40 staff", "400 staff"), SAMPLE];
    const { coverLetter, flags } = await (await write(id)).json() as { coverLetter: CoverLetter; flags: unknown[] };
    expect(flags).toEqual([]);
    expect(coverLetter.body).toBe(SAMPLE);
  });

  it("regenerating replaces the saved letter", async () => {
    const { id } = await tailored();
    await write(id, { hiringManager: "Maria Ionescu" });
    letters = [SAMPLE.replace("Thank you for your time", "Thank you")];
    const res = await write(id, { whyCompany: "Their tools" });
    const { coverLetter } = await res.json() as { coverLetter: CoverLetter };
    expect(docs.cvs.get(id)!.coverLetter).toEqual(coverLetter);
    expect(coverLetter).toMatchObject({ hiringManager: null, whyCompany: "Their tools" });
    expect(coverLetter.body).toContain("Thank you and for reading");
  });

  it("returns 502 and saves nothing when the model fails", async () => {
    const { id } = await tailored();
    letters = ["x".repeat(4001)];
    expect((await write(id)).status).toBe(502);
    expect(docs.cvs.get(id)!.coverLetter).toBeNull();
  });

  it("rejects bad input and hides other users' CVs", async () => {
    const { id } = await tailored();
    expect((await write(id, { whyCompany: "x".repeat(1001) })).status).toBe(400);
    expect((await write(id, { hiringManager: "x".repeat(121) })).status).toBe(400);
    expect((await write(id, {}, "token-b")).status).toBe(404);
    expect((await write(crypto.randomUUID())).status).toBe(404);
  });
});

describe("PUT /v1/tailored/:id/cover-letter", () => {
  it("saves the edited body and keeps the letter's other fields", async () => {
    const { id } = await tailored();
    await write(id, { hiringManager: "Maria Ionescu" });
    const res = await save(id, { body: "My edited letter." });
    expect(res.status).toBe(200);
    expect(docs.cvs.get(id)!.coverLetter).toMatchObject({ body: "My edited letter.", hiringManager: "Maria Ionescu" });
  });

  it("saves the hiring manager and why-company fields when sent", async () => {
    const { id } = await tailored();
    await write(id);
    await save(id, { body: "Edited.", hiringManager: "Ion Pop", whyCompany: null });
    expect(docs.cvs.get(id)!.coverLetter).toMatchObject({ body: "Edited.", hiringManager: "Ion Pop", whyCompany: null });
  });

  it("rejects a body over 4000 characters, a letter that was never written, and other users", async () => {
    const { id } = await tailored();
    expect((await save(id, { body: "x" })).status).toBe(409);
    await write(id);
    expect((await save(id, { body: "x".repeat(4001) })).status).toBe(400);
    expect((await save(id, { body: "x" }, "token-b")).status).toBe(404);
  });
});

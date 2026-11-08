import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs } from "../src/tailor/memory-repo.ts";

const USERS: Record<string, string> = { "token-a": "user-a", "token-b": "user-b" };
const job: JobExtraction = {
  title: "Engineer", company: "Acme", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [], requirements: [],
  summary: "We are looking for an engineer who will build the tools and work with our team.",
  responsibilities: ["Work with the product team on the reports for our clients"],
};
const role = {
  id: "r1", company: "Acme", title: "Engineer", location: "Cluj", startDate: "2020-01", endDate: "", current: true,
  description: "Built payroll reports", bullets: [{ id: "b1", text: "Paid 40 staff on time" }], notes: [],
} as CvContent["experience"][number];
const base: CvContent = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop", titles: ["Engineer"], summary: "Payroll engineer." },
  experience: [role], technicalSkills: [{ id: "s1", name: "Excel" }] };

type Text = { path: string; text: string };
/** The fake translator prefixes every text it is sent with "FR ", unless a test sets its own reply. */
let override: ((texts: Text[]) => Text[]) | null;
let model: ReturnType<typeof fakeModel>;
let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let cvs: Record<string, CvRepo>;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  override = null;
  model = fakeModel(() => {
    const messages = model.requests.at(-1)!.messages as { content: string }[];
    const sent = JSON.parse(messages[1]!.content) as { texts: Text[] };
    return { texts: override ? override(sent.texts) : sent.texts.map(({ path, text }) => ({ path, text: `FR ${text}` })) };
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
async function original() {
  const jobId = crypto.randomUUID();
  await jobs.repoFor("user-a").create({ id: jobId, source: "link", url: `https://example.test/${jobId}`, urlNormalized: jobId, rawText: "x", jsonLd: null });
  await jobs.admin.finish(jobId, job);
  const res = await app.request(`/v1/jobs/${jobId}/tailor`, { method: "POST", headers: auth(), body: JSON.stringify({ tone: "neutral" }) });
  const { tailoredCvId } = await res.json() as { tailoredCvId: string };
  return { jobId, id: tailoredCvId };
}
const translate = (id: string, language: string, token = "token-a") =>
  app.request(`/v1/tailored/${id}/translate`, { method: "POST", headers: auth(token), body: JSON.stringify({ language }) });

describe("POST /v1/tailored/:id/translate", () => {
  it("creates an independent copy in the new language and leaves the original unchanged", async () => {
    const { jobId, id } = await original();
    const before = structuredClone(docs.cvs.get(id)!);
    const res = await translate(id, "fr");
    expect(res.status).toBe(200);
    const { tailoredCvId, flagged } = await res.json() as { tailoredCvId: string; flagged: number };
    expect(flagged).toBe(0);
    expect(docs.cvs.get(id)).toEqual(before);
    const copy = docs.cvs.get(tailoredCvId)!;
    expect(copy).toMatchObject({ jobId, language: "fr", translatedFrom: id, version: 1, template: before.template, score: null, review: null });
    expect(copy.content.locale).toBe("fr");
    expect(copy.content.basics.summary).toBe("FR Payroll engineer.");
    expect(copy.content.experience[0]).toMatchObject({ company: "Acme", startDate: "2020-01", description: "FR Built payroll reports",
      bullets: [{ id: "b1", text: "FR Paid 40 staff on time" }] });
    expect(copy.content.basics.fullName).toBe("Ana Pop");
    expect(copy.baseSnapshot).toEqual(copy.content);
    expect(model.logged.at(-1)?.task).toBe("tailor_translate");
    const sent = JSON.stringify(model.requests.at(-1));
    expect(sent).not.toContain("Ana Pop");
    expect(sent).not.toContain("2020-01");
  });

  it("translates role locations but never sends the header's own location", async () => {
    await cvs["user-a"]!.save({ ...base, basics: { ...base.basics, location: "Bucharest Home" } }, 1);
    const { id } = await original();
    const { tailoredCvId } = await (await translate(id, "fr")).json() as { tailoredCvId: string };
    const copy = docs.cvs.get(tailoredCvId)!;
    expect(copy.content.experience[0]!.location).toBe("FR Cluj");
    expect(copy.content.basics.location).toBe("Bucharest Home");
    expect(JSON.stringify(model.requests.at(-1))).not.toContain("Bucharest Home");
  });

  it("refreshes the same copy on a second call and never touches the original", async () => {
    const { id } = await original();
    const first = await (await translate(id, "fr")).json() as { tailoredCvId: string };
    const second = await (await translate(id, "fr")).json() as { tailoredCvId: string };
    expect(second.tailoredCvId).toBe(first.tailoredCvId);
    expect(docs.cvs.size).toBe(2);
    expect(docs.cvs.get(first.tailoredCvId)!.version).toBe(2);
    expect(docs.cvs.get(id)!.version).toBe(1);
  });

  it("keeps the source text where the translation adds a number (Task 14 checks)", async () => {
    const { id } = await original();
    override = (texts) => texts.map(({ path, text }) => ({ path, text: path === "cv.basics.summary" ? "Ingénieur paie, 12 ans." : `FR ${text}` }));
    const body = await (await translate(id, "fr")).json() as { tailoredCvId: string; flagged: number };
    expect(body.flagged).toBe(1);
    expect(docs.cvs.get(body.tailoredCvId)!.content.basics.summary).toBe("Payroll engineer.");
  });

  it("translates the cover letter when there is one", async () => {
    const { id } = await original();
    docs.cvs.get(id)!.coverLetter = { body: "Dear team, I run payroll.", hiringManager: null, whyCompany: "Your clients", generatedAt: "2026-11-08T10:00:00Z" };
    const { tailoredCvId } = await (await translate(id, "de")).json() as { tailoredCvId: string };
    expect(docs.cvs.get(tailoredCvId)!.coverLetter).toMatchObject({ body: "FR Dear team, I run payroll.", whyCompany: "FR Your clients", hiringManager: null });
    expect(docs.cvs.get(id)!.coverLetter!.body).toBe("Dear team, I run payroll.");
  });

  it("translates visible education notes but not hidden role notes or the hiring manager's name", async () => {
    const { id } = await original();
    const doc = docs.cvs.get(id)!;
    doc.content.education = [{ id: "e1", school: "UBB", degree: "BSc", field: "Economics", startDate: "2012-10", endDate: "2015-07", notes: "Thesis on payroll" }] as CvContent["education"];
    doc.coverLetter = { body: "Dear Ms Ionescu", hiringManager: "Maria Ionescu", whyCompany: null, generatedAt: "2026-11-08T10:00:00Z" };
    const { tailoredCvId } = await (await translate(id, "it")).json() as { tailoredCvId: string };
    const copy = docs.cvs.get(tailoredCvId)!;
    expect(copy.content.education[0]!.notes).toBe("FR Thesis on payroll");
    expect(copy.coverLetter!.hiringManager).toBe("Maria Ionescu");
    expect(JSON.stringify(model.requests.at(-1))).not.toContain("Maria Ionescu");
    expect(docs.cvs.get(id)!.coverLetter!.hiringManager).toBe("Maria Ionescu");
  });

  it("refuses the original's own language, an original in the target language, and other users", async () => {
    const { jobId, id } = await original();
    const same = await translate(id, "en");
    expect(same.status).toBe(400);
    expect(await same.json()).toMatchObject({ error: { code: "same_language" } });
    const fr = await (await translate(id, "fr")).json() as { tailoredCvId: string };
    const back = await translate(fr.tailoredCvId, "en");
    expect(back.status).toBe(409);
    expect(await back.json()).toMatchObject({ error: { code: "language_taken" } });
    expect((await translate(id, "xx")).status).toBe(400);
    expect((await translate(id, "fr", "token-b")).status).toBe(404);
    expect([...docs.cvs.values()].filter((cv) => cv.jobId === jobId)).toHaveLength(2);
    expect(model.requests).toHaveLength(1);
  });

  it("saves nothing when the model fails", async () => {
    const { id } = await original();
    override = () => { throw new Error("down"); };
    expect((await translate(id, "fr")).status).toBe(502);
    expect(docs.cvs.size).toBe(1);
  });
});

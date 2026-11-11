import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction, type Preferences } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import type { CvRepo } from "../src/cv/repo.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs } from "../src/tailor/memory-repo.ts";

const USERS: Record<string, string> = { "token-a": "user-a", "token-b": "user-b" };
const english: JobExtraction = {
  title: "Engineer", company: "Acme", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [], requirements: [],
  summary: "We are looking for an engineer who will build the tools and work with our team.",
  responsibilities: ["Work with the product team on the reports for our clients"],
};
const dutch: JobExtraction = { ...english,
  summary: "Wij zoeken een ontwikkelaar die met ons team werkt aan nieuwe producten voor onze klanten.",
  responsibilities: ["Je werkt samen met het team aan de rapporten"] };
const base: CvContent = { ...emptyCv("ro"), basics: { ...emptyCv("ro").basics, fullName: "Ana Pop", titles: ["Engineer"] } };

let jobs: ReturnType<typeof memoryJobs>;
let docs: MemoryTailorDocs;
let cvs: Record<string, CvRepo>;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
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
    model: () => { throw new Error("not used"); },
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
    log: vi.fn(),
  };
  app = createApp(deps);
});

async function readyJob(extracted: JobExtraction = english, user = "user-a") {
  const id = crypto.randomUUID();
  await jobs.repoFor(user).create({ id, source: "link", url: `https://example.test/${id}`, urlNormalized: id, rawText: "x", jsonLd: null });
  await jobs.admin.finish(id, extracted);
  return id;
}
const start = (jobId: string, body: unknown = { tone: "neutral" }, token = "token-a") =>
  app.request(`/v1/jobs/${jobId}/tailor`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
  });
const getRun = (id: string, token = "token-a") =>
  app.request(`/v1/tailor-runs/${id}`, { headers: { authorization: `Bearer ${token}` } });
const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status);
  expect(await res.json()).toMatchObject({ error: { code } });
};

describe("POST /v1/jobs/:id/tailor", () => {
  it("creates one tailored CV from the current Base CV and one running tailor run", async () => {
    const jobId = await readyJob();
    const res = await start(jobId, { tone: "confident", instruction: "Stress leadership" });
    expect(res.status).toBe(200);
    const body = await res.json() as { run: { id: string }; tailoredCvId: string; language: string };
    expect(body.run).toMatchObject({ jobId, tailoredCvId: body.tailoredCvId, kind: "tailor", status: "running", currentSection: "experience",
      sections: ["experience", "skills", "summary", "achievements", "languages", "layout"] });
    expect(body.language).toBe("en");
    expect(docs.cvs.size).toBe(1);
    expect(docs.runs.size).toBe(1);
    const cv = docs.cvs.get(body.tailoredCvId)!;
    expect(cv).toMatchObject({ userId: "user-a", jobId, language: "en", tone: "confident", instruction: "Stress leadership",
      content: base, baseSnapshot: base });
    expect(cv.baseSnapshotAt).toEqual(expect.any(String));
  });

  it("starts in the language picked on the language step, whatever the default would be", async () => {
    const jobId = await readyJob();
    const res = await start(jobId, { language: "de" });
    expect(res.status).toBe(200);
    const body = await res.json() as { tailoredCvId: string; language: string };
    expect(body.language).toBe("de");
    expect(docs.cvs.get(body.tailoredCvId)).toMatchObject({ language: "de", tone: "neutral" });
    await expectError(await start(jobId, { language: "nl" }), 400, "invalid_content");
  });

  it("tells the language step the CV's language, the ad's and the one a start would use", async () => {
    const languages = (jobId: string, token = "token-a") =>
      app.request(`/v1/jobs/${jobId}/tailor-language`, { headers: { authorization: `Bearer ${token}` } });
    const clear = await languages(await readyJob());
    expect(clear.status).toBe(200);
    expect(await clear.json()).toEqual({ cv: "ro", ad: "en", chosen: "en" });
    // An ad in a language outside the six: unclear, so the CV's language is the starting choice.
    expect(await (await languages(await readyJob(dutch))).json()).toEqual({ cv: "ro", ad: null, chosen: "ro" });
    expect(docs.cvs.size).toBe(0);
    await expectError(await languages(crypto.randomUUID()), 404, "job_not_found");
    await expectError(await languages(await readyJob(english, "user-b")), 404, "job_not_found");
  });

  it("returns the same run and tailored CV for a second start, even at the same moment (Review focus 1)", async () => {
    const jobId = await readyJob();
    const [one, two] = await Promise.all([start(jobId), start(jobId)]);
    const a = await one.json() as { run: { id: string }; tailoredCvId: string };
    const b = await two.json() as { run: { id: string }; tailoredCvId: string };
    expect(b.tailoredCvId).toBe(a.tailoredCvId);
    expect(docs.cvs.size).toBe(1);
    const again = await (await start(jobId)).json() as { run: { id: string }; tailoredCvId: string };
    expect(again).toMatchObject({ tailoredCvId: a.tailoredCvId, run: { id: a.run.id } });
    expect(docs.cvs.size).toBe(1);
  });

  it("writes in the Base CV locale when the ad is in a language outside the six (Review focus 2)", async () => {
    const jobId = await readyJob(dutch);
    const body = await (await start(jobId)).json() as { tailoredCvId: string; language: string };
    expect(body.language).toBe("ro");
    expect(docs.cvs.get(body.tailoredCvId)?.language).toBe("ro");
  });

  it("refuses a job that isn't ready", async () => {
    const id = crypto.randomUUID();
    await jobs.repoFor("user-a").create({ id, source: "link", url: "https://example.test/q", urlNormalized: "q", rawText: "x", jsonLd: null });
    await expectError(await start(id), 409, "job_not_ready");
    expect(docs.cvs.size).toBe(0);
  });

  it("hides another user's job and a deleted job (Review focus 4)", async () => {
    const other = await readyJob(english, "user-b");
    await expectError(await start(other), 404, "job_not_found");
    const deleted = await readyJob();
    await jobs.repoFor("user-a").remove(deleted);
    await expectError(await start(deleted), 404, "job_not_found");
    expect(docs.cvs.size).toBe(0);
  });

  it("stores the full steering, and keeps tone and instruction in their columns", async () => {
    const jobId = await readyJob();
    const steering = { tone: "technical", draws: ["work", "company"], fit: "stretch", focusRoleIds: ["r1"], instruction: "Stress SQL" };
    const body = await (await start(jobId, steering)).json() as { tailoredCvId: string };
    expect(docs.steering.get(body.tailoredCvId)).toEqual(steering);
    expect(docs.cvs.get(body.tailoredCvId)).toMatchObject({ tone: "technical", instruction: "Stress SQL" });
  });

  it("still takes the old tone and instruction body, and an empty one", async () => {
    const old = await (await start(await readyJob(), { tone: "formal", instruction: "Short" })).json() as { tailoredCvId: string };
    expect(docs.steering.get(old.tailoredCvId)).toEqual({ tone: "formal", instruction: "Short" });
    const empty = await start(await readyJob(), {});
    expect(empty.status).toBe(200);
    const id = ((await empty.json()) as { tailoredCvId: string }).tailoredCvId;
    expect(docs.cvs.get(id)).toMatchObject({ tone: "neutral", instruction: null });
  });

  it("rejects a bad tone or an instruction over 500 characters", async () => {
    const jobId = await readyJob();
    await expectError(await start(jobId, { tone: "angry" }), 400, "invalid_content");
    await expectError(await start(jobId, { tone: "neutral", instruction: "x".repeat(501) }), 400, "invalid_content");
  });
});

describe("GET /v1/tailor-runs/:id", () => {
  it("returns the owner's run", async () => {
    const jobId = await readyJob();
    const { run } = await (await start(jobId)).json() as { run: { id: string } };
    const res = await getRun(run.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: run.id, jobId, status: "running" });
  });

  it("returns 404 job_not_found for a missing run, another user's run, or a deleted job (Review focus 4)", async () => {
    const jobId = await readyJob();
    const { run } = await (await start(jobId)).json() as { run: { id: string } };
    await expectError(await getRun(crypto.randomUUID()), 404, "job_not_found");
    await expectError(await getRun("not-a-uuid"), 404, "job_not_found");
    await expectError(await getRun(run.id, "token-b"), 404, "job_not_found");
    await jobs.repoFor("user-a").remove(jobId);
    await expectError(await getRun(run.id), 404, "job_not_found");
  });
});

describe("starting from the person's saved defaults", () => {
  function appWith(preferences: Preferences) {
    return createApp({
      appOrigin: "http://127.0.0.1:5173",
      verifyToken: async (token) => (USERS[token] ? { id: USERS[token], token } : null),
      cvRepo: (user) => cvs[user.id]!,
      importRepo: () => { throw new Error("not used"); },
      jobRepo: (user) => jobs.repoFor(user.id),
      tailorRepo: (user) => memoryTailorRepo(user.id, new Map(), docs),
      insightsRepo: () => { throw new Error("not used"); },
      model: () => { throw new Error("not used"); },
      account: {
        repo: () => ({ getPreferences: async () => preferences, savePreferences: async () => preferences, exportAll: async () => { throw new Error("not used"); } }),
        admin: () => ({ deleteUser: async () => {} }),
      },
      queue: { send: async () => {} },
      jobQueue: { send: async () => {} },
      log: vi.fn(),
    });
  }
  const startWith = async (preferences: Preferences) => {
    const jobId = await readyJob(english);
    const res = await appWith(preferences).request(`/v1/jobs/${jobId}/tailor`, {
      method: "POST", headers: { authorization: "Bearer token-a", "content-type": "application/json" }, body: JSON.stringify({ tone: "neutral" }),
    });
    expect(res.status).toBe(200);
    const { tailoredCvId, language } = (await res.json()) as { tailoredCvId: string; language: string };
    return { language, template: docs.cvs.get(tailoredCvId)!.template };
  };

  it("follows the job ad's language and the classic template by default", async () => {
    expect(await startWith({ displayName: null, defaultTemplate: "classic", tailoringLanguage: "job" })).toEqual({ language: "en", template: "classic" });
  });

  it("uses the CV's language when the person asked for that", async () => {
    expect(await startWith({ displayName: null, defaultTemplate: "classic", tailoringLanguage: "cv" })).toMatchObject({ language: "ro" });
  });

  it("uses the fixed language and the template the person chose", async () => {
    expect(await startWith({ displayName: null, defaultTemplate: "modern", tailoringLanguage: "de" })).toEqual({ language: "de", template: "modern" });
  });
});

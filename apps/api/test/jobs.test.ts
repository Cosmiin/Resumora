import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobExtraction, JobListPage, MatchScore } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { JOBS_PER_DAY, type JobMessage } from "../src/jobs/repo.ts";

import { memoryTailorDocs, memoryTailorRepo, type MemoryTailorDocs, type MemoryTailorStore } from "../src/tailor/memory-repo.ts";
import { supabaseTailorRepo } from "../src/tailor/supabase-repo.ts";
import { fakeModel } from "../src/tailor/fake-model.ts";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import { emptyCv } from "@resumora/shared";

const score: MatchScore = {
  policy: "match/1", total: 50, band: "fair", capped: false, labels: [],
  parts: { requirements: null, keywords: null, seniority: { points: 0.5, max: 100 }, langEdu: null },
};
let scores: MemoryTailorStore;
const ORIGIN = "http://127.0.0.1:5173";
const USERS: Record<string, string> = { "token-a": "user-a", "token-b": "user-b" };
const body = { url: "https://example.test/jobs/engineer", pageText: "a".repeat(200) };
const extracted: JobExtraction = {
  title: "Engineer", company: "Acme", location: null, workMode: "remote",
  employmentType: "full_time", seniority: "mid", salary: null, summary: "Build useful tools.",
  responsibilities: [], requirements: [], benefits: [], applyBy: null, isJobPosting: true,
};
let clock: Date;
let store: ReturnType<typeof memoryJobs>;
let sent: JobMessage[];
let deps: AppDeps;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  clock = new Date("2026-11-05T10:00:00Z");
  store = memoryJobs({ now: () => clock });
  sent = [];
  scores = new Map();
  deps = {
    appOrigin: ORIGIN,
    verifyToken: async (token) => (USERS[token] ? { id: USERS[token], token } : null),
    cvRepo: () => { throw new Error("not used"); },
    importRepo: () => { throw new Error("not used"); },
    jobRepo: (user) => store.repoFor(user.id),
    tailorRepo: (user) => memoryTailorRepo(user.id, scores),
    insightsRepo: () => { throw new Error("not used"); },
    model: () => { throw new Error("not used"); },
    queue: { send: async () => {} },
    jobQueue: { send: async (message) => void sent.push(message) },
    now: () => clock,
    log: vi.fn(),
  };
  app = createApp(deps);
});

const post = (input: unknown = body, token = "token-a", headers: Record<string, string> = {}) =>
  app.request("/v1/jobs", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...headers },
    body: JSON.stringify(input),
  });
const get = (id = "") =>
  app.request(`/v1/jobs${id ? `/${id}` : ""}`, { headers: { authorization: "Bearer token-a" } });
const patch = (id: string, version = 1, value: unknown = extracted, fields: Record<string, unknown> = {}) =>
  app.request(`/v1/jobs/${id}`, {
    method: "PATCH", headers: { authorization: "Bearer token-a", "content-type": "application/json" },
    body: JSON.stringify({ version, extracted: value, ...fields }),
  });
const remove = (id: string) =>
  app.request(`/v1/jobs/${id}`, { method: "DELETE", headers: { authorization: "Bearer token-a" } });
async function create(input = body, token = "token-a"): Promise<string> {
  const res = await post(input, token);
  expect(res.status).toBe(202);
  return ((await res.json()) as { id: string }).id;
}
async function error(res: Response, status: number, code: string, message?: string) {
  expect(res.status).toBe(status);
  expect(await res.json()).toMatchObject({ error: { code, ...(message ? { message } : {}), requestId: expect.any(String) } });
}
function listFields(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(/"(rawText|raw_text|jsonLd|json_ld)"\s*:/);
}
function jobFields(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(/"(raw_text|jsonLd|json_ld)"\s*:/);
}

describe("the score of one tailored copy", () => {
  type Answer = { base: MatchScore | null; tailored: MatchScore | null; tailoredCvId: string | null; stale: boolean; hasTailoredCv: boolean };
  let docs: MemoryTailorDocs;
  let model: ReturnType<typeof fakeModel>;
  const tailor = (user = "user-a") => memoryTailorRepo(user, scores, docs);
  const scoreOf = (total: number): MatchScore => ({ ...score, total });
  const headers = (token = "token-a") => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  const read = async (jobId: string, cv?: string, token = "token-a") =>
    await (await app.request(`/v1/jobs/${jobId}/score${cv ? `?cv=${cv}` : ""}`, { headers: headers(token) })).json() as Answer;
  const put = (cvId: string, content: unknown, expectedVersion: number, token = "token-a") =>
    app.request(`/v1/tailored/${cvId}`, { method: "PUT", headers: headers(token), body: JSON.stringify({ content, expectedVersion }) });
  const recheck = (cvId: string, token = "token-a") => app.request(`/v1/tailored/${cvId}/score`, { method: "POST", headers: headers(token) });

  beforeEach(() => {
    docs = memoryTailorDocs();
    model = fakeModel(() => ({ labels: [], cvSeniority: "mid" }));
    app = createApp({ ...deps, tailorRepo: (user) => memoryTailorRepo(user.id, scores, docs), model: () => model.deps });
  });

  /** A ready job with an English copy (saved first, score 84) and a Romanian one (saved last, no score yet). */
  async function twoCopies(token = "token-a", url = body.url) {
    const jobId = await create({ ...body, url }, token);
    await store.admin.finish(jobId, extracted);
    const repo = tailor(USERS[token]);
    const en = await repo.createTailoredCv({
      jobId, language: "en", content: emptyCv("en"), baseSnapshotAt: clock.toISOString(), tone: "neutral", instruction: null, steering: {},
    });
    const ro = await repo.saveTranslation({
      jobId, language: "ro", content: emptyCv("ro"), coverLetter: null, template: "classic", tone: "neutral", instruction: null,
      translatedFrom: en, at: "2026-11-06T10:00:00.000Z",
    });
    docs.cvs.get(en)!.updatedAt = "2026-11-05T10:00:00.000Z";
    await repo.saveScore(jobId, "tailored", en, scoreOf(84));
    return { jobId, en, ro };
  }

  it("answers for the copy asked for, and for the copy saved last when none is named", async () => {
    const { jobId, en, ro } = await twoCopies();
    await tailor().saveScore(jobId, "tailored", ro, scoreOf(80));
    expect(await read(jobId, ro)).toMatchObject({ tailored: { total: 80 }, tailoredCvId: ro, stale: false });
    expect(await read(jobId, en)).toMatchObject({ tailored: { total: 84 }, tailoredCvId: en, stale: false });
    expect(await read(jobId)).toMatchObject({ tailored: { total: 80 }, tailoredCvId: ro });
    docs.cvs.get(en)!.updatedAt = "2026-11-07T10:00:00.000Z";
    expect(await read(jobId)).toMatchObject({ tailored: { total: 84 }, tailoredCvId: en });
  });

  it("shows no score for a copy that has none, never another copy's", async () => {
    const { jobId, en, ro } = await twoCopies();
    expect(await read(jobId, ro)).toMatchObject({ tailored: null, tailoredCvId: ro, stale: true });
    expect(await read(jobId, en)).toMatchObject({ tailored: { total: 84 }, tailoredCvId: en, stale: false });
  });

  it("falls back to the copy's own stored score when it has no score history", async () => {
    const { jobId, ro } = await twoCopies();
    docs.cvs.get(ro)!.score = scoreOf(71);
    expect(await read(jobId, ro)).toMatchObject({ tailored: { total: 71 }, tailoredCvId: ro, stale: false });
  });

  it("treats ?cv= naming another job's or another person's CV as absent", async () => {
    const { jobId, ro } = await twoCopies();
    const other = await twoCopies("token-a", "https://example.test/jobs/other");
    await tailor().saveScore(other.jobId, "tailored", other.ro, scoreOf(33));
    const theirs = await twoCopies("token-b", "https://example.test/jobs/theirs");
    await tailor("user-b").saveScore(theirs.jobId, "tailored", theirs.ro, scoreOf(22));
    const absent = await read(jobId);
    expect(absent).toMatchObject({ tailored: null, tailoredCvId: ro });
    for (const cv of [other.ro, other.en, theirs.ro, theirs.en, "not-an-id"]) {
      const answer = await read(jobId, cv);
      expect(answer).toEqual(absent);
      expect(JSON.stringify(answer)).not.toContain(cv);
    }
  });

  it("marks the score out of date after a hand edit that changes the content, not after saving the same content", async () => {
    const { jobId, en } = await twoCopies();
    const same = await put(en, emptyCv("en"), 1);
    expect(same.status).toBe(200);
    expect(await read(jobId, en)).toMatchObject({ tailored: { total: 84 }, stale: false });
    const edited = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop" } };
    // An edit that loses the version check saves nothing, so it changes nothing.
    expect((await put(en, edited, 1)).status).toBe(409);
    expect((await read(jobId, en)).stale).toBe(false);
    expect((await put(en, edited, 2)).status).toBe(200);
    // The old number stays; only the flag changes.
    expect(await read(jobId, en)).toMatchObject({ tailored: { total: 84 }, stale: true });
  });

  it("Re-check scores the copy as it stands, clears the flag and answers with the new score", async () => {
    const { jobId, en, ro } = await twoCopies();
    await put(en, { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop" } }, 1);
    expect((await read(jobId, en)).stale).toBe(true);

    const res = await recheck(en);
    expect(res.status).toBe(200);
    const answer = await res.json() as Answer;
    expect(model.logged.map((call) => call.task)).toEqual(["tailor_score"]);
    const stored = await tailor().getScore(jobId, "tailored", en);
    expect(stored).not.toEqual(scoreOf(84));
    expect(answer).toMatchObject({ tailored: stored, tailoredCvId: en, stale: false });
    expect(await read(jobId, en)).toEqual(answer);
    // The copy keeps its version (an open editor isn't thrown off) and its own stored score follows.
    expect(docs.cvs.get(en)).toMatchObject({ version: 2, score: stored });
    // The other copy is untouched.
    expect(await read(jobId, ro)).toMatchObject({ tailored: null, stale: true });
  });

  it("Re-check answers like PUT for a CV that isn't the caller's, and with the scoring error when the AI fails", async () => {
    const { jobId, en } = await twoCopies();
    const theirs = await put(en, emptyCv("en"), 1, "token-b");
    await error(await recheck(en, "token-b"), theirs.status, "not_found");
    await error(await recheck("not-an-id"), 404, "not_found");
    model = fakeModel(() => ({}), 500);
    await error(await recheck(en), 502, "ai_failed");
    // The old number stays.
    expect(await read(jobId, en)).toMatchObject({ tailored: { total: 84 }, stale: false });
  });

  it("says a job is tailored only once a tailor, retailor or section run is done", async () => {
    const { jobId, en } = await twoCopies();
    const repo = tailor();
    const run = await repo.createRun({ jobId, tailoredCvId: en, kind: "tailor", sections: ["summary"], currentSection: "summary" });
    expect((await read(jobId)).hasTailoredCv).toBe(false);
    for (const kind of ["translate", "cover_letter"] as const) {
      const other = await repo.createRun({ jobId, tailoredCvId: en, kind, sections: [], currentSection: null });
      await repo.updateRun(other.id, { status: "done" });
    }
    expect((await read(jobId)).hasTailoredCv).toBe(false);
    await repo.updateRun(run.id, { status: "done", currentSection: null });
    expect((await read(jobId)).hasTailoredCv).toBe(true);
  });

  /** Marks the job tailored: one finished tailoring run. */
  async function finishRun(jobId: string, cvId: string, user = "user-a") {
    const run = await tailor(user).createRun({ jobId, tailoredCvId: cvId, kind: "tailor", sections: ["summary"], currentSection: "summary" });
    await tailor(user).updateRun(run.id, { status: "done", currentSection: null });
  }
  const listed = async (token = "token-a") => {
    const page = await (await app.request("/v1/jobs", { headers: headers(token) })).json() as JobListPage;
    return new Map(page.items.map((item) => [item.id, { score: item.score, tailoredLanguages: item.tailoredLanguages }]));
  };

  it("lists each job with its latest score and the languages it has a tailored CV in", async () => {
    // Tailored: base 69, its only copy 84.
    const tailoredJob = await create();
    await store.admin.finish(tailoredJob, extracted);
    const en = await tailor().createTailoredCv({
      jobId: tailoredJob, language: "en", content: emptyCv("en"), baseSnapshotAt: clock.toISOString(), tone: "neutral", instruction: null, steering: {},
    });
    await tailor().saveScore(tailoredJob, "base", null, scoreOf(69));
    await tailor().saveScore(tailoredJob, "tailored", en, scoreOf(84));
    await finishRun(tailoredJob, en);
    // Not tailored, scored 61.
    const scoredJob = await create({ ...body, url: "https://example.test/jobs/scored" });
    await store.admin.finish(scoredJob, extracted);
    await tailor().saveScore(scoredJob, "base", null, scoreOf(61));
    // Still being read.
    const readingJob = await create({ ...body, url: "https://example.test/jobs/reading" });

    const list = await listed();
    expect(list.get(tailoredJob)).toEqual({ score: 84, tailoredLanguages: ["en"] });
    expect(list.get(scoredJob)).toEqual({ score: 61, tailoredLanguages: [] });
    expect(list.get(readingJob)).toEqual({ score: null, tailoredLanguages: [] });
  });

  it("lists a job with two copies under the score of the copy saved last, with both languages", async () => {
    const { jobId, en, ro } = await twoCopies();
    await tailor().saveScore(jobId, "base", null, scoreOf(69));
    await tailor().saveScore(jobId, "tailored", ro, scoreOf(80));
    await finishRun(jobId, en);
    expect((await listed()).get(jobId)).toEqual({ score: 80, tailoredLanguages: ["en", "ro"] });
  });

  it("lists a job whose tailoring isn't done under its base score, as not tailored", async () => {
    const { jobId } = await twoCopies();
    await tailor().saveScore(jobId, "base", null, scoreOf(69));
    expect((await listed()).get(jobId)).toEqual({ score: 69, tailoredLanguages: [] });
  });

  it("never lists another person's scores or tailored CVs", async () => {
    const { jobId, en } = await twoCopies();
    await tailor().saveScore(jobId, "base", null, scoreOf(69));
    await finishRun(jobId, en);
    const theirs = await create({ ...body, url: "https://example.test/jobs/theirs" }, "token-b");
    expect([...(await listed("token-b"))]).toEqual([[theirs, { score: null, tailoredLanguages: [] }]]);
    // Even asked by id, the other person's job gives nothing away.
    expect((await tailor("user-b").summaries([jobId])).get(jobId)).toEqual({ score: null, tailoredLanguages: [] });
  });

  it("asks the database the same number of questions for 20 jobs as for 1", async () => {
    const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-key" };
    const idsIn = (url: URL, column: string) => (url.searchParams.get(column) ?? "").replace(/^in\.\(|\)$/g, "").split(",").map((id) => id.replace(/"/g, ""));
    let calls = 0;
    // Every job is tailored and has one English copy scored 84 in its own column and 88 in its history.
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      calls++;
      const url = new URL(input);
      const table = url.pathname.split("/").pop();
      const select = url.searchParams.get("select") ?? "";
      if (table === "jobs" && select.includes("tailor_runs")) return Response.json(idsIn(url, "id").map((id) => ({ id, tailor_runs: [{ id: "run" }] })));
      if (table === "jobs") return Response.json(idsIn(url, "id").map((id) => ({ id, match_scores: [{ total: 69 }] })));
      if (table === "tailored_cvs") return Response.json(idsIn(url, "job_id").map((jobId) => ({ id: `cv-${jobId}`, job_id: jobId, language: "en", total: 84 })));
      return Response.json(idsIn(url, "tailored_cv_id").filter((id) => id !== "cv-job-0").map((id) => ({ tailored_cv_id: id, total: 88 })));
    }));
    try {
      const repo = supabaseTailorRepo(env, { id: "a", token: "user-token" });
      const one = await repo.summaries(["job-0"]);
      const forOne = calls;
      calls = 0;
      const many = await repo.summaries(Array.from({ length: 20 }, (_, index) => `job-${index}`));
      expect(calls).toBe(forOne);
      // A copy with no score history falls back to its own stored score.
      expect(one.get("job-0")).toEqual({ score: 84, tailoredLanguages: ["en"] });
      expect(many.get("job-19")).toEqual({ score: 88, tailoredLanguages: ["en"] });
      expect(many.size).toBe(20);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("job endpoints", () => {
  it("returns the base score, null before scoring, and 404 for another user's job", async () => {
    const id = await create();
    const request = (jobId: string, token = "token-a") => app.request(`/v1/jobs/${jobId}/score`, { headers: { authorization: `Bearer ${token}` } });
    const empty = await request(id);
    expect(empty.status).toBe(200);
    const none = { tailored: null, tailoredCvId: null, stale: false, hasTailoredCv: false };
    expect(await empty.json()).toEqual({ base: null, ...none });
    await memoryTailorRepo("user-a", scores).saveScore(id, "base", null, score);
    // A tailored score with no tailored CV of this job behind it is never shown.
    await memoryTailorRepo("user-a", scores).saveScore(id, "tailored", "cv-a", score);
    const res = await request(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ base: score, ...none });
    await error(await request(id, "token-b"), 404, "not_found");
    await error(await request(crypto.randomUUID()), 404, "not_found");
    await error(await request("invalid"), 404, "not_found");
  });

  it("computes a missing Score 1 on request, once, and refuses jobs that aren't ready", async () => {
    const model = fakeModel(() => ({ labels: [], cvSeniority: "mid" }));
    const cv = memoryCvRepo();
    await cv.save(emptyCv("en"), 0);
    app = createApp({ ...deps, cvRepo: () => cv, model: () => model.deps });
    const score1 = (jobId: string, token = "token-a") => app.request(`/v1/jobs/${jobId}/score`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const id = await create();
    await error(await score1(id), 409, "job_not_ready");
    await store.admin.finish(id, extracted);
    await error(await score1(id, "token-b"), 404, "not_found");
    const res = await score1(id);
    expect(res.status).toBe(200);
    const body = await res.json() as { base: MatchScore; tailored: null };
    expect(body).toMatchObject({ base: { policy: "match/1" }, tailored: null, tailoredCvId: null, stale: false, hasTailoredCv: false });
    expect(await memoryTailorRepo("user-a", scores).getScore(id, "base")).toEqual(body.base);
    expect(model.logged.map((call) => call.task)).toEqual(["tailor_score"]);
    expect((await score1(id)).status).toBe(200);
    expect(model.logged).toHaveLength(1);
  });

  it("answers 502 when computing Score 1 fails, and saves nothing", async () => {
    const model = fakeModel(() => ({}), 500);
    const cv = memoryCvRepo();
    await cv.save(emptyCv("en"), 0);
    app = createApp({ ...deps, cvRepo: () => cv, model: () => model.deps });
    const id = await create();
    await store.admin.finish(id, extracted);
    await error(await app.request(`/v1/jobs/${id}/score`, { method: "POST", headers: { authorization: "Bearer token-a" } }), 502, "ai_failed");
    expect(await memoryTailorRepo("user-a", scores).getScore(id, "base")).toBeNull();
  });

  it("lists each job with its application status and the ad's own closed flag", async () => {
    const open = await create();
    clock = new Date(clock.getTime() + 1000);
    const closed = await create({ ...body, url: "https://example.test/jobs/closed" });
    await store.admin.finish(open, extracted);
    await store.admin.finish(closed, { ...extracted, positionClosed: true });
    expect((await patch(open, 1, extracted, { applicationStatus: "interview" })).status).toBe(200);
    const list = (await (await get()).json()) as JobListPage;
    expect(list.items.map(({ id, applicationStatus, positionClosed }) => ({ id, applicationStatus, positionClosed }))).toEqual([
      { id: closed, applicationStatus: "saved", positionClosed: true },
      { id: open, applicationStatus: "interview", positionClosed: false },
    ]);
    listFields(list);
  });

  it("round-trips application status and preserves it when omitted", async () => {
    const id = await create();
    await store.admin.finish(id, extracted);
    const res = await patch(id, 1, extracted, { applicationStatus: "applied" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applicationStatus: "applied", version: 2, editedByUser: false });
    expect((await patch(id, 2)).status).toBe(200);
    expect(await (await get(id)).json()).toMatchObject({ applicationStatus: "applied", version: 3 });
  });

  it("ignores old thoughts in PATCH and returns no thoughts in GET", async () => {
    const id = await create();
    await store.admin.finish(id, extracted);
    const res = await patch(id, 1, extracted, { userThoughts: "x".repeat(2001), unknown: "ignored" });
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("userThoughts");
    const detail = await get(id);
    expect(detail.status).toBe(200);
    expect(await detail.json()).not.toHaveProperty("userThoughts");
  });

  it("rejects invalid application statuses", async () => {
    const id = await create();
    await store.admin.finish(id, extracted);
    await error(await patch(id, 1, extracted, { applicationStatus: "invalid" }), 400, "invalid_content");
    // A tab opened before "tailored" stopped being a status gets the same answer.
    await error(await patch(id, 1, extracted, { applicationStatus: "tailored" }), 400, "invalid_content");
    expect(await (await get(id)).json()).toMatchObject({ applicationStatus: "saved", version: 1 });
  });
  it("creates a queued extension job and sends one message", async () => {
    const res = await post();
    expect(res.status).toBe(202);
    const result = (await res.json()) as { id: string };
    expect(result).toEqual({ id: expect.any(String) });
    expect(sent).toEqual([{ jobId: result.id, userId: "user-a" }]);
    expect(store.rows.get(result.id)).toMatchObject({ status: "queued", source: "extension", rawText: body.pageText, jsonLd: null });
  });

  it("labels a job sent by the web app as a link", async () => {
    const res = await post({ ...body, source: "link" });
    expect(res.status).toBe(202);
    const result = (await res.json()) as { id: string };
    expect(store.rows.get(result.id)).toMatchObject({ source: "link" });
  });

  it("trims page text, caps stored text, and selects the JobPosting", async () => {
    const posting = { "@type": "JobPosting", title: "Engineer" };
    const res = await post({ ...body, pageText: `  ${"x".repeat(60_000)}  `, jsonLd: [{ "@type": "Organization" }, { "@graph": [posting] }] });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    expect(store.rows.get(id)).toMatchObject({ rawText: "x".repeat(30_000), jsonLd: posting });
  });

  it("returns a duplicate before checking the daily limit", async () => {
    const id = await create({ ...body, url: `${body.url}?utm_source=first` });
    for (let i = 1; i < JOBS_PER_DAY; i++) store.runs.push({ userId: "user-a", jobId: null, createdAt: clock.toISOString() });
    const res = await post({ ...body, url: `${body.url}?utm_campaign=second` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, existing: true });
    expect(sent).toEqual([{ jobId: id, userId: "user-a" }]);
    expect(store.rows.size).toBe(1);
    expect(store.runs).toHaveLength(JOBS_PER_DAY);
  });

  it("returns a duplicate found during create without queuing another message", async () => {
    const id = await create();
    const repo = store.repoFor("user-a");
    vi.spyOn(repo, "findByUrl").mockResolvedValue(null);
    deps.jobRepo = () => repo;
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, existing: true });
    expect(sent).toHaveLength(1);
    expect(store.runs).toHaveLength(1);
  });

  it("limits runs within the last 24 hours without creating or queuing a job", async () => {
    for (let i = 0; i < JOBS_PER_DAY; i++) store.runs.push({ userId: "user-a", jobId: null, createdAt: clock.toISOString() });
    await error(await post(), 429, "job_limit", "You can add up to 30 jobs per day.");
    expect(sent).toEqual([]);
    expect(store.rows.size).toBe(0);
    clock = new Date(clock.getTime() + 24 * 60 * 60_000 + 1);
    expect((await post()).status).toBe(202);
  });

  it.each([undefined, "a".repeat(199), ` ${"a".repeat(199)} `])("rejects missing or short page text", async (pageText) => {
    await error(await post({ ...body, pageText }), 400, "text_too_short", "Not enough text on this page. Select the job description and try again.");
    expect(store.rows.size).toBe(0);
    expect(sent).toEqual([]);
  });

  it.each(["javascript:alert(1)", "ftp://example.test/job", "not a url", undefined])("rejects an invalid URL", async (url) => {
    await error(await post({ ...body, url }), 400, "invalid_url", "This doesn't look like a job link.");
    expect(sent).toEqual([]);
  });

  it("validates the page text maximum and JSON-LD schema", async () => {
    await error(await post({ ...body, pageText: "a".repeat(60_001) }), 400, "invalid_content");
    await error(await post({ ...body, jsonLd: {} }), 400, "invalid_content");
    expect(sent).toEqual([]);
  });

  it("checks declared and actual body sizes, including UTF-8 bytes", async () => {
    const large = { ...body, extra: "a".repeat(101 * 1024) };
    const message = "This page is too large to send.";
    await error(await post(body, "token-a", { "content-length": String(101 * 1024) }), 413, "payload_too_large", message);
    await error(await post(large), 413, "payload_too_large", message);
    await error(await post(large, "token-a", { "content-length": "10" }), 413, "payload_too_large", message);
    await error(await post({ ...body, pageText: "é".repeat(60_000) }), 413, "payload_too_large", message);
    expect(store.rows.size).toBe(0);
    expect(sent).toEqual([]);
  });

  it("removes the job when queuing fails and permits a later attempt", async () => {
    const send = deps.jobQueue.send;
    deps.jobQueue.send = async () => { throw new Error("queue unavailable"); };
    const res = await post();
    await error(res, 500, "internal");
    expect(store.rows.size).toBe(0);
    expect(sent).toEqual([]);
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ path: "/v1/jobs", requestId: res.headers.get("x-request-id") }));
    expect(JSON.stringify(vi.mocked(deps.log).mock.calls)).not.toContain(body.pageText);
    deps.jobQueue.send = send;
    expect((await post()).status).toBe(202);
  });

  it("lists only the caller's jobs newest first and omits private fields", async () => {
    const first = await create();
    clock = new Date(clock.getTime() + 1000);
    const second = await create({ ...body, url: "https://example.test/jobs/second" });
    const other = await create(body, "token-b");
    const res = await get();
    expect(res.status).toBe(200);
    const list = (await res.json()) as JobListPage;
    expect(list.items.map((item) => item.id)).toEqual([second, first]);
    expect(list.nextCursor).toBeNull();
    listFields(list);
    const detail = await get(first);
    expect(detail.status).toBe(200);
    const job = await detail.json();
    expect(job).toMatchObject({ id: first, version: 1, editedByUser: false, rawText: body.pageText });
    jobFields(job);
    await error(await get(other), 404, "not_found");
    await error(await patch(other), 404, "not_found");
    await error(await remove(other), 404, "not_found");
    expect(store.rows.has(other)).toBe(true);
  });

  it("lists only the jobs that came from one source when asked", async () => {
    const byHand = ((await (await post({ ...body, source: "link" })).json()) as { id: string }).id;
    clock = new Date(clock.getTime() + 1000);
    const fromExtension = await create({ ...body, url: "https://example.test/jobs/from-extension" });
    const request = (query: string) => app.request(`/v1/jobs?${query}`, { headers: { authorization: "Bearer token-a" } });
    const extension = await (await request("limit=1&source=extension")).json() as JobListPage;
    expect(extension.items.map((job) => job.id)).toEqual([fromExtension]);
    const link = await (await request("source=link")).json() as JobListPage;
    expect(link.items.map((job) => job.id)).toEqual([byHand]);
    expect((await request("source=email")).status).toBe(400);
  });

  it("follows list cursors and keeps other users and private fields off every page", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      clock = new Date(clock.getTime() + 1000);
      ids.unshift(await create({ ...body, url: `https://example.test/jobs/${i}` }));
    }
    await create(body, "token-b");
    const request = (query: string) => app.request(`/v1/jobs?${query}`, { headers: { authorization: "Bearer token-a" } });
    const first = await request("limit=2");
    expect(first.status).toBe(200);
    const page = await first.json() as JobListPage;
    expect(page.items.map((job) => job.id)).toEqual(ids.slice(0, 2));
    expect(page.nextCursor).toEqual(expect.any(String));
    const second = await request(`limit=2&cursor=${encodeURIComponent(page.nextCursor!)}`);
    expect(second.status).toBe(200);
    const rest = await second.json() as JobListPage;
    expect(rest.items.map((job) => job.id)).toEqual(ids.slice(2));
    expect(rest.nextCursor).toBeNull();
    listFields(page);
    listFields(rest);
  });

  it.each(["limit=500", "limit=abc", "limit=0", "cursor=bad", "cursor=", `cursor=${"x".repeat(201)}`])
  ("rejects invalid list queries: %s", async (query) => {
    const res = await app.request(`/v1/jobs?${query}`, { headers: { authorization: "Bearer token-a" } });
    await error(res, 400, "invalid_request", "Something went wrong loading your jobs. Reload the page.");
  });

  it("rejects queued edits, saves ready edits, and rejects stale versions", async () => {
    const id = await create();
    await error(await patch(id), 409, "wrong_status", "This job can't be changed right now.");
    await store.admin.start(id);
    await store.admin.finish(id, extracted);
    const res = await patch(id, 1, { ...extracted, title: "Senior Engineer" });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated).toMatchObject({ id, version: 2, editedByUser: true, title: "Senior Engineer", extracted: { title: "Senior Engineer" }, rawText: body.pageText });
    jobFields(updated);
    await error(await patch(id), 409, "version_conflict", "This job changed elsewhere. Reload to see the latest.");
    expect(await store.repoFor("user-a").get(id)).toMatchObject({ version: 2, title: "Senior Engineer" });
  });

  it("validates patch content before saving", async () => {
    const id = await create();
    await store.admin.finish(id, extracted);
    await error(await patch(id, 1, { ...extracted, title: " " }), 400, "invalid_content");
    await error(await patch(id, 0), 400, "invalid_content");
    expect(await store.repoFor("user-a").get(id)).toMatchObject({ version: 1, editedByUser: false });
  });

  it("deletes a job and returns 404 afterwards", async () => {
    const id = await create();
    const res = await remove(id);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    await error(await get(id), 404, "not_found");
    await error(await remove(id), 404, "not_found");
    await error(await patch(id), 404, "not_found");
    expect(await (await get()).json()).toEqual({ items: [], nextCursor: null });
  });

  it("returns 404 for malformed ids", async () => {
    await error(await get("not-a-uuid"), 404, "not_found");
    await error(await patch("not-a-uuid"), 404, "not_found");
    await error(await remove("not-a-uuid"), 404, "not_found");
  });

  it("allows PATCH preflight from the app origin", async () => {
    const res = await app.request("/v1/jobs/x", {
      method: "OPTIONS", headers: { origin: ORIGIN, "Access-Control-Request-Method": "PATCH" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("access-control-allow-methods")?.split(",")).toContain("PATCH");
  });

  it.each(["POST", "GET", "PATCH", "DELETE"])("requires a token for %s", async (method) => {
    const path = method === "PATCH" || method === "DELETE" ? "/v1/jobs/x" : "/v1/jobs";
    await error(await app.request(path, { method }), 401, "unauthorized");
    expect(sent).toEqual([]);
  });
});

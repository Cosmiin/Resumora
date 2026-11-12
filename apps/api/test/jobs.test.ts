import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobExtraction, JobListPage, MatchScore } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { JOBS_PER_DAY, type JobMessage } from "../src/jobs/repo.ts";

import { memoryTailorRepo, type MemoryTailorStore } from "../src/tailor/memory-repo.ts";
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

describe("job endpoints", () => {
  it("returns the base score, null before scoring, and 404 for another user's job", async () => {
    const id = await create();
    const request = (jobId: string, token = "token-a") => app.request(`/v1/jobs/${jobId}/score`, { headers: { authorization: `Bearer ${token}` } });
    const empty = await request(id);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ base: null, tailored: null });
    await memoryTailorRepo("user-a", scores).saveScore(id, "base", null, score);
    await memoryTailorRepo("user-a", scores).saveScore(id, "tailored", "cv-a", score);
    const res = await request(id);
    expect(res.status).toBe(200);
    // Score 2 is the newest tailored score of any of the job's tailored CVs (Task 16, R13).
    expect(await res.json()).toEqual({ base: score, tailored: score });
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
    expect(body).toMatchObject({ base: { policy: "match/1" }, tailored: null });
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

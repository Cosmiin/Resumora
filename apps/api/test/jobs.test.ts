import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobExtraction } from "@resumora/shared";
import { createApp, type AppDeps } from "../src/app.ts";
import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { JOBS_PER_DAY, type JobMessage } from "../src/jobs/repo.ts";

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
  deps = {
    appOrigin: ORIGIN,
    verifyToken: async (token) => (USERS[token] ? { id: USERS[token], token } : null),
    cvRepo: () => { throw new Error("not used"); },
    importRepo: () => { throw new Error("not used"); },
    jobRepo: (user) => store.repoFor(user.id),
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
const patch = (id: string, version = 1, value: unknown = extracted) =>
  app.request(`/v1/jobs/${id}`, {
    method: "PATCH", headers: { authorization: "Bearer token-a", "content-type": "application/json" },
    body: JSON.stringify({ version, extracted: value }),
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
function publicFields(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(/"(rawText|raw_text|jsonLd|json_ld)"\s*:/);
}

describe("job endpoints", () => {
  it("creates a queued extension job and sends one message", async () => {
    const res = await post();
    expect(res.status).toBe(202);
    const result = (await res.json()) as { id: string };
    expect(result).toEqual({ id: expect.any(String) });
    expect(sent).toEqual([{ jobId: result.id, userId: "user-a" }]);
    expect(store.rows.get(result.id)).toMatchObject({ status: "queued", source: "extension", rawText: body.pageText, jsonLd: null });
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
    const list = (await res.json()) as { id: string }[];
    expect(list.map((item) => item.id)).toEqual([second, first]);
    publicFields(list);
    const detail = await get(first);
    expect(detail.status).toBe(200);
    const job = await detail.json();
    expect(job).toMatchObject({ id: first, version: 1, editedByUser: false });
    publicFields(job);
    await error(await get(other), 404, "not_found");
    await error(await patch(other), 404, "not_found");
    await error(await remove(other), 404, "not_found");
    expect(store.rows.has(other)).toBe(true);
  });

  it("rejects queued edits, saves ready edits, and rejects stale versions", async () => {
    const id = await create();
    await error(await patch(id), 409, "wrong_status", "This job can't be changed right now.");
    await store.admin.start(id);
    await store.admin.finish(id, extracted);
    const res = await patch(id, 1, { ...extracted, title: "Senior Engineer" });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated).toMatchObject({ id, version: 2, editedByUser: true, title: "Senior Engineer", extracted: { title: "Senior Engineer" } });
    publicFields(updated);
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
    expect(await (await get()).json()).toEqual([]);
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

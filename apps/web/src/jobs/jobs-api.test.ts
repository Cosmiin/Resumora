import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Job, JobExtraction, JobListItem } from "@resumora/shared";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../lib/supabase.ts", () => ({ supabase: { auth } }));

import { ApiClientError } from "../lib/api.ts";
import { createJob, deleteJob, getJob, listJobs, patchJob } from "./jobs-api.ts";

const extracted: JobExtraction = {
  title: "Engineer",
  company: "Example",
  location: null,
  workMode: "remote",
  employmentType: "full_time",
  seniority: "mid",
  salary: null,
  summary: "Build useful software.",
  responsibilities: ["Build web apps."],
  requirements: [{ text: "TypeScript", kind: "must", category: "skill" }],
  benefits: [],
  applyBy: null,
  isJobPosting: true,
};
const item: JobListItem = {
  id: "job-1",
  status: "ready",
  errorCode: null,
  title: "Engineer",
  company: "Example",
  location: null,
  source: "link",
  url: "https://example.com/jobs/1",
  createdAt: "2026-11-05T10:00:00Z",
};
const job: Job = {
  ...item,
  rawText: "The original job description.",
  extracted,
  editedByUser: false,
  version: 1,
  updatedAt: item.createdAt,
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } }, error: null });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("listJobs", () => {
  it.each([
    [undefined, "/v1/jobs?limit=50"],
    ["a b", "/v1/jobs?limit=50&cursor=a%20b"],
  ])("fetches the parsed page with cursor %s", async (cursor, path) => {
    const page = { items: [item], nextCursor: "next-page" };
    fetchMock.mockResolvedValue(json(200, { ...page, extra: "ignored" }));

    await expect(listJobs(cursor)).resolves.toEqual(page);

    expect(fetchMock).toHaveBeenCalledWith(path, expect.any(Object));
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method ?? "GET").toBe("GET");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer token-1");
  });
});

describe("getJob", () => {
  it("encodes the id and returns the parsed job", async () => {
    fetchMock.mockResolvedValue(json(200, { ...job, extra: "ignored" }));

    await expect(getJob("a/b ?")).resolves.toEqual(job);

    expect(fetchMock).toHaveBeenCalledWith("/v1/jobs/a%2Fb%20%3F", expect.any(Object));
  });
});

describe("createJob", () => {
  it.each([
    [202, { id: "job-1" }, false],
    [200, { id: "job-1", existing: true }, true],
  ])("normalizes the %i create response", async (status, body, existing) => {
    fetchMock.mockResolvedValue(json(status, body));
    const pageText = "Job description. ".repeat(20);

    await expect(createJob(item.url, pageText)).resolves.toEqual({ id: "job-1", existing });

    expect(fetchMock).toHaveBeenCalledWith("/v1/jobs", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ url: item.url, pageText }),
    }));
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });
});

describe("patchJob", () => {
  it("sends the version and extracted summary and returns the parsed job", async () => {
    const updated = { ...job, version: 2, editedByUser: true };
    fetchMock.mockResolvedValue(json(200, updated));

    await expect(patchJob("a/b ?", 1, extracted)).resolves.toEqual(updated);

    expect(fetchMock).toHaveBeenCalledWith("/v1/jobs/a%2Fb%20%3F", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ version: 1, extracted }),
    }));
  });

  it("preserves a version conflict as an ApiClientError", async () => {
    const body = { error: { code: "version_conflict", message: "Changed elsewhere", requestId: "r-1" } };
    fetchMock.mockResolvedValue(json(409, body));

    const error = await patchJob(job.id, 1, extracted).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 409, code: "version_conflict", body });
  });
});

describe("deleteJob", () => {
  it("resolves on 204 without reading a JSON body", async () => {
    const response = new Response(null, { status: 204 });
    const readJson = vi.spyOn(response, "json");
    fetchMock.mockResolvedValue(response);

    await expect(deleteJob("a/b ?")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith("/v1/jobs/a%2Fb%20%3F", expect.objectContaining({ method: "DELETE" }));
    expect(readJson).not.toHaveBeenCalled();
  });

  it("preserves a not_found response as an ApiClientError", async () => {
    const body = { error: { code: "not_found", message: "Job not found", requestId: "r-2" } };
    fetchMock.mockResolvedValue(json(404, body));

    const error = await deleteJob(job.id).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 404, code: "not_found", body });
  });

  it("reports an error when the server returns no JSON", async () => {
    fetchMock.mockResolvedValue(new Response("Unavailable", { status: 503 }));

    await expect(deleteJob(job.id)).rejects.toMatchObject({ status: 503, code: "http_503" });
  });
});

describe("response validation", () => {
  it.each([
    { name: "listJobs", call: () => listJobs(), body: { items: [item], nextCursor: 42 } },
    { name: "getJob", call: () => getJob(job.id), body: { ...job, version: 0 } },
    { name: "createJob", call: () => createJob(item.url, "Job text"), body: { id: 42 } },
    { name: "patchJob", call: () => patchJob(job.id, 1, extracted), body: { ...job, extracted: {} } },
  ])("rejects an invalid $name response", async ({ call, body }) => {
    fetchMock.mockResolvedValue(json(200, body));

    await expect(call()).rejects.toBeInstanceOf(z.ZodError);
  });
});

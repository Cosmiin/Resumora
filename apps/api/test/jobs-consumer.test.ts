import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type CvContent, type JobExtraction } from "@resumora/shared";
import type { ModelDeps } from "../src/ai/call-model.ts";
import worker, { dispatchBatch } from "../src/index.ts";
import type { Env } from "../src/env.ts";
import type { ImportMessage } from "../src/imports/repo.ts";
import { handleJobMessage } from "../src/jobs/consumer.ts";
import type { JobAdmin, JobMessage } from "../src/jobs/repo.ts";

import { memoryJobs } from "../src/jobs/memory-repo.ts";
import { memoryTailorAdmin, type MemoryTailorStore } from "../src/tailor/memory-repo.ts";

const extracted: JobExtraction = {
  title: "Engineer", company: null, location: null, workMode: "unknown",
  employmentType: "unknown", seniority: "unknown", salary: null,
  summary: "Build software.", responsibilities: [], requirements: [],
  benefits: [], applyBy: null, isJobPosting: true,
};
const work = { id: "job-a", userId: "user-a", rawText: "Private job page text", jsonLd: null };

function setup(answer = extracted) {
  const admin = {
    start: vi.fn<JobAdmin["start"]>().mockResolvedValue(work),
    finish: vi.fn<JobAdmin["finish"]>().mockResolvedValue(undefined),
    fail: vi.fn<JobAdmin["fail"]>().mockResolvedValue(undefined),
    logCall: vi.fn<JobAdmin["logCall"]>().mockResolvedValue(undefined),
  };
  const fetch = vi.fn<ModelDeps["fetch"]>().mockImplementation(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] })),
  );
  const model: ModelDeps = {
    providers: [{ name: "openrouter", url: "https://model.test/v1", apiKey: "k", model: "m" }],
    fetch, logCall: admin.logCall,
  };
  const baseCvs = new Map<string, CvContent>();
  const scores: MemoryTailorStore = new Map();
  return { admin, model, log: vi.fn(), fetch, baseCvs, scores, ...memoryTailorAdmin(baseCvs, scores) };
}

function message<T>(body: T, attempts = 1): Message<T> {
  return { id: "message-a", timestamp: new Date(), body, attempts, ack: vi.fn(), retry: vi.fn() };
}
const jobMessage = (attempts = 1) => message({ jobId: work.id, userId: work.userId }, attempts);

async function scoringSetup() {
  const job: JobExtraction = { ...extracted, requirements: [{ text: "TypeScript", kind: "must", category: "skill" }] };
  const deps = setup(job);
  const jobs = memoryJobs({});
  await jobs.repoFor(work.userId).create({
    id: work.id, source: "extension", url: "https://example.test/job", urlNormalized: "https://example.test/job",
    rawText: work.rawText, jsonLd: null,
  });
  const cv = emptyCv();
  cv.basics.summary = "Built TypeScript tools.";
  deps.baseCvs.set(work.userId, cv);
  const answer = {
    labels: [
      { ref: "r0", kind: "requirement", status: "met", evidence: cv.basics.summary, inferred: true },
      { ref: "k:TypeScript", kind: "keyword", status: "met", evidence: cv.basics.summary, inferred: true },
    ],
    cvSeniority: "unknown",
  };
  deps.fetch.mockImplementation(async () => {
    const value = deps.fetch.mock.calls.length === 1 ? job : answer;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
  });
  return { ...deps, admin: jobs.admin, jobs };
}

describe("job consumer", () => {
  it("saves one base score from the current CV after the job is ready", async () => {
    const deps = await scoringSetup();
    const msg = jobMessage();
    await handleJobMessage(deps, msg);
    expect(await deps.jobs.repoFor(work.userId).get(work.id)).toMatchObject({ status: "ready" });
    expect([...deps.scores.values()]).toEqual([expect.objectContaining({
      userId: work.userId, jobId: work.id, target: "base", tailoredCvId: null,
      score: expect.objectContaining({ total: 50, band: "fair", capped: false }),
    })]);
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("leaves the job ready and logs without private text when scoring fails", async () => {
    const deps = await scoringSetup();
    deps.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(extracted) } }] })));
    deps.fetch.mockRejectedValue(new Error(work.rawText));
    const msg = jobMessage(3);
    await handleJobMessage(deps, msg);
    expect(await deps.jobs.repoFor(work.userId).get(work.id)).toMatchObject({ status: "ready", errorCode: null });
    expect(deps.scores.size).toBe(0);
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ msg: "job score failed", jobId: work.id }));
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain(work.rawText);
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("does not score again when a second extraction finishes with a base score already saved", async () => {
    const deps = await scoringSetup();
    await handleJobMessage(deps, jobMessage());
    vi.spyOn(deps.admin, "start").mockResolvedValue(work);
    const cv = emptyCv();
    deps.baseCvs.set(work.userId, cv);
    deps.fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(extracted) } }] })));
    await handleJobMessage(deps, jobMessage());
    expect(deps.fetch).toHaveBeenCalledTimes(3);
    expect([...deps.scores.values()]).toEqual([expect.objectContaining({ score: expect.objectContaining({ total: 50 }) })]);
    expect(await deps.jobs.repoFor(work.userId).get(work.id)).toMatchObject({ status: "ready" });
  });

  it("skips scoring and logs when the user has no Base CV", async () => {
    const deps = await scoringSetup();
    deps.baseCv = async () => null;
    const msg = jobMessage();
    await handleJobMessage(deps, msg);
    expect(await deps.jobs.repoFor(work.userId).get(work.id)).toMatchObject({ status: "ready" });
    expect(deps.scores.size).toBe(0);
    expect(deps.fetch).toHaveBeenCalledOnce();
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ msg: "job score skipped: no base CV", jobId: work.id }));
    expect(msg.ack).toHaveBeenCalledOnce();
  });
  it("acks a finished or missing job without calling the model", async () => {
    const deps = setup();
    deps.admin.start.mockResolvedValue(null);
    const msg = jobMessage();
    await handleJobMessage(deps, msg);
    expect(deps.admin.start).toHaveBeenCalledWith(work.id);
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.admin.finish).not.toHaveBeenCalled();
    expect(deps.admin.fail).not.toHaveBeenCalled();
  });

  it("stores a successful extraction and acks", async () => {
    const deps = setup();
    const msg = jobMessage();
    await handleJobMessage(deps, msg);
    expect(deps.admin.finish).toHaveBeenCalledWith(work.id, extracted);
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
    expect(deps.admin.fail).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...extracted, isJobPosting: false }, "not_a_job"],
    [{ ...extracted, title: " " }, "ai_failed"],
  ] as const)("records a known extraction failure and acks: %s", async (answer, code) => {
    const deps = setup(answer);
    const msg = jobMessage();
    await handleJobMessage(deps, msg);
    expect(deps.admin.fail).toHaveBeenCalledWith(work.id, code);
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
    expect(deps.admin.finish).not.toHaveBeenCalled();
  });

  it("retries an unexpected error, then fails on attempt three without logging text", async () => {
    const deps = setup();
    deps.admin.finish.mockRejectedValue(new Error(work.rawText));
    const first = jobMessage();
    await handleJobMessage(deps, first);
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
    expect(first.ack).not.toHaveBeenCalled();
    expect(deps.admin.fail).not.toHaveBeenCalled();

    const third = jobMessage(3);
    await handleJobMessage(deps, third);
    expect(deps.admin.fail).toHaveBeenCalledWith(work.id, "ai_failed");
    expect(third.ack).toHaveBeenCalledOnce();
    expect(third.retry).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalled();
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain(work.rawText);
    expect(JSON.stringify(deps.admin.logCall.mock.calls)).not.toContain(work.rawText);
  });

  it("applies the retry limit when starting a job fails", async () => {
    const deps = setup();
    deps.admin.start.mockRejectedValue(new Error("database unavailable"));
    const first = jobMessage();
    await handleJobMessage(deps, first);
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
    const third = jobMessage(3);
    await handleJobMessage(deps, third);
    expect(deps.admin.fail).toHaveBeenCalledWith(work.id, "ai_failed");
    expect(third.ack).toHaveBeenCalledOnce();
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});

describe("queue dispatch", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("scores through the production queue using the database job owner and skips redelivery", async () => {
    const row = { id: work.id, user_id: work.userId, raw_text: work.rawText, json_ld: null, status: "queued", attempts: 0 };
    const cvReads: URL[] = [];
    const scoreReads: URL[] = [];
    const writes: Record<string, unknown>[] = [];
    let modelCalls = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const parsed = new URL(url);
      if (parsed.hostname === "openrouter.ai") {
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer model-key");
        const answer = modelCalls++ === 0 ? extracted : { labels: [], cvSeniority: "unknown" };
        return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
      }
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer service-key");
      switch (parsed.pathname) {
        case "/rest/v1/jobs":
          if (init.method === "PATCH") Object.assign(row, JSON.parse(String(init.body)));
          return Response.json(row);
        case "/rest/v1/base_cvs":
          cvReads.push(parsed);
          return Response.json({ content: emptyCv() });
        case "/rest/v1/match_scores":
          if (init.method === "POST") {
            writes.push(JSON.parse(String(init.body)));
            return new Response(null, { status: 201 });
          }
          scoreReads.push(parsed);
          return Response.json(writes.at(-1) ?? null);
        case "/rest/v1/ai_calls":
          return new Response(null, { status: 201 });
        default:
          throw new Error("Unexpected request");
      }
    }));
    const env: Env = {
      SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-key", SUPABASE_SERVICE_ROLE_KEY: "service-key",
      APP_ORIGIN: "https://app.example.test", OPENROUTER_API_KEY: "model-key", OPENROUTER_MODEL: "model",
      OPENAI_API_KEY: "", OPENAI_MODEL: "", IMPORTS: {} as Env["IMPORTS"], JOBS: {} as Env["JOBS"],
    };
    const msg = message({ jobId: work.id, userId: "different-user" });
    await worker.queue(batch("resumora-jobs", msg), env);
    expect(row.status).toBe("ready");
    expect(writes).toEqual([expect.objectContaining({
      user_id: work.userId, job_id: work.id, target: "base", tailored_cv_id: null, policy: "match/1", total: null,
    })]);
    expect(cvReads).toHaveLength(1);
    expect(cvReads[0]!.searchParams.get("user_id")).toBe(`eq.${work.userId}`);
    expect(scoreReads).toHaveLength(1);
    expect(Object.fromEntries(scoreReads[0]!.searchParams)).toMatchObject({
      user_id: `eq.${work.userId}`, job_id: `eq.${work.id}`, target: "eq.base", tailored_cv_id: "is.null",
    });
    expect(modelCalls).toBe(2);
    expect(msg.ack).toHaveBeenCalledOnce();
    await worker.queue(batch("resumora-jobs", msg), env);
    expect(writes).toHaveLength(1);
    expect(modelCalls).toBe(2);
  });

  function handlers() {
    return {
      jobs: vi.fn<(msg: Message<JobMessage>) => Promise<void>>().mockResolvedValue(undefined),
      imports: vi.fn<(msg: Message<ImportMessage>) => Promise<void>>().mockResolvedValue(undefined),
      log: vi.fn(),
    };
  }
  function batch(queue: string, msg: Message<JobMessage | ImportMessage>): MessageBatch<JobMessage | ImportMessage> {
    return {
      queue, messages: [msg], metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
      ackAll: vi.fn(), retryAll: vi.fn(),
    };
  }

  it("sends jobs only to the job handler", async () => {
    const deps = handlers();
    const msg = jobMessage();
    await dispatchBatch(deps, batch("resumora-jobs", msg));
    expect(deps.jobs).toHaveBeenCalledExactlyOnceWith(msg);
    expect(deps.imports).not.toHaveBeenCalled();
  });

  it("sends imports only to the import handler", async () => {
    const deps = handlers();
    const msg = message({ importId: "import-a", userId: "user-a" });
    await dispatchBatch(deps, batch("resumora-imports", msg));
    expect(deps.imports).toHaveBeenCalledExactlyOnceWith(msg);
    expect(deps.jobs).not.toHaveBeenCalled();
  });

  it("logs and acks an unknown queue without logging message bodies", async () => {
    const deps = handlers();
    const unknown = batch("other", jobMessage());
    await dispatchBatch(deps, unknown);
    expect(unknown.ackAll).toHaveBeenCalledOnce();
    expect(deps.jobs).not.toHaveBeenCalled();
    expect(deps.imports).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith({ msg: "unknown queue", queue: "other" });
  });
});

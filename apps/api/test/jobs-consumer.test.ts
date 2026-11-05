import { describe, expect, it, vi } from "vitest";
import type { JobExtraction } from "@resumora/shared";
import type { ModelDeps } from "../src/ai/call-model.ts";
import { dispatchBatch } from "../src/index.ts";
import type { ImportMessage } from "../src/imports/repo.ts";
import { handleJobMessage } from "../src/jobs/consumer.ts";
import type { JobAdmin, JobMessage } from "../src/jobs/repo.ts";

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
  return { admin, model, log: vi.fn(), fetch };
}

function message<T>(body: T, attempts = 1): Message<T> {
  return { id: "message-a", timestamp: new Date(), body, attempts, ack: vi.fn(), retry: vi.fn() };
}
const jobMessage = (attempts = 1) => message({ jobId: work.id, userId: work.userId }, attempts);

describe("job consumer", () => {
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

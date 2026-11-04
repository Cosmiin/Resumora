import { cvImportLimits } from "@resumora/contracts/intelligence/import-limits";
import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  processCvImport,
  importWorkerStore,
} from "../src/intelligence/import-processor.ts";
import { importWorkflow } from "../src/intelligence/import-workflow.ts";
import { configuredStructuredRunner } from "../src/intelligence/configured.ts";
import { SyntheticLedger } from "../fixtures/synthetic-ledger.ts";
const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic fixture"),
  hash = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString(
    "hex",
  );
const id = crypto.randomUUID(),
  op = crypto.randomUUID();
const record = {
  id,
  operationId: op,
  format: "pdf",
  state: "uploaded",
  sourceHash: hash,
  objectKey: "private/synthetic",
  expectedRevision: 0,
  review: null,
  error: null,
};
const document = {
  schemaVersion: "document-pages/1",
  format: "pdf",
  sha256: hash,
  parserVersion: "synthetic",
  pages: [{ number: 1, warnings: [] }],
  fileBase64: Buffer.from(bytes).toString("base64"),
  warnings: [],
};
const admission = { kind: "cv", reason: "Synthetic CV", pages: [1] };
const extraction = {
  schemaVersion: "cv-extraction/1",
  warnings: [],
  omittedPages: [],
  candidates: [
    {
      id: "name",
      path: "name",
      value: "Alex Morgan",
      quote: "Alex Morgan",
      page: 1,
      confidence: "high",
    },
  ],
};
const env = {
  AI_PAID_INFERENCE: "on",
  AI_WORKER_SECRET: "synthetic-worker-secret-not-real-32-bytes",
  AI_PROCESSING_POLICY: "synthetic",
  OPENROUTER_CV_EXTRACTION_MODEL: "synthetic-router",
  OPENAI_CV_EXTRACTION_MODEL: "synthetic-direct",
  OPENROUTER_API_KEY: "synthetic-router-key",
  OPENAI_API_KEY: "synthetic-direct-key",
  OPENROUTER_ENDPOINT: "synthetic",
};
function fixture() {
  let available = true;
  const finished = [],
    stages = [];
  return {
    finished,
    stages,
    store: {
      claim: async () => {
        if (!available) return null;
        available = false;
        return {
          lease: "synthetic-lease",
          userId: "synthetic-user",
          record,
          base64: Buffer.from(bytes).toString("base64"),
        };
      },
      finish: async (...args) => {
        finished.push(args);
        return { ...record, state: args[1], review: args[2], error: args[3] };
      },
      reserve: async () => ({ created: true }),
      ledger: () => {
        throw Error("not used");
      },
    },
    processor: async () => document,
    run: async (task) => {
      stages.push(task.stage);
      return task.stage === "admit" ? admission : extraction;
    },
  };
}
test("upload acknowledges durable queue before preflight or inference and HTTP replay does not enqueue twice", async () => {
  let begun = false,
    queued = 0,
    uploads = 0;
  const abort = new AbortController();
  let saved = record;
  const store = {
    begin: async () => {
      const created = !begun;
      begun = true;
      return { created, record: saved };
    },
    get: async () => saved,
    putObject: async () => {
      uploads++;
    },
    complete: async (_id, state) => (saved = { ...saved, state }),
    enqueue: async () => {
      queued++;
      abort.abort();
      return { ...saved, stage: "queued" };
    },
  };
  const workflow = importWorkflow({
    store,
    aiEnabled: true,
    userId: "synthetic-user",
    processor: async () => {
      throw Error("preflight before queue acknowledgement");
    },
    operations: {
      extract: async () => {
        throw Error("AI before queue acknowledgement");
      },
    },
  });
  const input = {
    operationId: op,
    format: "pdf",
    bytes,
    expectedRevision: 0,
    signal: abort.signal,
  };
  assert.equal((await workflow.start(input)).stage, "queued");
  assert.equal((await workflow.start(input)).state, "uploaded");
  assert.equal(uploads, 1);
  assert.equal(queued, 1);
});
test("worker completes an uploaded CV independently, preserving review source mapping and one claim", async () => {
  const f = fixture();
  assert.equal((await processCvImport(env, f)).processed, 1);
  assert.deepEqual(f.stages, ["admit", "extract"]);
  assert.equal(f.finished[0][1], "ready");
  assert.equal(f.finished[0][2].id, id);
  assert.deepEqual(
    f.finished[0][2].extraction.candidates.map(({ warning, ...fact }) => fact),
    extraction.candidates,
  );
  assert.match(f.finished[0][2].extraction.candidates[0].warning, /review/);
  assert.equal((await processCvImport(env, f)).processed, 0);
  assert.equal(f.finished.length, 1);
});
test("timed out work remains unknown and is not automatically retried", async () => {
  const f = fixture();
  f.run = async () => {
    throw Error("AI_TIMEOUT_UNKNOWN");
  };
  await processCvImport(env, f);
  assert.deepEqual(f.finished[0], [
    "synthetic-lease",
    "unknown",
    null,
    "AI_TIMEOUT_UNKNOWN",
  ]);
  await processCvImport(env, f);
  assert.equal(f.finished.length, 1);
});
test("stored bytes are hash-checked before processing or paid work", async () => {
  const f = fixture();
  f.store.claim = async () => ({
    lease: "synthetic-lease",
    userId: "synthetic-user",
    record: { ...record, sourceHash: "0".repeat(64) },
    base64: Buffer.from(bytes).toString("base64"),
  });
  await processCvImport(env, f);
  assert.deepEqual(f.finished[0], [
    "synthetic-lease",
    "failed",
    null,
    "SOURCE_MISMATCH",
  ]);
  assert.equal(f.stages.length, 0);
});
test("disabled inference does not claim queued uploads", async () => {
  const f = fixture();
  f.store.claim = async () => {
    throw Error("must not claim");
  };
  assert.equal(
    (await processCvImport({ ...env, AI_PAID_INFERENCE: "off" }, f)).processed,
    0,
  );
});
test("worker requests are limited to the configured Supabase API, with no browser tokens", async () => {
  const calls = [];
  const store = importWorkerStore(
    {
      ...env,
      SUPABASE_URL: "https://synthetic.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable",
    },
    async (url, init) => {
      calls.push({ url, init });
      return Response.json(null);
    },
  );
  assert.equal(await store.claim(), null);
  assert.equal(
    calls[0].url,
    "https://synthetic.supabase.co/rest/v1/rpc/claim_cv_import_task",
  );
  assert.equal(
    calls[0].init.headers.Authorization,
    "Bearer synthetic-publishable",
  );
  assert.throws(
    () =>
      importWorkerStore({
        ...env,
        SUPABASE_URL: "https://unexpected.example",
        SUPABASE_PUBLISHABLE_KEY: "synthetic",
      }),
    /AI_UNCONFIGURED/,
  );
});
const flush = async () => {
  for (let i = 0; i < 80; i++) await Promise.resolve();
};
test("40K extraction stays active beyond old limits and fallback has the remaining bounded budget", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const ledger = new SyntheticLedger(),
    durable = {
      durability: "durable",
      begin: (s) => ledger.begin(s),
      finish: (id, r) => ledger.finish(id, r),
    };
  const calls = [];
  let finishFallback;
  const run = configuredStructuredRunner(
    env,
    "synthetic-user",
    durable,
    new AbortController().signal,
    async (url, init) => {
      calls.push(url);
      if (calls.length === 1) return new Promise(() => {});
      return new Promise(
        (resolve) =>
          (finishFallback = () =>
            resolve(
              Response.json({
                id: "synthetic-response",
                model: "synthetic-direct",
                choices: [
                  {
                    finish_reason: "stop",
                    message: { content: JSON.stringify(extraction) },
                  },
                ],
              }),
            )),
      );
    },
  );
  const pending = run({
    operationId: crypto.randomUUID(),
    userId: "synthetic-user",
    operation: "cv_parse",
    tier: "extraction",
    promptVersion: "cv.extract.synthetic",
    system: "Synthetic task",
    input: {},
    schema: { type: "object", properties: {} },
    fileFormat: "pdf",
    fileBase64: document.fileBase64,
    maxOutputTokens: cvImportLimits.outputTokens,
  });
  await flush();
  assert.equal(calls.length, 1);
  t.mock.timers.tick(31000);
  await flush();
  assert.equal(
    calls.length,
    1,
    "primary must remain active beyond the old 30-second cap",
  );
  t.mock.timers.tick(cvImportLimits.extractionAttemptMs - 31000);
  await flush();
  assert.equal(
    calls.length,
    2,
    "fallback should start only after the enlarged primary cap",
  );
  t.mock.timers.tick(24000);
  await flush();
  finishFallback();
  assert.deepEqual(await pending, extraction);
  t.mock.timers.reset();
});

for (const state of ["processing", "ready"])
  test(`lost enqueue acknowledgement preserves the worker's ${state} result`, async () => {
    let saved = { ...record },
      writes = [];
    const store = {
      begin: async () => ({ created: true, record: saved }),
      get: async () => saved,
      putObject: async () => {},
      complete: async (_id, next) => {
        writes.push(next);
        return (saved = { ...saved, state: next });
      },
      enqueue: async () => {
        saved = {
          ...saved,
          state,
          ...(state === "processing"
            ? { stage: "extracting" }
            : { review: { id } }),
        };
        throw Error("Lost queue acknowledgement");
      },
    };
    const workflow = importWorkflow({
      store,
      aiEnabled: true,
      userId: "synthetic-user",
      processor: async () => {
        throw Error("Inline preflight forbidden");
      },
      operations: {},
    });
    const result = await workflow.start({
      operationId: op,
      format: "pdf",
      bytes,
      expectedRevision: 0,
      signal: new AbortController().signal,
    });
    assert.equal(result.state, state);
    assert.deepEqual(writes, ["uploaded"]);
    if (state === "ready") assert.deepEqual(result.review, { id });
  });

for (const cleanupFails of [false, true])
  test(`restart resolves a source URL to its operation and preserves the cancellation fence (cleanup fails=${cleanupFails})`, async () => {
    const calls = [];
    const store = {
      get: async (key) => {
        assert.equal(key, id);
        return record;
      },
      cancel: async (key) => {
        calls.push(["cancel", key]);
        return { ...record, state: "cancelled" };
      },
      deleteObject: async (key) => {
        calls.push(["delete", key]);
        if (cleanupFails) throw Error("Synthetic storage outage");
      },
      ackPurge: async (key) => {
        calls.push(["ack", key]);
      },
    };
    const workflow = importWorkflow({
      store,
      operations: {},
      aiEnabled: true,
      userId: "synthetic-user",
      processor: async () => document,
    });
    assert.equal((await workflow.cancel(id)).state, "cancelled");
    assert.deepEqual(calls[0], ["cancel", op]);
    assert.deepEqual(calls[1], ["delete", record.objectKey]);
    if (cleanupFails) assert.equal(calls.length, 2);
    else assert.deepEqual(calls[2], ["ack", op]);
  });

test("worker timing distinguishes preflight and durable review acknowledgement without content", async () => {
  const f = fixture(),
    events = [];
  let acknowledge;
  f.timing = { emit: (event) => events.push(event) };
  const finish = f.store.finish;
  f.store.finish = async (...args) => {
    await new Promise((resolve) => {
      acknowledge = resolve;
    });
    return finish(...args);
  };
  const pending = processCvImport(env, f);
  while (!acknowledge) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(
    events.some((e) => e.phase === "preflight" && e.edge === "complete"),
  );
  assert.ok(
    events.some((e) => e.phase === "review_publication" && e.edge === "start"),
  );
  assert.equal(
    events.some(
      (e) => e.phase === "review_publication" && e.edge === "complete",
    ),
    false,
  );
  acknowledge();
  await pending;
  assert.ok(
    events.some(
      (e) => e.phase === "review_publication" && e.edge === "complete",
    ),
  );
  assert.ok(events.every((e) => e.domain === "server" && e.operationId === op));
  assert.equal(events.find((e) => e.phase === "queue_claim").durationMs, null);
  assert.doesNotMatch(
    JSON.stringify(events),
    /Alex|Morgan|synthetic-lease|synthetic-user|sourceHash|base64/,
  );
});

test("failed publication never emits a completed review timing", async () => {
  const f = fixture(),
    events = [];
  f.timing = { emit: (event) => events.push(event) };
  f.store.finish = async (_lease, state) => {
    if (state === "ready") throw Error("lost publication ack");
  };
  await processCvImport(env, f);
  assert.ok(
    events.some(
      (e) => e.phase === "review_publication" && e.edge === "unknown",
    ),
  );
  assert.equal(
    events.some(
      (e) => e.phase === "review_publication" && e.edge === "complete",
    ),
    false,
  );
});

test("intake without a queue fails before storage and never falls back to inline processing", async () => {
  let writes = 0,
    processed = 0;
  const workflow = importWorkflow({
    store: {
      begin: async () => {
        writes++;
        return { created: true, record };
      },
      putObject: async () => {
        writes++;
      },
      complete: async () => record,
      get: async () => record,
    },
    processor: async () => {
      processed++;
      return document;
    },
    operations: { extract: async () => ({ admission, extraction }) },
    aiEnabled: true,
    userId: "synthetic-user",
  });
  await assert.rejects(
    workflow.start({
      operationId: op,
      format: "pdf",
      bytes,
      expectedRevision: 0,
      signal: new AbortController().signal,
    }),
    /IMPORT_QUEUE_UNAVAILABLE/,
  );
  assert.equal(writes, 0);
  assert.equal(processed, 0);
});

test("upload timing requires acknowledgement and lost enqueue without a visible queue retains the original", async () => {
  const events = [],
    writes = [];
  let saved = { ...record },
    begun = false;
  const store = {
    begin: async () => {
      const created = !begun;
      begun = true;
      return { created, record: saved };
    },
    putObject: async () => {
      writes.push("original");
    },
    complete: async (_id, state) => {
      writes.push(state);
      return (saved = { ...saved, state });
    },
    enqueue: async () => {
      throw Error("lost queue ack");
    },
    get: async () => saved,
  };
  const workflow = importWorkflow({
    store,
    timing: { emit: (e) => events.push(e) },
  });
  const input = {
    operationId: op,
    format: "pdf",
    bytes,
    expectedRevision: 0,
    signal: new AbortController().signal,
  };
  const result = await workflow.start(input);
  assert.equal(result.state, "uploaded");
  assert.equal(result.error, "QUEUE_OUTCOME_UNKNOWN");
  assert.deepEqual(writes, ["original", "uploaded"]);
  assert.ok(
    events.some(
      (e) => e.phase === "upload_acknowledgement" && e.edge === "complete",
    ),
  );
  assert.ok(
    events.some(
      (e) => e.phase === "queue_acknowledgement" && e.edge === "unknown",
    ),
  );
  assert.equal(
    events.some(
      (e) => e.phase === "queue_acknowledgement" && e.edge === "complete",
    ),
    false,
  );
  await workflow.start(input);
  assert.deepEqual(writes, ["original", "uploaded"]);
});

test("cancelled or expired publication returning a null receipt cannot emit durable completion", async () => {
  const f = fixture(),
    events = [];
  f.timing = { emit: (e) => events.push(e) };
  f.store.finish = async () => null;
  await processCvImport(env, f);
  assert.equal(
    events.some(
      (e) => e.phase === "review_publication" && e.edge === "complete",
    ),
    false,
  );
  assert.ok(
    events.some(
      (e) => e.phase === "review_publication" && e.edge === "unknown",
    ),
  );
});

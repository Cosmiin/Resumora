import test from "node:test";
import assert from "node:assert/strict";
import { createImportTiming } from "@resumora/contracts/intelligence/import-timing";
import { configuredStructuredRunner } from "../src/intelligence/configured.ts";
import { SyntheticLedger } from "../fixtures/synthetic-ledger.ts";
const flush = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};
const env = {
  AI_PAID_INFERENCE: "on",
  AI_WORKER_SECRET: "synthetic-secret-00000000000000000",
  AI_PROCESSING_POLICY: "synthetic",
  OPENAI_API_KEY: "never-sent-real-key",
  OPENAI_CV_ADMISSION_MODEL: "synthetic",
  OPENROUTER_API_KEY: "synthetic",
  OPENROUTER_CV_ADMISSION_MODEL: "synthetic",
  OPENROUTER_ENDPOINT: "synthetic",
};
function fixture(emit) {
  let now = 0;
  const timing = createImportTiming("server", "parent", {
    emit,
    now: () => now,
  });
  const ledger = new SyntheticLedger();
  return {
    timing,
    tick: (n) => {
      now += n;
    },
    ledger: {
      durability: "durable",
      begin: (s) => ledger.begin(s),
      finish: (id, r) => ledger.finish(id, r),
    },
    task: {
      operationId: "stage-op",
      importId: "source",
      userId: "private-user",
      stage: "admit",
      operation: "cv_parse",
      tier: "admission",
      promptVersion: "synthetic",
      system: "private-prompt",
      fileFormat: "docx",
      input: {},
      schema: {},
      maxOutputTokens: 300,
      validateOutput: (v) => v,
    },
  };
}
test("synthetic clock isolates reservation, full response body, validation and settlement", async () => {
  const events = [],
    f = fixture((e) => events.push(e));
  let body, settle;
  const originalFinish = f.ledger.finish;
  f.ledger.finish = async (...args) => {
    await new Promise((resolve) => {
      settle = resolve;
    });
    return originalFinish(...args);
  };
  const originalBegin = f.ledger.begin;
  f.ledger.begin = async (s) => {
    f.tick(7);
    return originalBegin(s);
  };
  f.task.validateOutput = (v) => {
    f.tick(3);
    return v;
  };
  const run = configuredStructuredRunner(
    env,
    "private-user",
    f.ledger,
    new AbortController().signal,
    async () => {
      f.tick(11);
      return new Response(
        new ReadableStream({
          start(controller) {
            body = controller;
          },
        }),
      );
    },
    async () => {
      f.tick(5);
      return { created: true };
    },
    undefined,
    f.timing,
  );
  const pending = run(f.task);
  await flush();
  assert.equal(
    events.some(
      (e) => e.phase === "provider_round_trip" && e.edge === "complete",
    ),
    false,
  );
  f.tick(13);
  body.enqueue(
    new TextEncoder().encode(
      JSON.stringify({
        id: "response",
        model: "synthetic",
        status: "completed",
        output: [
          {
            content: [{ type: "output_text", text: '{"private-output":true}' }],
          },
        ],
      }),
    ),
  );
  body.close();
  await flush();
  assert.equal(
    events.find(
      (e) => e.phase === "provider_round_trip" && e.edge === "complete",
    ).durationMs,
    24,
  );
  assert.equal(
    events.some(
      (e) => e.phase === "attempt_settlement" && e.edge === "complete",
    ),
    false,
  );
  f.tick(17);
  settle();
  assert.deepEqual(await pending, { "private-output": true });
  const durations = Object.fromEntries(
    events
      .filter((e) => e.edge === "complete")
      .map((e) => [e.phase, e.durationMs]),
  );
  assert.deepEqual(durations, {
    stage_reservation: 5,
    attempt_reservation: 7,
    provider_round_trip: 24,
    validation: 3,
    attempt_settlement: 17,
  });
  assert.doesNotMatch(
    JSON.stringify(events),
    /private-|never-sent|source|model|prompt|output/,
  );
  assert.ok(
    events.every(
      (e) => e.operationId === "parent" && e.stageOperationId === "stage-op",
    ),
  );
});
test("a failed attempt settlement cannot return validated output or trigger fallback", async () => {
  const events = [],
    f = fixture((e) => events.push(e));
  f.ledger.finish = async () => {
    throw Error("lost settlement");
  };
  let calls = 0;
  const run = configuredStructuredRunner(
    env,
    "private-user",
    f.ledger,
    new AbortController().signal,
    async () => {
      calls++;
      return Response.json({
        id: "response",
        model: "synthetic",
        status: "completed",
        output: [{ content: [{ type: "output_text", text: "{}" }] }],
      });
    },
    async () => ({ created: true }),
    undefined,
    f.timing,
  );
  await assert.rejects(run(f.task), /lost settlement/);
  assert.equal(calls, 1);
  assert.equal(
    events.some(
      (e) => e.phase === "attempt_settlement" && e.edge === "complete",
    ),
    false,
  );
  assert.ok(
    events.some(
      (e) => e.phase === "attempt_settlement" && e.edge === "unknown",
    ),
  );
});
test("timing sinks and clocks cannot fail or delay processing, and events are bounded", async () => {
  for (const emit of [
    () => {
      throw Error("sink");
    },
    async () => {
      throw Error("sink");
    },
    () => new Promise(() => {}),
  ]) {
    const f = fixture(emit);
    const run = configuredStructuredRunner(
      env,
      "private-user",
      f.ledger,
      new AbortController().signal,
      async () =>
        Response.json({
          id: "response",
          model: "synthetic",
          status: "completed",
          output: [{ content: [{ type: "output_text", text: "{}" }] }],
        }),
      async () => ({ created: true }),
      undefined,
      f.timing,
    );
    assert.deepEqual(await run(f.task), {});
  }
  const events = [],
    timing = createImportTiming("server", "parent", {
      emit: (e) => events.push(e),
      now: () => {
        throw Error("clock");
      },
    });
  for (let i = 0; i < 100; i++) timing.span("preflight")();
  assert.equal(events.length, 64);
  assert.ok(events.every((e) => e.durationMs === null));
});
test("an unfinished span has no invented zero or completion duration", () => {
  const events = [],
    timing = createImportTiming("server", "parent", {
      emit: (e) => events.push(e),
    });
  timing.span("preflight");
  assert.equal(events.length, 1);
  assert.equal(events[0].edge, "start");
  assert.equal(events[0].durationMs, null);
});

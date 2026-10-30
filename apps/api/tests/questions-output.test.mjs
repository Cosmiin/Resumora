import test from "node:test";
import assert from "node:assert/strict";
import { blankDraft, newRole, fact } from "@resumora/contracts/editor/model";
import { encodeDraft } from "@resumora/contracts/editor/transport";
import { configuredStructuredRunner } from "../src/intelligence/configured.ts";
import { intelligenceOperations } from "../src/intelligence/operations.ts";
import { intelligenceRoute } from "../src/intelligence/routes.ts";
import { SyntheticLedger } from "../fixtures/synthetic-ledger.ts";
const env = {
  AI_PAID_INFERENCE: "on",
  AI_PROCESSING_POLICY: "synthetic",
  AI_WORKER_SECRET: "synthetic-worker-secret-at-least-32",
  OPENROUTER_MODEL: "synthetic/model",
  OPENROUTER_ENDPOINT: "synthetic",
  OPENROUTER_API_KEY: "synthetic-router",
  OPENAI_MODEL: "synthetic-direct",
  OPENAI_API_KEY: "synthetic-key",
};
function fixture() {
  const draft = blankDraft(),
    role = newRole();
  role.title = fact("Analyst");
  role.context = fact("Prepared weekly reports");
  draft.roles = [role];
  return {
    draft,
    targetId: role.id,
    operationId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
  };
}
for (const mode of ["length", "invalid", "complete"])
  test(
    "questions output " +
      mode +
      " uses generous bounded budget, no automatic retry",
    async () => {
      const input = fixture(),
        ledger = new SyntheticLedger(),
        durable = {
          durability: "durable",
          begin: (s) => ledger.begin(s),
          finish: (id, r) => ledger.finish(id, r),
          report: (p) => ledger.report(p),
        };
      const plan = {
        schemaVersion: "career-question-plan/1",
        targetId: input.targetId,
        questions: Array.from({ length: 3 }, (_, i) => ({
          id: "q" + i,
          dimension: "ownership",
          text: "What was your contribution? ".repeat(30),
          why: "Clarify this responsibility. ".repeat(30),
          selectionMode: "multiple",
          options: Array.from({ length: 6 }, (_, j) => ({
            id: "o" + j,
            label: ("Possible contribution " + j + " ").repeat(15),
          })),
        })),
      };
      assert.ok(JSON.stringify(plan).length > 8000);
      assert.ok(Buffer.byteLength(JSON.stringify(plan)) < 262144);
      let calls = 0;
      const run = configuredStructuredRunner(
        env,
        input.userId,
        durable,
        new AbortController().signal,
        async (_url, init) => {
          calls++;
          const body = JSON.parse(init.body);
          assert.equal(body.max_completion_tokens, 16000);
          return Response.json({
            id: "synthetic-response",
            model: "synthetic/model",
            provider: "synthetic",
            usage: {
              prompt_tokens: 10,
              completion_tokens: mode === "complete" ? 4000 : 1800,
              total_tokens: mode === "complete" ? 4010 : 1810,
              prompt_tokens_details: { cached_tokens: 0 },
              completion_tokens_details: { reasoning_tokens: 0 },
              cost: 0.001,
            },
            choices: [
              {
                finish_reason: mode === "length" ? "length" : "stop",
                message: {
                  content: mode === "invalid" ? "{}" : JSON.stringify(plan),
                },
              },
            ],
          });
        },
      );
      const ops = intelligenceOperations(run);
      if (mode === "complete")
        assert.equal((await ops.questions(input)).questions.length, 3);
      else
        await assert.rejects(
          ops.questions(input),
          new RegExp(
            mode === "length" ? "AI_OUTPUT_TRUNCATED" : "AI_OUTPUT_INVALID",
          ),
        );
      assert.equal(calls, 1);
      const today = new Date().toISOString().slice(0, 10),
        usage = await ledger.report({ from: today, to: today });
      assert.equal(usage.totals.attempts, 1);
    },
  );
for (const code of ["AI_OUTPUT_TRUNCATED", "AI_OUTPUT_INVALID"])
  test("route preserves " + code + " and stale fencing", async () => {
    const input = fixture(),
      id = crypto.randomUUID(),
      snapshot = { id, revision: 1, payload: encodeDraft(input.draft) };
    let calls = 0,
      stale = false,
      reservations = 0;
    const request = () =>
      new Request("https://app.invalid/v1/intelligence/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          snapshotId: id,
          revision: 1,
          targetId: input.targetId,
          operationId: input.operationId,
        }),
      });
    const options = {
      enabled: true,
      userId: input.userId,
      signal: new AbortController().signal,
      operations: {
        questions: async () => {
          calls++;
          throw Error(code);
        },
      },
      gateway: {
        loadSnapshot: async () => snapshot,
        loadDraft: async () => (stale ? { id: crypto.randomUUID() } : snapshot),
        reserveCareer: async () => {
          reservations++;
          return true;
        },
      },
    };
    let response = await intelligenceRoute(request(), options);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, code);
    stale = true;
    response = await intelligenceRoute(request(), options);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "STALE_INPUT");
    assert.equal(calls, 1);
    assert.equal(reservations, 1);
  });

test("questions-only ceiling rejects overflow and leaves other task ceilings unchanged", async () => {
  const input = fixture(),
    ledger = new SyntheticLedger();
  let calls = 0;
  const durable = {
    durability: "durable",
    begin: (s) => ledger.begin(s),
    finish: (id, r) => ledger.finish(id, r),
    report: (p) => ledger.report(p),
  };
  const run = configuredStructuredRunner(
    env,
    input.userId,
    durable,
    new AbortController().signal,
    async () => {
      calls++;
      throw Error("UNEXPECTED_TRANSPORT");
    },
  );
  const task = {
    operationId: input.operationId,
    userId: input.userId,
    operation: "cv_rewrite",
    promptVersion: "career.questions.v3-complete",
    tier: "career",
    system: "Synthetic",
    input: {},
    schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    maxOutputTokens: 16001,
  };
  await assert.rejects(run(task), /INVALID_CONTEXT/);
  await assert.rejects(
    run({ ...task, promptVersion: "career.rewrite.v2", maxOutputTokens: 8001 }),
    /INVALID_CONTEXT/,
  );
  await assert.rejects(
    run({ ...task, operation: "cv_parse", maxOutputTokens: 16000 }),
    /INVALID_CONTEXT/,
  );
  assert.equal(calls, 0);
});

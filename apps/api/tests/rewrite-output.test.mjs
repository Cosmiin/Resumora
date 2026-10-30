import test from "node:test";
import assert from "node:assert/strict";
import { blankDraft, newRole, fact } from "@resumora/contracts/editor/model";
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
for (const [mode, code] of [
  ["length", "AI_OUTPUT_TRUNCATED"],
  ["invalid", "AI_OUTPUT_INVALID"],
  ["rejected", "AI_PROVIDER_REJECTED"],
  ["timeout", "AI_TIMEOUT_UNKNOWN"],
])
  test(
    "configured experience " + mode + " retains distinct safe outcome",
    async () => {
      const draft = blankDraft(),
        role = newRole();
      role.context = fact("Prepared reports.");
      draft.roles = [role];
      const operationId = crypto.randomUUID(),
        userId = crypto.randomUUID(),
        ledger = new SyntheticLedger(),
        durable = {
          durability: "durable",
          begin: (s) => ledger.begin(s),
          finish: (id, r) => ledger.finish(id, r),
          report: (p) => ledger.report(p),
        };
      let calls = 0;
      const transport = async (_url, init) => {
        calls++;
        assert.equal(JSON.parse(init.body).max_completion_tokens, 1800);
        if (mode === "timeout") return new Promise(() => {});
        return Response.json(
          {
            id: "synthetic-response",
            model: "synthetic/model",
            provider: "synthetic",
            usage: {
              prompt_tokens: 10,
              completion_tokens: 1800,
              total_tokens: 1810,
              prompt_tokens_details: { cached_tokens: 0 },
              completion_tokens_details: { reasoning_tokens: 0 },
              cost: 0.001,
            },
            choices: [
              {
                finish_reason: mode === "length" ? "length" : "stop",
                message: { content: "{}" },
              },
            ],
          },
          { status: mode === "rejected" ? 429 : 200 },
        );
      };
      const original = setTimeout;
      if (mode === "timeout")
        globalThis.setTimeout = (fn, ms, ...rest) =>
          original(fn, ms === 25000 ? 5 : ms, ...rest);
      try {
        const ops = intelligenceOperations(
          configuredStructuredRunner(
            env,
            userId,
            durable,
            new AbortController().signal,
            transport,
          ),
        );
        await assert.rejects(
          ops.rewrite({ operationId, userId, draft, targetId: role.id }),
          new RegExp(code),
        );
        assert.equal(
          calls,
          mode === "timeout" ? 2 : 1,
          "existing bounded fallback policy only, no added retries",
        );
      } finally {
        globalThis.setTimeout = original;
      }
    },
  );
for (const [code, status] of [
  ["AI_TIMEOUT_UNKNOWN", 504],
  ["AI_REQUEST_UNKNOWN", 503],
  ["AI_PROVIDER_REJECTED", 502],
  ["REWRITE_OUTPUT", 502],
])
  test("rewrite route exposes safe " + code + " without content", async () => {
    const id = crypto.randomUUID(),
      draft = blankDraft(),
      role = newRole();
    role.context = fact("Prepared reports.");
    draft.roles = [role];
    const { encodeDraft } =
      await import("@resumora/contracts/editor/transport");
    const snapshot = { id, revision: 1, payload: encodeDraft(draft) };
    const request = new Request("https://app.invalid/v1/intelligence/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        snapshotId: id,
        revision: 1,
        targetId: role.id,
        operationId: crypto.randomUUID(),
      }),
    });
    const response = await intelligenceRoute(request, {
      enabled: true,
      userId: id,
      gateway: {
        loadSnapshot: async () => snapshot,
        loadDraft: async () => snapshot,
        reserveCareer: async () => true,
      },
      operations: {
        rewrite: async () => {
          throw Error(code);
        },
      },
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code } });
    assert.match(response.headers.get("cache-control"), /private, no-store/);
  });

test('missing ledger result is uncertain rather than a definite validation failure', async()=>{
 const draft=blankDraft(),role=newRole();role.context=fact('Prepared reports.');draft.roles=[role];const ledger=new SyntheticLedger();
 const durable={durability:'durable',begin:s=>ledger.begin(s),finish:async(id,r)=>({...await ledger.finish(id,r),result:null}),report:p=>ledger.report(p)};
 const transport=async()=>Response.json({id:'synthetic-response',model:'synthetic/model',provider:'synthetic',usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20,prompt_tokens_details:{cached_tokens:0},completion_tokens_details:{reasoning_tokens:0},cost:0.001},choices:[{finish_reason:'stop',message:{content:'{}'}}]});
 const userId=crypto.randomUUID();
 const ops=intelligenceOperations(configuredStructuredRunner(env,userId,durable,new AbortController().signal,transport));
 await assert.rejects(ops.rewrite({operationId:crypto.randomUUID(),userId,draft,targetId:role.id}),/AI_REQUEST_UNKNOWN/);
});

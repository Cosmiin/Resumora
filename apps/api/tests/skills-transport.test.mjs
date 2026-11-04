import test from "node:test";
import assert from "node:assert/strict";
import { blankDraft, newRole, fact } from "@resumora/contracts/editor/model";
import { encodeDraft } from "@resumora/contracts/editor/transport";
import { experienceFingerprint } from "@resumora/contracts/intelligence/experience";
import { configuredIntelligenceRoute } from "../src/intelligence/configured.ts";
import { SyntheticLedger } from "../fixtures/synthetic-ledger.ts";
test("skills use the complete provider schema and budget on both routes and survive the ordinary experience deadline", async () => {
  const d = blankDraft(),
    r = newRole();
  r.context = fact("Used SQL to validate imported records.");
  d.roles = [r];
  const snapshot = {
      id: crypto.randomUUID(),
      revision: 1,
      payload: encodeDraft(d),
    },
    ledger = new SyntheticLedger(),
    receipts = new Map();
  const gateway = {
    loadSnapshot: async () => snapshot,
    loadDraft: async () => snapshot,
    createImportStore: () => ({}),
    reserveEnhancement: async () => ({ created: true }),
    beginAttempt: (s) => ledger.begin(s),
    finishAttempt: (id, result) => ledger.finish(id, result),
    getWorkspaceOperation: async (id) => receipts.get(id),
    beginWorkspaceOperation: async (id, kind, input) => {
      receipts.set(id, { id, kind, input, state: "processing" });
      return { created: true };
    },
    finishWorkspaceOperation: async (id, state, result) =>
      receipts.set(id, { ...receipts.get(id), state, result }),
  };
  const env = {
    AI_PAID_INFERENCE: "on",
    AI_WORKER_SECRET: "synthetic-not-real-worker-secret-12345",
    AI_PROCESSING_POLICY: "synthetic-policy",
    OPENROUTER_API_KEY: "synthetic",
    OPENAI_API_KEY: "synthetic",
    OPENROUTER_MODEL: "synthetic/router",
    OPENAI_MODEL: "synthetic-direct",
    OPENROUTER_ENDPOINT: "synthetic-endpoint",
  };
  const original = AbortSignal.timeout,
    network = globalThis.fetch,
    timers = [];
  AbortSignal.timeout = (ms) => {
    const c = new AbortController();
    timers.push({ ms, c });
    return c.signal;
  };
  globalThis.fetch = () => {
    throw Error("REAL_NETWORK_FORBIDDEN");
  };
  try {
    const sent = [];
    const transport = async (url, init) => {
      const body = JSON.parse(init.body);
      sent.push(body);
      timers.filter((t) => t.ms === 25000).forEach((t) => t.c.abort());
      assert.equal(
        init.signal.aborted,
        false,
        "skills must not inherit the old 25-second deadline",
      );
      assert.equal(body.max_completion_tokens, 12000);
      assert.equal(body.response_format.json_schema.strict, true);
      assert.equal(
        body.response_format.json_schema.schema.properties.skills.maxItems,
        60,
      );
      const input = JSON.parse(body.messages[1].content);
      assert.equal(input.facts[0].text, r.context.value);
      if (String(url).includes("openrouter"))
        return Response.json({}, { status: 503 });
      return Response.json({
        id: "synthetic-response",
        model: body.model,
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                skills: [
                  {
                    label: "SQL",
                    category: "technicalSkills",
                    importance: "core",
                  },
                ],
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
        },
      });
    };
    const body = {
      operationId: crypto.randomUUID(),
      snapshotId: snapshot.id,
      revision: 1,
      targetId: r.id,
      experience: {
        intent: "skills",
        fingerprint: await experienceFingerprint(d, r.id),
      },
    };
    const response = await configuredIntelligenceRoute(
      new Request("https://synthetic.invalid/v1/intelligence/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
      gateway,
      "synthetic-owner",
      transport,
    );
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.skills[0].label, "SQL");
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[0].messages, sent[1].messages);
    assert.equal(receipts.get(body.operationId).state, "ready");
  } finally {
    AbortSignal.timeout = original;
    globalThis.fetch = network;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { configuredIntelligenceRoute } from "../src/intelligence/configured.ts";
import { SyntheticLedger } from "../fixtures/synthetic-ledger.ts";
import { blankDraft, newRole, fact } from "@resumora/contracts/editor/model";
import { encodeDraft } from "@resumora/contracts/editor/transport";
import { pdfFixture } from "./fixtures/pdf.mjs";
import { docx, doc } from "./fixtures/word.mjs";
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("REAL_NETWORK_DENIED");
};
test.after(() => {
  globalThis.fetch = originalFetch;
});
const env = {
  AI_PAID_INFERENCE: "on",
  AI_WORKER_SECRET: "synthetic-worker-secret-not-real-32-bytes",
  AI_PROCESSING_POLICY: "synthetic-policy",
  OPENROUTER_API_KEY: "synthetic-router",
  OPENAI_API_KEY: "synthetic-direct",
  OPENROUTER_ENDPOINT: "synthetic",
  OPENROUTER_MODEL: "router-career",
  OPENAI_MODEL: "direct-career",
  OPENROUTER_CV_ADMISSION_MODEL: "router-small",
  OPENROUTER_CV_EXTRACTION_MODEL: "router-strong",
  OPENAI_CV_ADMISSION_MODEL: "direct-small",
  OPENAI_CV_EXTRACTION_MODEL: "direct-strong",
};
function setup() {
  const rows = new Map(),
    reservations = new Set(),
    ledger = new SyntheticLedger(),
    user = crypto.randomUUID(),
    draft = blankDraft(),
    role = newRole();
  role.context = fact("Prepare weekly Excel reports.");
  draft.roles.push(role);
  const snapshot = {
    id: crypto.randomUUID(),
    revision: 1,
    payload: encodeDraft(draft),
  };
  let uploads = 0;
  const store = {
    begin: async (i) => {
      if (rows.has(i.operationId))
        return { created: false, record: rows.get(i.operationId) };
      const row = {
        id: crypto.randomUUID(),
        operationId: i.operationId,
        format: i.format,
        sourceHash: i.sourceHash,
        expectedRevision: i.expectedRevision,
        state: "uploading",
        objectKey: "private/opaque",
        review: null,
        error: null,
      };
      rows.set(i.operationId, row);
      return { created: true, record: row };
    },
    get: async (op) => {
      if (!rows.has(op)) throw Object.assign(new Error(), { status: 404 });
      return structuredClone(rows.get(op));
    },
    list: async () => [...rows.values()],
    expired: async () => [],
    ackPurge: async () => {},
    putObject: async () => {
      uploads++;
    },
    deleteObject: async () => {},
    complete: async (op, state, review, error) => {
      const row = rows.get(op);
      if (row.state === "cancelled")
        throw Object.assign(new Error(), { status: 409 });
      Object.assign(row, { state, review, error });
      return structuredClone(row);
    },
    cancel: async (op) => {
      const row = rows.get(op);
      Object.assign(row, { state: "cancelled", review: null });
      return structuredClone(row);
    },
  };
  const gateway = {
    createImportStore: () => store,
    reserveDocumentOperation: async ({ operationId }) => {
      const created = !reservations.has(operationId);
      reservations.add(operationId);
      return { created };
    },
    beginAttempt: (...args) => ledger.begin(...args),
    finishAttempt: (...args) => ledger.finish(...args),
    loadSnapshot: async (id) => (id === snapshot.id ? snapshot : null),
    loadDraft: async () => snapshot,
    reserveEnhancement: async ({ operationId }) => {
      const created = !reservations.has(operationId);
      reservations.add(operationId);
      return { created };
    },
  };
  return {
    rows,
    reservations,
    ledger,
    user,
    draft,
    role,
    snapshot,
    gateway,
    uploads: () => uploads,
  };
}
function upload(format, bytes, operationId = crypto.randomUUID()) {
  return new Request("https://resumora.invalid/v1/intelligence/imports", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Document-Format": format,
      "X-Operation-Id": operationId,
      "X-Expected-Revision": "0",
    },
    body: bytes,
  });
}
function reply(body, data, word) {
  return Response.json(
    word
      ? {
          id: "response-" + crypto.randomUUID(),
          model: body.model,
          status: "completed",
          usage: { input_tokens: 20, output_tokens: 20, total_tokens: 40 },
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(data) }],
            },
          ],
        }
      : {
          id: "response-" + crypto.randomUUID(),
          model: body.model,
          usage: { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 },
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(data) },
            },
          ],
        },
  );
}
test("configured PDF import uses native file primary, admission before extraction, persistent unconfirmed result and no paid replay", async () => {
  const f = setup(),
    calls = [],
    operationId = crypto.randomUUID();
  const transport = async (url, init) => {
    const b = JSON.parse(init.body);
    calls.push({ url, b });
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(b.plugins[0].pdf.engine, "native");
    assert.ok(
      b.messages[1].content
        .find((p) => p.type === "file")
        .file.file_data.startsWith("data:application/pdf;base64,"),
    );
    return reply(
      b,
      b.model.endsWith("small")
        ? { kind: "cv", reason: "Career history", pages: [1] }
        : {
            schemaVersion: "cv-extraction/1",
            candidates: [
              {
                id: "name",
                path: "name",
                value: "Mara Ionescu",
                page: 1,
                quote: "Mara Ionescu",
                confidence: "medium",
                warning: "",
              },
            ],
            warnings: [],
            omittedPages: [],
          },
      false,
    );
  };
  const first = await configuredIntelligenceRoute(
    upload("pdf", pdfFixture(), operationId),
    env,
    f.gateway,
    f.user,
    transport,
  );
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.equal(result.state, "ready");
  assert.deepEqual(result.review.confirmedIds, []);
  assert.equal(result.review.pages, 1);
  assert.match(result.review.extraction.candidates[0].warning, /review/);
  const repeated = await configuredIntelligenceRoute(
    upload("pdf", pdfFixture(), operationId),
    env,
    f.gateway,
    f.user,
    transport,
  );
  assert.equal((await repeated.json()).state, "ready");
  assert.equal(calls.length, 2);
  assert.equal(f.uploads(), 1);
  const usage = await f.ledger.report({ from: "2000-01-01", to: "2099-01-01" });
  assert.equal(usage.totals.attempts, 2);
  assert.equal(usage.totals.unknownCost, 2);
  assert.ok(
    usage.recent.every(
      (a) => !a.requestFingerprint.includes(result.review.sourceHash),
    ),
  );
});
test("DOC and DOCX native reading uses only documented OpenAI Responses, bounded output and unknown original pages", async () => {
  for (const [format, bytes] of [
    ["doc", doc()],
    ["docx", docx()],
  ]) {
    const f = setup(),
      calls = [];
    const transport = async (url, init) => {
      const b = JSON.parse(init.body);
      calls.push({ url, b });
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(init.headers.Authorization, "Bearer synthetic-direct");
      assert.equal(b.store, false);
      const file = b.input[1].content.find((p) => p.type === "input_file");
      assert.equal(file.filename, "upload." + format);
      assert.ok(file.file_data.includes(";base64,"));
      assert.ok(b.max_output_tokens <= 8000);
      return reply(
        b,
        b.model.endsWith("small")
          ? { kind: "cv", reason: "Career history", pages: [] }
          : {
              schemaVersion: "cv-extraction/1",
              candidates: [
                {
                  id: "name",
                  path: "name",
                  value: "Mara Ionescu",
                  page: null,
                  quote: "Mara Ionescu",
                  confidence: "medium",
                  warning: "",
                },
              ],
              warnings: [],
              omittedPages: [],
            },
        true,
      );
    };
    const response = await configuredIntelligenceRoute(
        upload(format, bytes),
        env,
        f.gateway,
        f.user,
        transport,
      ),
      result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.state, "ready");
    assert.equal(result.review.pages, null);
    assert.equal(result.review.extraction.candidates[0].page, null);
    assert.equal(calls.length, 2);
  }
});
test("non-CV and invalid input never dispatch stronger extraction; ambient keys do not enable OFF", async () => {
  const f = setup();
  let calls = 0;
  const transport = async (url, init) => {
    calls++;
    return reply(
      JSON.parse(init.body),
      { kind: "not_cv", reason: "Invoice", pages: [1] },
      false,
    );
  };
  const result = await (
    await configuredIntelligenceRoute(
      upload("pdf", pdfFixture()),
      env,
      f.gateway,
      f.user,
      transport,
    )
  ).json();
  assert.equal(result.state, "not_cv");
  assert.equal(calls, 1);
  const denied = await (
    await configuredIntelligenceRoute(
      upload("pdf", pdfFixture(Array(11).fill(null))),
      env,
      setup().gateway,
      f.user,
      transport,
    )
  ).json();
  assert.equal(denied.state, "failed");
  assert.equal(denied.error, "DOCUMENT_PAGES");
  assert.equal(calls, 1);
  const off = await configuredIntelligenceRoute(
    upload("pdf", pdfFixture()),
    { ...env, AI_PAID_INFERENCE: "off" },
    {},
    f.user,
    () => {
      assert.fail("OFF network");
    },
  );
  assert.equal(off.status, 503);
  assert.equal((await off.json()).error.code, "AI_DISABLED");
});
test("owned saved context drives choices and semantic whole-role proposals; foreign/stale targets and unsupported metrics fail closed", async () => {
  const f = setup();
  let calls = 0;
  const request = (body, path = "questions") =>
    new Request("https://resumora.invalid/v1/intelligence/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const body = {
    operationId: crypto.randomUUID(),
    snapshotId: f.snapshot.id,
    revision: 1,
    targetId: f.role.id,
    goal: "ownership",
  };
  const transport = async (url, init) => {
    calls++;
    const b = JSON.parse(init.body);
    const payload = JSON.parse(b.messages[1].content);
    const data = b.response_format.json_schema.schema.properties.questions
      ? {
          schemaVersion: "career-question-plan/1",
          targetId: f.role.id,
          questions: [
            {
              id: "q",
              dimension: "ownership",
              text: "Which part did you do?",
              why: "Individual work is missing",
              selectionMode: "multiple",
              options: [
                { id: "merge", label: "Consolidated reports" },
                { id: "review", label: "Reviewed reports" },
              ],
            },
          ],
        }
      : {
          schemaVersion: "career-role-rewrite/1",
          targetId: f.role.id,
          text: "I prepared the weekly reports in Excel.",
          factIds: [f.role.context.id],
          warnings: [],
        };
    assert.equal(payload.targetId, f.role.id);
    return reply(b, data, false);
  };
  const plan = await (
    await configuredIntelligenceRoute(
      request(body),
      env,
      f.gateway,
      f.user,
      transport,
    )
  ).json();
  assert.equal(plan.questions[0].selectionMode, "multiple");
  assert.equal(plan.questions[0].id, body.operationId + "_0");
  assert.equal(plan.questions[0].options[0].selected, undefined);
  assert.equal(
    (
      await configuredIntelligenceRoute(
        request(body),
        env,
        f.gateway,
        f.user,
        transport,
      )
    ).status,
    409,
  );
  assert.equal(calls, 1);
  assert.equal(
    (
      await configuredIntelligenceRoute(
        request({
          ...body,
          operationId: crypto.randomUUID(),
          snapshotId: crypto.randomUUID(),
        }),
        env,
        f.gateway,
        f.user,
        transport,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await configuredIntelligenceRoute(
        request({ ...body, operationId: crypto.randomUUID(), revision: 2 }),
        env,
        f.gateway,
        f.user,
        transport,
      )
    ).status,
    404,
  );
  const rewrite = await (
    await configuredIntelligenceRoute(
      request({ ...body, operationId: crypto.randomUUID() }, "rewrite"),
      env,
      f.gateway,
      f.user,
      transport,
    )
  ).json();
  assert.match(rewrite.text, /weekly/);
  assert.equal(f.draft.roles[0].context.value, "Prepare weekly Excel reports.");
  const bad = await configuredIntelligenceRoute(
    request({ ...body, operationId: crypto.randomUUID() }, "rewrite"),
    env,
    f.gateway,
    f.user,
    async (url, init) =>
      reply(
        JSON.parse(init.body),
        {
          schemaVersion: "career-role-rewrite/1",
          targetId: f.role.id,
          text: "Reduced cost by 99%.",
          factIds: [f.role.context.id],
          warnings: [],
        },
        false,
      ),
  );
  assert.equal(bad.status, 503);
  assert.equal(f.draft.presentation.approvedWording, undefined);
});

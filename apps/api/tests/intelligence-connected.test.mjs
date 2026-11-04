import { processCvImport } from "../src/intelligence/import-processor.ts";
import { cvImportLimits } from "@resumora/contracts/intelligence/import-limits";
import test from "node:test";
import assert from "node:assert/strict";
import { enhancementRoute } from "../src/ai/routes.ts";
import { configuredIntelligenceRoute } from "../src/intelligence/configured.ts";
import { SyntheticLedger } from "../fixtures/synthetic-ledger.ts";
import { blankDraft, newRole, fact } from "@resumora/contracts/editor/model";
import { encodeDraft } from "@resumora/contracts/editor/transport";
import { pdfFixture } from "./fixtures/pdf.mjs";
import { docx, doc } from "./fixtures/word.mjs";
import { strToU8 } from "fflate";
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
  const queue = [];
  const store = {
    enqueue: async (op, bytes) => {
      queue.push({ operationId: op, bytes });
      const row = rows.get(op);
      row.stage = "queued";
      return structuredClone(row);
    },
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
    // Exercise intake acknowledgement and worker processing as separate executions.
    processUpload: async (request, config, transport) => {
      const response = await configuredIntelligenceRoute(
        request,
        config,
        gateway,
        user,
        () => assert.fail("intake cannot dispatch a provider"),
      );
      if (response.status !== 200) return response;
      const receipt = await response.clone().json();
      if (receipt.state !== "uploaded") return response;
      assert.equal(receipt.stage, "queued");
      await processCvImport(config, {
        transport,
        store: {
          claim: async () => {
            const queued = queue.shift();
            if (!queued) return null;
            const row = rows.get(queued.operationId);
            row.state = "processing";
            return {
              lease: row.operationId,
              userId: user,
              record: structuredClone(row),
              base64: Buffer.from(queued.bytes).toString("base64"),
            };
          },
          finish: (lease, state, review, error) =>
            store.complete(lease, state, review, error),
          reserve: (_lease, input) => gateway.reserveDocumentOperation(input),
          ledger: () => ({
            durability: "durable",
            begin: (s) => ledger.begin(s),
            finish: (id, r) => ledger.finish(id, r),
          }),
        },
      });
      return configuredIntelligenceRoute(
        new Request(
          `https://resumora.invalid/v1/intelligence/imports/${receipt.id}`,
        ),
        config,
        gateway,
        user,
        transport,
      );
    },
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
  const first = await f.processUpload(
    upload("pdf", pdfFixture(), operationId),
    env,
    transport,
  );
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.equal(result.state, "ready");
  assert.deepEqual(result.review.confirmedIds, []);
  assert.equal(result.review.pages, 1);
  assert.match(result.review.extraction.candidates[0].warning, /review/);
  const repeated = await f.processUpload(
    upload("pdf", pdfFixture(), operationId),
    env,
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
    ["docx", docx(`<![CDATA[${"x".repeat(40000)}]]>`)],
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
      assert.equal(
        file.file_data.split(";base64,")[1],
        Buffer.from(bytes).toString("base64"),
      );
      assert.equal(
        b.max_output_tokens,
        b.model.endsWith("small") ? 300 : cvImportLimits.outputTokens,
      );
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
    const response = await f.processUpload(
        upload(format, bytes),
        env,
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
test("oversized DOCX CDATA fails preflight without admission or extraction attempts", async () => {
  for (const bytes of [
    docx(`<![CDATA[${"x".repeat(100000)}]]>`),
    docx("x".repeat(20000), {
      "word/header1.xml": strToU8(
        `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t><![CDATA[${"x".repeat(20001)}]]></w:t></w:r></w:p></w:hdr>`,
      ),
    }),
  ]) {
    const f = setup();
    const response = await f.processUpload(upload("docx", bytes), env, () =>
      assert.fail("Oversized text must not reach a provider"),
    );
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.state, "failed");
    assert.equal(result.error, "DOCUMENT_TEXT_LIMIT");
    assert.equal(f.reservations.size, 0);
    const report = await f.ledger.report({
      from: "2000-01-01",
      to: "2099-01-01",
    });
    assert.equal(report.totals.attempts, 0);
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
    await f.processUpload(upload("pdf", pdfFixture()), env, transport)
  ).json();
  assert.equal(result.state, "not_cv");
  assert.equal(calls, 1);
  const deniedFixture = setup();
  const denied = await (
    await deniedFixture.processUpload(
      upload("pdf", pdfFixture(Array(11).fill(null))),
      env,
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
  };
  const transport = async (url, init) => {
    calls++;
    const b = JSON.parse(init.body);
    const payload = JSON.parse(b.messages[1].content);
    const data = b.response_format.json_schema.schema.properties.questions
      ? {
          schemaVersion: "career-question-plan/1",
          targetId: f.role.id,
          goal: "Ignored historical metadata in provider output",
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
    assert.equal(Object.hasOwn(payload, "goal"), false);
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
  assert.equal(Object.hasOwn(plan, "goal"), false);
  assert.equal(
    (
      await configuredIntelligenceRoute(
        request({ ...body, operationId: crypto.randomUUID(), goal: "removed" }),
        env,
        f.gateway,
        f.user,
        transport,
      )
    ).status,
    400,
  );
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
  assert.equal(bad.status, 502);
  assert.equal(f.draft.presentation.approvedWording, undefined);
});

for (const effort of [undefined, "none", "low"]) {
  for (const format of ["pdf", "docx", "doc"]) {
    test(`server effort ${effort ?? "omitted"} binds both ${format} stages and eligible fallback without changing guards`, async () => {
      const f = setup(),
        configured = {
          ...env,
          ...(effort === undefined ? {} : { AI_REASONING_EFFORT: effort }),
        },
        calls = [];
      const word = format !== "pdf";
      const transport = async (url, init) => {
        const body = JSON.parse(init.body);
        calls.push({ url, body });
        configured.AI_REASONING_EFFORT = effort === "none" ? "low" : "none";
        const router = url.includes("openrouter");
        if (effort === undefined) {
          assert.equal(Object.hasOwn(body, "reasoning"), false);
          assert.equal(Object.hasOwn(body, "reasoning_effort"), false);
        } else if (router || word) {
          assert.deepEqual(body.reasoning, { effort });
          assert.equal(Object.hasOwn(body, "reasoning_effort"), false);
        } else {
          assert.equal(body.reasoning_effort, effort);
          assert.equal(Object.hasOwn(body, "reasoning"), false);
        }
        assert.equal(body.store, false);
        assert.equal(body.stream, false);
        assert.equal(init.redirect, "manual");
        assert.ok(init.signal);
        const admission = body.model.endsWith("small");
        assert.equal(
          body[word ? "max_output_tokens" : "max_completion_tokens"],
          admission ? 300 : cvImportLimits.outputTokens,
        );
        if (router) {
          assert.deepEqual(body.provider, {
            only: [env.OPENROUTER_ENDPOINT],
            allow_fallbacks: false,
            require_parameters: true,
            data_collection: "deny",
            zdr: true,
          });
          assert.equal(body.plugins[0].pdf.engine, "native");
          return Response.json({}, { status: 503 });
        }
        assert.equal(
          url,
          word
            ? "https://api.openai.com/v1/responses"
            : "https://api.openai.com/v1/chat/completions",
        );
        return reply(
          body,
          admission
            ? { kind: "cv", reason: "Synthetic career", pages: word ? [] : [1] }
            : {
                schemaVersion: "cv-extraction/1",
                candidates: [
                  {
                    id: "name",
                    path: "name",
                    value: "Mara Ionescu",
                    quote: "Mara Ionescu",
                    page: word ? null : 1,
                    confidence: "high",
                    warning: "",
                  },
                ],
                warnings: [],
                omittedPages: [],
              },
          word,
        );
      };
      const operationId = crypto.randomUUID(),
        bytes =
          format === "pdf" ? pdfFixture() : format === "docx" ? docx() : doc();
      const request = () => upload(format, bytes, operationId);
      const response = await f.processUpload(request(), configured, transport);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).state, "ready");
      assert.equal(calls.length, word ? 2 : 4);
      const report = await f.ledger.report({
        from: "2000-01-01",
        to: "2099-01-01",
      });
      assert.equal(report.totals.attempts, calls.length);
      assert.equal(report.totals.unknownCost, calls.length);
      for (const attempt of report.recent) {
        const fp = JSON.parse(attempt.requestFingerprint);
        assert.equal(fp.length, effort === undefined ? 5 : 6);
        assert.equal(fp[3], "ro");
        if (effort !== undefined)
          assert.deepEqual(fp[5], { reasoningEffort: effort });
        assert.equal(
          attempt.requestFingerprint.includes("Mara Ionescu"),
          false,
        );
      }
      const before = calls.length;
      assert.equal(
        (
          await configuredIntelligenceRoute(
            request(),
            configured,
            f.gateway,
            f.user,
            transport,
          )
        ).status,
        200,
      );
      assert.equal(calls.length, before);
    });
  }
}

test("invalid effort fails before storage, reservations or network; clients cannot override server effort", async () => {
  for (const effort of [
    "",
    "NONE",
    " low",
    "false",
    false,
    null,
    "ultra",
    {},
  ]) {
    const response = await configuredIntelligenceRoute(
      upload("pdf", pdfFixture()),
      { ...env, AI_REASONING_EFFORT: effort },
      {},
      crypto.randomUUID(),
      () => assert.fail("No provider dispatch"),
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "AI_UNCONFIGURED");
  }
  const f = setup();
  const req = new Request(
    "https://resumora.invalid/v1/intelligence/questions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationId: crypto.randomUUID(),
        snapshotId: f.snapshot.id,
        revision: 1,
        targetId: f.role.id,
        reasoningEffort: "high",
      }),
    },
  );
  const denied = await configuredIntelligenceRoute(
    req,
    { ...env, AI_REASONING_EFFORT: "low" },
    f.gateway,
    f.user,
    () => assert.fail("No client effort override"),
  );
  assert.equal(denied.status, 400);
  assert.equal(f.reservations.size, 0);
  const saved = await configuredIntelligenceRoute(
    new Request("https://resumora.invalid/v1/intelligence/imports"),
    { ...env, AI_REASONING_EFFORT: "invalid" },
    f.gateway,
    f.user,
    () => assert.fail("No inference for reads"),
  );
  assert.equal(saved.status, 200);
});

for (const kind of ["questions", "rewrite"]) {
  test(`career ${kind} uses configured low effort and the existing task-specific token cap`, async () => {
    const f = setup();
    const req = new Request(
      `https://resumora.invalid/v1/intelligence/${kind}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          snapshotId: f.snapshot.id,
          revision: 1,
          targetId: f.role.id,
        }),
      },
    );
    const response = await configuredIntelligenceRoute(
      req,
      { ...env, AI_REASONING_EFFORT: "low" },
      f.gateway,
      f.user,
      async (_url, init) => {
        const b = JSON.parse(init.body);
        assert.deepEqual(b.reasoning, { effort: "low" });
        assert.equal(
          b.max_completion_tokens,
          kind === "questions" ? 16000 : 1800,
        );
        const data =
          kind === "rewrite"
            ? {
                schemaVersion: "career-role-rewrite/1",
                targetId: f.role.id,
                text: "Prepared weekly Excel reports.",
                factIds: [f.role.context.id],
                warnings: [],
              }
            : {
                schemaVersion: "career-question-plan/1",
                targetId: f.role.id,
                questions: [
                  {
                    id: "q",
                    dimension: "ownership",
                    text: "Which work did you do?",
                    why: "Clarify ownership",
                    selectionMode: "single",
                    options: [{ id: "a", label: "Consolidated reports" }],
                  },
                ],
              };
        return reply(b, data, false);
      },
    );
    assert.equal(response.status, 200);
  });
}

test("existing enhancement endpoint validates server effort before reservation and preserves client isolation", async () => {
  for (const effort of [undefined, "none", "low", "invalid"]) {
    const f = setup();
    const req = (extra = {}) =>
      new Request("https://resumora.invalid/v1/enhancement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          snapshotId: f.snapshot.id,
          snapshotRevision: 1,
          targetId: f.role.id,
          ...extra,
        }),
      });
    let calls = 0;
    const response = await enhancementRoute(
      req(),
      {
        ...env,
        ...(effort === undefined ? {} : { AI_REASONING_EFFORT: effort }),
      },
      f.gateway,
      f.user,
      async (_url, init) => {
        calls++;
        const b = JSON.parse(init.body);
        if (effort === undefined)
          assert.equal(Object.hasOwn(b, "reasoning"), false);
        else assert.deepEqual(b.reasoning, { effort });
        return reply(
          b,
          {
            text: "Prepare weekly Excel reports.",
            factIds: [f.role.context.id],
          },
          false,
        );
      },
    );
    assert.equal(response.status, effort === "invalid" ? 503 : 200);
    assert.equal(calls, effort === "invalid" ? 0 : 1);
    assert.equal(f.reservations.size, effort === "invalid" ? 0 : 1);
    if (effort !== "invalid") {
      assert.equal(
        (
          await enhancementRoute(
            req({ reasoningEffort: "high" }),
            env,
            f.gateway,
            f.user,
            () => assert.fail("No override"),
          )
        ).status,
        400,
      );
    }
  }
});

test("point assistant reserves every provider stage against the owned snapshot and replays the parent receipt", async () => {
  const f = setup(),
    receipts = new Map(),
    attempts = [],
    calls = [];
  const begin = f.gateway.beginAttempt;
  f.gateway.beginAttempt = async (start) => {
    assert.ok(
      f.reservations.has(start.operationId),
      "child stage must be reserved before provider ledger begin",
    );
    attempts.push(start);
    return begin(start);
  };
  f.gateway.getWorkspaceOperation = async (id) => receipts.get(id);
  f.gateway.beginWorkspaceOperation = async (id, kind, input) => {
    receipts.set(id, { id, kind, input, state: "processing" });
    return { created: true };
  };
  f.gateway.finishWorkspaceOperation = async (id, state, result) =>
    receipts.set(id, { ...receipts.get(id), state, result });
  const { experienceFingerprint, experiencePoints, experienceText } =
    await import("@resumora/contracts/intelligence/experience");
  const body = {
    operationId: crypto.randomUUID(),
    snapshotId: f.snapshot.id,
    revision: 1,
    targetId: f.role.id,
    experience: {
      intent: "point",
      fingerprint: await experienceFingerprint(f.draft, f.role.id),
      point: experiencePoints(experienceText(f.draft, f.role.id))[0],
    },
  };
  const transport = async (url, init) => {
    const b = JSON.parse(init.body);
    calls.push(b);
    const content = JSON.parse(b.messages[1].content);
    const value = b.response_format.json_schema.schema.properties.dimensions
      ? {
          dimensions: ["contribution", "methods", "scope", "outcome"].map(
            (dimension, i) => ({
              dimension,
              grade: i < 2 ? "specific" : "missing",
              evidenceIds: i < 2 ? [content.passages[0].id] : [],
            }),
          ),
        }
      : {
          text: "Prepare weekly Excel reports.",
          explanation: "Keeps the method clear.",
          factIds: [content.facts[0].id],
        };
    return reply(b, value, false);
  };
  const post = () =>
    configuredIntelligenceRoute(
      new Request("https://app.invalid/v1/intelligence/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
      f.gateway,
      f.user,
      transport,
    );
  const response = await post();
  assert.equal(
    response.status,
    200,
    JSON.stringify(await response.clone().json()),
  );
  const result = await response.json();
  assert.equal(result.intent, "point");
  assert.equal(result.assessment, undefined);
  assert.equal(result.proposedAssessment, undefined);
  assert.equal(calls.length, 1);
  assert.equal(attempts.length, 1);
  assert.equal(f.reservations.size, 2);
  assert.equal((await post()).status, 200);
  assert.equal(calls.length, 1);
});

function experienceFixture(){
 const f=setup(),receipts=new Map();
 f.gateway.getWorkspaceOperation=async id=>receipts.get(id);
 f.gateway.beginWorkspaceOperation=async(id,kind,input)=>{if(receipts.has(id))return{created:false};receipts.set(id,{id,kind,input,state:'processing'});return{created:true};};
 f.gateway.finishWorkspaceOperation=async(id,state,result)=>{const prev=receipts.get(id);if(prev.state==='ready')return prev;const row={...prev,state,result};receipts.set(id,row);return row;};
 return{...f,receipts};
}
async function experienceBody(f,intent='point'){
 const{experienceFingerprint,experiencePoints,experienceText}=await import('@resumora/contracts/intelligence/experience');
 return{snapshotId:f.snapshot.id,revision:1,targetId:f.role.id,operationId:crypto.randomUUID(),experience:{intent,fingerprint:await experienceFingerprint(f.draft,f.role.id),...(intent==='point'?{point:experiencePoints(experienceText(f.draft,f.role.id))[0]}:{})}};
}
function experiencePost(f,body,transport,signal,execution){
 return configuredIntelligenceRoute(new Request('https://app.invalid/v1/intelligence/experience',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal}),env,f.gateway,f.user,transport,execution);
}
function validExperiencePoint(b){const context=JSON.parse(b.messages[1].content);return{text:'Prepared weekly Excel reports.',explanation:'Makes your contribution clearer.',factIds:[context.facts[0].id]};}
test('score uses source references through the configured provider and replays the grounded receipt without inference',async()=>{
 const f=experienceFixture();f.role.context=fact('Am verificat fluxurile „end-to-end” pentru 5–6 echipe.\nAm folosit SQL și Excel.');f.snapshot.payload=encodeDraft(f.draft);let calls=0;
 const body=await experienceBody(f,'score');
 const transport=async(_url,init)=>{calls++;const b=JSON.parse(init.body),context=JSON.parse(b.messages[1].content);assert.equal(context.facts,undefined);assert.equal(context.text,undefined);const ids=context.points.map(p=>p.id);assert.deepEqual(b.response_format.json_schema.schema.properties.dimensions.items.properties.evidencePointIds.items.enum,ids);assert.equal(context.passages,undefined);assert.equal(context.points[0].start,undefined);return reply(b,{experience:null,dimensions:['contribution','methods','scope','outcome'].map((dimension,i)=>({dimension,grade:i<3?'specific':'missing',evidencePointIds:i<3?[ids[0]]:[]})),points:context.points.map(p=>({id:p.id,meaningful:true,contribution:'specific',clarity:'specific',specificity:'partial',issue:'scope',duplicateOf:null,strength:'Descrie activitatea și instrumentele folosite.',improvement:'Clarifică publicul activității.',suggestedQuestion:'Pentru cine pregăteai aceste verificări?'}))},false);};
 const response=await experiencePost(f,body,transport);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const result=await response.json();assert.equal(result.assessment.score,85);assert.equal(result.assessment.dimensions[0].evidence[0],f.role.context.value);assert.equal(f.receipts.get(body.operationId).state,'ready');assert.equal(calls,1);assert.equal(f.ledger.attempts.size,1);
 const replay=await experiencePost(f,body,transport);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),result);assert.equal(calls,1);
});
test('reported regression: an invalid advisory score is a definite failure and cannot discard a successful point',async()=>{
 const f=experienceFixture();let calls=0;
 const transport=async(_url,init)=>{calls++;const b=JSON.parse(init.body);return reply(b,b.response_format.json_schema.schema.properties.dimensions?{dimensions:['contribution','methods','scope','outcome'].map(dimension=>({dimension,grade:'specific',evidenceIds:['foreign-passage']}))}:validExperiencePoint(b),false);};
 const point=await experienceBody(f),response=await experiencePost(f,point,transport);assert.equal(response.status,200);assert.equal(calls,1);const valid=await response.json();assert.equal(valid.text,'Prepared weekly Excel reports.');
 const score=await experienceBody(f,'score'),failed=await experiencePost(f,score,transport);assert.equal(failed.status,502);assert.equal((await failed.json()).error.code,'AI_OUTPUT_INVALID');assert.equal(f.receipts.get(score.operationId).state,'failed');assert.equal(f.receipts.get(point.operationId).state,'ready');assert.deepEqual(f.receipts.get(point.operationId).result,valid);assert.equal(calls,2);
});
test('a disconnected browser does not cancel paid completion or lose its recovery receipt',async()=>{
 const f=experienceFixture(),body=await experienceBody(f),controller=new AbortController(),background=[];let calls=0;
 const response=await experiencePost(f,body,async(_url,init)=>{calls++;controller.abort();return reply(JSON.parse(init.body),validExperiencePoint(JSON.parse(init.body)),false);},controller.signal,{waitUntil:p=>background.push(p)});
 assert.equal(response.status,200);await Promise.all(background);assert.equal(f.receipts.get(body.operationId).state,'ready');assert.equal(calls,1);assert.ok(background.length);
});
test('lost receipt acknowledgement recovers the stored result without another AI request',async()=>{
 const f=experienceFixture(),body=await experienceBody(f),finish=f.gateway.finishWorkspaceOperation;let writes=0,calls=0;
 f.gateway.finishWorkspaceOperation=async(...args)=>{await finish(...args);if(++writes===1)throw Error('lost acknowledgement');};
 const response=await experiencePost(f,body,async(_url,init)=>{calls++;const b=JSON.parse(init.body);return reply(b,validExperiencePoint(b),false);});
 assert.equal(response.status,200);assert.equal(writes,1);assert.equal(calls,1);assert.equal(f.receipts.get(body.operationId).state,'ready');
});
test('a receipt storage outage still delivers an already validated point for draft saving',async()=>{
 const f=experienceFixture(),body=await experienceBody(f);let calls=0;
 f.gateway.finishWorkspaceOperation=async()=>{throw Error('temporary database outage');};
 const response=await experiencePost(f,body,async(_url,init)=>{calls++;const b=JSON.parse(init.body);return reply(b,validExperiencePoint(b),false);});
 assert.equal(response.status,200);assert.equal(response.headers.get('X-Result-Receipt'),'pending');assert.equal((await response.json()).text,'Prepared weekly Excel reports.');assert.equal(calls,1);
});
test('metadata-only autosaves do not reject unchanged owned input; changed role wording stays stale',async()=>{
 const f=experienceFixture(),body=await experienceBody(f);f.gateway.loadDraft=async()=>({...f.snapshot,id:crypto.randomUUID(),revision:2});let calls=0;
 const transport=async(_url,init)=>{calls++;const b=JSON.parse(init.body);return reply(b,validExperiencePoint(b),false);};
 assert.equal((await experiencePost(f,body,transport)).status,200);assert.equal(calls,1);
 const changed=structuredClone(f.snapshot);changed.id=crypto.randomUUID();changed.revision=3;changed.payload.content.roles[0].context.value='Different role';f.gateway.loadDraft=async()=>changed;
 // Existing receipts are readable even after an edit; fresh inference is rejected against stale evidence.
 assert.equal((await experiencePost(f,body,transport)).status,200);assert.equal(calls,1);
 assert.equal((await experiencePost(f,{...body,operationId:crypto.randomUUID()},transport)).status,409);assert.equal(calls,1);
});

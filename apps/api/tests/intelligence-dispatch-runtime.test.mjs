import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare, Response as RuntimeResponse, convertV4MiniflareOptions } from "miniflare";
import { bundleWorker } from "./bundle-worker.mjs";
import { pdfFixture } from "./fixtures/pdf.mjs";
import { docx, doc } from "./fixtures/word.mjs";

test("native fetch dispatches configured imports, questions and rewrites without an options receiver", async () => {
  // In-memory persistence isolates dispatch; provider traffic still uses workerd's
  // native fetch, intercepted outside the Worker so no real provider is contacted.
  const bundle = await bundleWorker({
    stdin: {
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
      contents: `
        import { configuredIntelligenceRoute } from './src/intelligence/configured.ts';
        import { SyntheticLedger } from './fixtures/synthetic-ledger.ts';
        import { blankDraft, newRole, fact } from '@resumora/contracts/editor/model';
        import { encodeDraft } from '@resumora/contracts/editor/transport';
        const rows = new Map(), reservations = new Set(), ledger = new SyntheticLedger();
        let role, snapshot;
        const store = {
          async begin(input) {
            if (rows.has(input.operationId)) return { created: false, record: rows.get(input.operationId) };
            const record = { ...input, id: crypto.randomUUID(), state: 'uploading',
              objectKey: 'synthetic/' + input.operationId, review: null, error: null };
            rows.set(input.operationId, record);
            return { created: true, record };
          },
          async get(id) { return structuredClone(rows.get(id)); },
          async complete(id, state, review, error) {
            Object.assign(rows.get(id), { state, review, error });
            return structuredClone(rows.get(id));
          },
          async putObject() {},
        };
        async function reserve({ operationId }) {
          const created = !reservations.has(operationId);
          reservations.add(operationId);
          return { created };
        }
        const gateway = {
          createImportStore: () => store,
          reserveDocumentOperation: reserve,
          reserveEnhancement: reserve,
          beginAttempt: (...args) => ledger.begin(...args),
          finishAttempt: (...args) => ledger.finish(...args),
          loadSnapshot: async id => id === snapshot.id ? snapshot : null,
          loadDraft: async () => snapshot,
        };
        export default { async fetch(request, env) {
          if (!snapshot) {
            const draft = blankDraft();
            role = newRole();
            role.context = fact('Prepare weekly Excel reports.');
            draft.roles.push(role);
            snapshot = { id: crypto.randomUUID(), revision: 1, payload: encodeDraft(draft) };
          }
          const path = new URL(request.url).pathname;
          if (path === '/fixture') return Response.json({ snapshotId: snapshot.id,
            revision: 1, targetId: role.id, factId: role.context.id });
          if (path === '/attempts') return Response.json(await ledger.report({ from: '2000-01-01', to: '2099-01-01' }));
          return configuredIntelligenceRoute(request, env, gateway, 'synthetic-owner');
        } };
      `,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  const calls = [];
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{ type: "ESModule", path: "entry.mjs", contents: bundle.outputFiles[0].text }, ...bundle.wasm],
    compatibilityDate: "2026-10-25",
    host: "127.0.0.1",
    port: 0,
    unsafeRegisterWorker: false,
    bindings: {
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
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      assert.ok([
        "https://openrouter.ai/api/v1/chat/completions",
        "https://api.openai.com/v1/chat/completions",
        "https://api.openai.com/v1/responses",
      ].includes(request.url), "Unexpected outbound request");
      const body = await request.json();
      const word = url.pathname === "/v1/responses";
      const schema = word ? body.text.format.schema : body.response_format.json_schema.schema;
      const payload = JSON.parse(word ? body.input[1].content[0].text :
        Array.isArray(body.messages[1].content) ? body.messages[1].content[0].text : body.messages[1].content);
      calls.push({ url: request.url, model: body.model });
      assert.equal(body.store, false);
      assert.equal(body.stream, false);
      let output;
      if (body.model.endsWith("small")) {
        assert.equal(body[word ? "max_output_tokens" : "max_completion_tokens"], 300);
        output = { kind: "cv", reason: "Synthetic CV", pages: word ? [] : [1] };
      } else if (body.model.endsWith("strong")) {
        assert.equal(body[word ? "max_output_tokens" : "max_completion_tokens"], 8000);
        output = {
          schemaVersion: "cv-extraction/1",
          candidates: [{ id: "name", path: "name", value: "Mara Ionescu", quote: "Mara Ionescu",
            page: word ? null : 1, confidence: "high", warning: "" }],
          warnings: [], omittedPages: [],
        };
      } else {
        // Exercise direct Chat fallback as well as the primary Chat/Word paths.
        if (url.hostname === "openrouter.ai") return RuntimeResponse.json({}, { status: 503 });
        assert.equal(body.max_completion_tokens, 1800);
        output = schema.properties.questions ? {
          schemaVersion: "career-question-plan/1", targetId: payload.targetId,
          questions: [{ id: "q", dimension: "ownership", text: "Which part did you do?",
            why: "Individual work is missing", selectionMode: "multiple",
            options: [{ id: "merge", label: "Consolidated reports" }, { id: "review", label: "Reviewed reports" }] }],
        } : {
          schemaVersion: "career-role-rewrite/1", targetId: payload.targetId,
          text: "I prepared the weekly reports in Excel.", factIds: payload.facts.map(f => f.id), warnings: [],
        };
      }
      return RuntimeResponse.json(word ? {
        id: crypto.randomUUID(), model: body.model, status: "completed",
        usage: { input_tokens: 20, output_tokens: 20, total_tokens: 40 },
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
      } : {
        id: crypto.randomUUID(), model: body.model,
        usage: { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 },
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
      });
    },
  }));
  try {
    const origin = (await runtime.ready).origin;
    for (const [format, bytes] of [["pdf", pdfFixture()], ["docx", docx()], ["doc", doc()]]) {
      const operationId = crypto.randomUUID();
      const upload = () => fetch(origin + "/v1/intelligence/imports", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Document-Format": format,
          "X-Operation-Id": operationId, "X-Expected-Revision": "0" },
        body: bytes,
      });
      const response = await upload();
      const result = await response.json();
      assert.equal(response.status, 200);
      assert.equal(result.state, "ready", JSON.stringify({ format, result, calls }));
      assert.deepEqual(result.review.confirmedIds, []);
      assert.equal(result.review.extraction.candidates[0].value, "Mara Ionescu");
      assert.equal(result.review.pages, format === "pdf" ? 1 : null);
      const before = calls.length;
      assert.deepEqual(await (await upload()).json(), result);
      assert.equal(calls.length, before, "Replay must not dispatch again");
    }
    const { factId, ...fixture } = await (await fetch(origin + "/fixture")).json();
    for (const kind of ["questions", "rewrite"]) {
      const response = await fetch(origin + "/v1/intelligence/" + kind, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fixture, operationId: crypto.randomUUID() }),
      });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      if (kind === "questions") assert.equal(result.questions[0].selectionMode, "multiple");
      else {
        assert.equal(result.text, "I prepared the weekly reports in Excel.");
        assert.deepEqual(result.factIds, [factId]);
      }
    }
    assert.deepEqual(calls.map(c => c.model), ["router-small", "router-strong",
      "direct-small", "direct-strong", "direct-small", "direct-strong",
      "router-career", "direct-career", "router-career", "direct-career"]);
    const report = await (await fetch(origin + "/attempts")).json();
    assert.equal(report.totals.attempts, 10);
    assert.equal(report.recent.filter(a => a.result.status === "completed").length, 8);
    assert.ok(report.recent.every(a => a.result.errorCode === null || a.result.errorCode === "AVAILABILITY"));
  } finally {
    await runtime.dispose();
  }
});

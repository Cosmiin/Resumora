import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  Miniflare,
  Response as RuntimeResponse,
  convertV4MiniflareOptions,
} from "miniflare";
import { bundleWorker } from "./bundle-worker.mjs";
import { pdfFixture } from "./fixtures/pdf.mjs";

test("native upload returns before inference; an independent worker completes while status reads and upload replays remain read-only", async () => {
  const bundle = await bundleWorker({
    stdin: {
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
      contents: `
 import {configuredIntelligenceRoute} from './src/intelligence/configured.ts';
 import {processCvImport} from './src/intelligence/import-processor.ts';
 import {SyntheticLedger} from './fixtures/synthetic-ledger.ts';
 const rows=new Map(), ledger=new SyntheticLedger(), reserved=new Set();let queued=null;
 const store={async begin(input){if(rows.has(input.operationId))return {created:false,record:rows.get(input.operationId)};
 const row={...input,id:crypto.randomUUID(),objectKey:'synthetic/private',state:'uploading',review:null,error:null};rows.set(input.operationId,row);return {created:true,record:row};},
 async putObject(){},async get(id){return structuredClone(rows.get(id));},async complete(id,state,review,error){const row=rows.get(id);Object.assign(row,{state,review,error});return structuredClone(row);},
 async enqueue(id,bytes){const row=rows.get(id);queued={lease:crypto.randomUUID(),userId:'synthetic-owner',record:row,base64:btoa(String.fromCharCode(...bytes))};row.stage='queued';return structuredClone(row);}};
 const gateway={createImportStore:()=>store};
 const worker={async claim(){if(!queued)return null;const task=queued;queued=null;task.record.state='processing';task.record.stage='checking';return task;},
 async finish(_lease,state,review,error){for(const row of rows.values())Object.assign(row,{state,review,error,stage:undefined});},
 async reserve(_lease,input){for(const row of rows.values())row.stage=input.stage==='extract'?'extracting':'checking';const created=!reserved.has(input.operationId);reserved.add(input.operationId);return {created};},
 ledger:()=>({durability:'durable',begin:s=>ledger.begin(s),finish:(id,r)=>ledger.finish(id,r)})};
 export default {async fetch(request,env){if(new URL(request.url).pathname==='/synthetic/tick')return Response.json(await processCvImport(env,{store:worker}));return configuredIntelligenceRoute(request,env,gateway,'synthetic-owner');}};
 `,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  let release, started;
  const held = new Promise((r) => (release = r)),
    extracting = new Promise((r) => (started = r));
  let calls = 0;
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: [
        {
          type: "ESModule",
          path: "entry.mjs",
          contents: bundle.outputFiles[0].text,
        },
        ...bundle.wasm,
      ],
      compatibilityDate: "2026-10-25",
      compatibilityFlags: ["nodejs_compat"],
      unsafeRegisterWorker: false,
      host: "127.0.0.1",
      port: 0,
      bindings: {
        AI_PAID_INFERENCE: "on",
        AI_WORKER_SECRET: "synthetic-worker-secret-at-least-32",
        AI_PROCESSING_POLICY: "synthetic",
        OPENROUTER_API_KEY: "synthetic",
        OPENAI_API_KEY: "synthetic",
        OPENROUTER_ENDPOINT: "synthetic",
        OPENROUTER_CV_ADMISSION_MODEL: "synthetic-small",
        OPENAI_CV_ADMISSION_MODEL: "synthetic-small-direct",
        OPENROUTER_CV_EXTRACTION_MODEL: "synthetic-extract",
        OPENAI_CV_EXTRACTION_MODEL: "synthetic-extract-direct",
      },
      outboundService: async (request) => {
        assert.equal(
          request.url,
          "https://openrouter.ai/api/v1/chat/completions",
        );
        const body = await request.json();
        calls++;
        let output;
        if (body.model === "synthetic-small")
          output = { kind: "cv", reason: "Synthetic CV", pages: [1] };
        else {
          started();
          await held;
          output = {
            schemaVersion: "cv-extraction/1",
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
            warnings: [],
            omittedPages: [],
          };
        }
        return RuntimeResponse.json({
          id: "synthetic-response-" + calls,
          model: body.model,
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(output) },
            },
          ],
        });
      },
    }),
  );
  try {
    const op = crypto.randomUUID(),
      bytes = await pdfFixture(),
      headers = {
        "Content-Type": "application/octet-stream",
        "X-Document-Format": "pdf",
        "X-Operation-Id": op,
        "X-Expected-Revision": "0",
      };
    const upload = await runtime.dispatchFetch(
      "http://localhost/v1/intelligence/imports",
      { method: "POST", headers, body: bytes },
    );
    assert.equal(upload.status, 200);
    assert.equal((await upload.json()).stage, "queued");
    assert.equal(calls, 0);
    const work = runtime.dispatchFetch("http://localhost/synthetic/tick");
    await extracting;
    const read = await runtime.dispatchFetch(
      "http://localhost/v1/intelligence/imports/" + op,
    );
    assert.equal((await read.json()).stage, "extracting");
    const replay = await runtime.dispatchFetch(
      "http://localhost/v1/intelligence/imports",
      { method: "POST", headers, body: bytes },
    );
    assert.equal((await replay.json()).state, "processing");
    assert.equal(calls, 2);
    release();
    assert.equal((await (await work).json()).processed, 1);
    const final = await (
      await runtime.dispatchFetch(
        "http://localhost/v1/intelligence/imports/" + op,
      )
    ).json();
    assert.equal(final.state, "ready");
    assert.equal(final.review.extraction.candidates[0].quote, "Alex Morgan");
    assert.equal(calls, 2);
  } finally {
    release();
    await runtime.dispose();
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { strToU8 } from "fflate";
import { docx, doc } from "./fixtures/word.mjs";
test("actual workerd admits bounded native Word containers without inventing pages and rejects malformed/encrypted/expanded content", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
      contents: `import {preflightWord} from './src/intelligence/word-preflight.ts';export default{async fetch(r){try{const result=await preflightWord(r.headers.get('format'),new Uint8Array(await r.arrayBuffer()));return Response.json({format:result.format,pages:result.pages,warnings:result.warnings})}catch(e){return Response.json({error:e.message},{status:422})}}}`,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
  });
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      script: bundle.outputFiles[0].text,
      modules: true,
      compatibilityDate: "2026-10-25",
      host: "127.0.0.1",
      port: 0,
      unsafeRegisterWorker: false,
      outboundService: () => {
        assert.fail("No network allowed");
      },
    }),
  );
  try {
    const origin = (await runtime.ready).origin;
    const call = async (format, bytes) => {
      const r = await fetch(origin, {
        method: "POST",
        headers: { format },
        body: bytes,
      });
      return { status: r.status, data: await r.json() };
    };
    const x = await call("docx", docx());
    assert.equal(x.status, 200);
    assert.deepEqual(x.data.pages, []);
    const d = await call("doc", doc());
    assert.equal(d.status, 200, JSON.stringify(d.data));
    assert.deepEqual(d.data.pages, []);
    assert.equal(
      (await call("doc", doc(true))).data.error,
      "DOCUMENT_ENCRYPTED",
    );
    assert.equal(
      (await call("doc", doc(false, 40001))).data.error,
      "DOCUMENT_TEXT_LIMIT",
    );
    assert.equal(
      (await call("docx", docx("x".repeat(40001)))).data.error,
      "DOCUMENT_TEXT_LIMIT",
    );
    assert.equal(
      (
        await call(
          "docx",
          docx("ok", { "word/vbaProject.bin": strToU8("malicious") }),
        )
      ).data.error,
      "ACTIVE_DOCUMENT_CONTENT",
    );
    assert.equal(
      (await call("docx", docx('<!ENTITY x "bad">'))).data.error,
      "ACTIVE_DOCUMENT_CONTENT",
    );
    assert.equal(
      (await call("docx", new Uint8Array([80, 75, 3, 4]))).data.error,
      "DOCUMENT_MALFORMED",
    );
  } finally {
    await runtime.dispose();
  }
});

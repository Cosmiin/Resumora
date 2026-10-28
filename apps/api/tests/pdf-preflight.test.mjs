import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {pdfFixture} from './fixtures/pdf.mjs';
test('actual workerd page-tree preflight accepts mixed PDFs, rejects forged count and cap violations without network',async()=>{
  const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
    import {preflightPdf} from './src/intelligence/pdf-preflight.ts';
    export default { async fetch(r){try{const doc=await preflightPdf(new Uint8Array(await r.arrayBuffer()));return Response.json({pages:doc.pages.length,hash:doc.sha256,pdfBytes:doc.pdfBase64.length})}catch(e){return Response.json({error:e.message},{status:422})}}};`},bundle:true,write:false,format:'esm',platform:'browser'});
  let outbound=0;const runtime=new Miniflare(convertV4MiniflareOptions({script:bundle.outputFiles[0].text,modules:true,compatibilityDate:'2026-10-25',host:'127.0.0.1',port:0,unsafeRegisterWorker:false,
    limits:{cpuMs:10},outboundService:()=>{outbound++;throw new Error('NETWORK_DENIED')}}));
  try{const origin=(await runtime.ready).origin;
    async function call(bytes){const start=performance.now();const response=await fetch(origin,{method:'POST',body:bytes});const value=await response.json();console.log('workerd preflight',bytes.length,'bytes wall ms',Math.round(performance.now()-start),'status',response.status,value);return {response,value}}
    const good=await call(pdfFixture(['Mara Ionescu operations coordinator weekly Excel reporting',null]));assert.equal(good.response.status,200);assert.equal(good.value.pages,2);
    const bad=await call(pdfFixture(Array(11).fill(null)));assert.equal(bad.response.status,422);assert.equal(bad.value.error,'DOCUMENT_PAGES');
    const malformed=await call(Buffer.from('%PDF-1.7\ninvalid'));assert.equal(malformed.response.status,422);
    // Header and Pages/Count lie about one page; actual tree still has11 leaves.
    const countLie=pdfFixture(Array(11).fill(null)).toString().replace('/Count 11','/Count 01');assert.equal((await call(Buffer.from(countLie))).value.error,'DOCUMENT_PAGES');
    assert.equal((await call(new Uint8Array(10_000_001))).value.error,'DOCUMENT_SIZE');
    const active=pdfFixture().toString().replace('/Type /Catalog','/Names << /JavaScript << /Names [] >> >> /Type /Catalog');
    assert.equal((await call(Buffer.from(active))).value.error,'ACTIVE_DOCUMENT_CONTENT');
    // Near-cap opaque image stream with correct stream length/xref; preflight never renders it.
    const large=pdfFixture([null],9_500_000);
    const nearCap=await call(large);assert.equal(nearCap.response.status,200);assert.equal(nearCap.value.pages,1);
    assert.equal(outbound,0);
  }finally{await runtime.dispose()}
});

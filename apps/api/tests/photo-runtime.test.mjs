import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('bounded photo codecs execute in native Worker without network and strip metadata', async () => {
  const wasm=[];
  const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
    import {normalizePhoto} from './src/photos/normalize.ts';
    import encode,{init} from '@jsquash/jpeg/encode.js';
    import wasm from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm';
    import png,{init as pngInit} from '@jsquash/png/encode.js';
    import pngWasm from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
    import webp,{init as webpInit} from '@jsquash/webp/encode.js';
    import webpWasm from '@jsquash/webp/codec/enc/webp_enc.wasm';
    export default {async fetch(request){
      if(request.method==='GET'){
        const url=new URL(request.url),size=url.searchParams.has('large')?1600:256;const data=new Uint8ClampedArray(size*size*4);data.fill(255);const image={width:size,height:size,data};
        if(url.searchParams.has('png')){await pngInit(pngWasm);return new Response(await png(image));}
        if(url.searchParams.has('webp')){await webpInit(webpWasm);return new Response(await webp(image));}
        await init(wasm);return new Response(await encode(image));
      }
      try{const r=await normalizePhoto(new Uint8Array(await request.arrayBuffer()));return new Response(r.bytes,{headers:{'X-Width':String(r.width),'Content-Type':r.mime}});}
      catch(e){return Response.json({code:e.code||e.message},{status:e.status||500});}
    }};`},bundle:true,format:'esm',platform:'browser',write:false,plugins:[{name:'wasm',setup(b){b.onResolve({filter:/\.wasm$/},async args=>{if(args.pluginData?.resolved)return;const resolved=await b.resolve(args.path,{resolveDir:args.resolveDir,kind:args.kind,pluginData:{resolved:true}});let index=wasm.findIndex(w=>w.filename===resolved.path);if(index<0){index=wasm.length;wasm.push({filename:resolved.path,contents:await readFile(resolved.path)});}return {path:`./codec${index}.wasm`,external:true};});}}]});
  const runtime=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'entry.mjs',contents:bundle.outputFiles[0].text},...wasm.map((w,i)=>({type:'CompiledWasm',path:`codec${i}.wasm`,contents:w.contents}))],compatibilityDate:'2026-10-25',host:'127.0.0.1',port:0,unsafeRegisterWorker:false,outboundService:()=>{assert.fail('Photo codecs must never make an external request');}}));
  try {
    const origin=(await runtime.ready).origin;
    const fixture=new Uint8Array(await (await fetch(origin)).arrayBuffer());
    const normalized=await fetch(origin,{method:'POST',body:fixture});
    assert.equal(normalized.status,200,await normalized.clone().text());assert.equal(normalized.headers.get('x-width'),'256');assert.equal(normalized.headers.get('content-type'),'image/jpeg');
    const bytes=new Uint8Array(await normalized.arrayBuffer());assert.ok(bytes.length>100);
    for(const mode of ['png','webp','large']){
      const sample=await (await fetch(origin+'?'+mode)).arrayBuffer();
      const began=Date.now(),response=await fetch(origin,{method:'POST',body:sample});
      assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('x-width'),mode==='large'?'1600':'256');
      console.log('native codec',mode,'wall ms',Date.now()-began);await response.arrayBuffer();
    }

    assert.equal((await fetch(origin,{method:'POST',body:'not an image'})).status,422);
    const exif=new Uint8Array(fixture.length+12);exif.set(fixture.subarray(0,2));exif.set([255,225,0,10,69,120,105,102,0,0,0,0],2);exif.set(fixture.subarray(2),14);
    const denied=await fetch(origin,{method:'POST',body:exif});assert.equal(denied.status,422);assert.equal((await denied.json()).code,'normalizeLocally');
  } finally {await runtime.dispose();}
});

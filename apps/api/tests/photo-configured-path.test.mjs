import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {stripCanvasJpegMetadata} from '../../web/src/photo/canvas-jpeg.ts';
test('actual Worker normalizer and authenticated gateway use current reserve/finalize RPC parameters and verify stored bytes',async()=>{
 const wasm=[];
 const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
 import {photoRoute} from './src/photos/routes.ts';import {normalizePhoto} from './src/photos/normalize.ts';import {createDatabaseGateway} from './src/db/supabase.ts';
 const id='11111111-1111-4111-8111-111111111111',secret='s'.repeat(40),calls=[];let asset,stored;
 function keys(v,expected){if(JSON.stringify(Object.keys(v).sort())!==JSON.stringify(expected.sort()))throw Error('BAD_RPC_PARAMETERS');}
 const gateway=createDatabaseGateway({SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'},{user:{id},accessToken:'synthetic-user-token'},async(url,init)=>{
  if(init.headers.Authorization!=='Bearer synthetic-user-token'||init.redirect!=='manual')throw Error('BAD_AUTH_BOUNDARY');
  if(url.endsWith('/rpc/reserve_photo')){const p=JSON.parse(init.body);keys(p,['p_id','p_sha256','p_width','p_height','p_bytes','p_worker_secret']);if(p.p_id!==id||p.p_worker_secret!==secret)throw Error('BAD_RESERVATION');asset={id,objectKey:id+'/'+id+'.jpg',sha256:p.p_sha256,width:p.p_width,height:p.p_height,byteSize:p.p_bytes,state:'reserved'};calls.push('reserve');return Response.json(asset);}
  if(url.endsWith('/rpc/finish_photo')){const p=JSON.parse(init.body);keys(p,['p_id','p_worker_secret']);if(p.p_id!==id||p.p_worker_secret!==secret||!stored)throw Error('BAD_FINALIZE');asset.state='ready';calls.push('finish');return Response.json(asset);}
  if(url.includes('/storage/v1/object/cv-photos/')&&init.method==='POST'){if(init.headers['x-upsert']!=='false')throw Error('BAD_UPSERT');stored=new Uint8Array(init.body);calls.push('write');return Response.json({});}
  if(url.includes('/storage/v1/object/authenticated/cv-photos/')){calls.push('verify');return new Response(stored);}
  throw Error('UNEXPECTED_SYNTHETIC_REQUEST');
 });
 export default {async fetch(request){if(new URL(request.url).pathname==='/receipt')return Response.json({calls,state:asset?.state,width:asset?.width,height:asset?.height,byteSize:asset?.byteSize,stored:stored?.length});return photoRoute(request,gateway,secret,normalizePhoto)}};
 `},bundle:true,format:'esm',platform:'browser',write:false,plugins:[{name:'wasm',setup(b){b.onResolve({filter:/\.wasm$/},async args=>{if(args.pluginData?.resolved)return;const resolved=await b.resolve(args.path,{resolveDir:args.resolveDir,kind:args.kind,pluginData:{resolved:true}});let index=wasm.findIndex(w=>w.filename===resolved.path);if(index<0){index=wasm.length;wasm.push({filename:resolved.path,contents:await readFile(resolved.path)});}return{path:`./codec${index}.wasm`,external:true};});}}]});
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'entry.mjs',contents:bundle.outputFiles[0].text},...wasm.map((w,i)=>({type:'CompiledWasm',path:`codec${i}.wasm`,contents:w.contents}))],compatibilityDate:'2026-10-25',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,unsafeRegisterWorker:false,outboundService:()=>assert.fail('no external file upload/network')}));
 try{
  const origin=(await runtime.ready).origin;
  const bytes=stripCanvasJpegMetadata(new Uint8Array(await readFile(new URL('../../web/src/photo/fixtures/chrome-canvas.jpg',import.meta.url))));
  const response=await fetch(origin+'/v1/photos',{method:'POST',headers:{'Content-Type':'image/jpeg','X-Request-Id':'11111111-1111-4111-8111-111111111111'},body:bytes});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{asset:{id:'11111111-1111-4111-8111-111111111111',width:800,height:1000}});
  const receipt=await(await fetch(origin+'/receipt')).json();assert.deepEqual(receipt.calls,['reserve','write','verify','finish']);assert.equal(receipt.state,'ready');assert.ok(receipt.byteSize>0);assert.equal(receipt.stored,receipt.byteSize);
 }finally{await runtime.dispose();}
});

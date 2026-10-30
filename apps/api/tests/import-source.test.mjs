import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseGateway } from '../src/db/supabase.ts';
import { intelligenceRoute, isIntelligencePath } from '../src/intelligence/routes.ts';
import { importedDraft, confirmImported } from '../../../packages/contracts/src/editor/import.ts';
import { cvRoute } from '../src/cv/routes.ts';
const id='11111111-1111-4111-8111-111111111111';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'};
const identity={user:{id},accessToken:'synthetic-user-token'};
test('original retrieval keeps user token, performs tenant lookup before storage and never exposes URL/key',async()=>{
  const calls=[];
  const bytes=new TextEncoder().encode('%PDF-synthetic');
  const gateway=createDatabaseGateway(env,identity,async(url,init)=>{
    calls.push({url,init});
    assert.equal(init.headers.Authorization,'Bearer synthetic-user-token');
    assert.equal(init.redirect,'manual');
    return url.includes('/rpc/') ? Response.json({objectKey:`${id}/${id}/original.pdf`,format:'pdf',sourceHash:'a'.repeat(64)}) : new Response(bytes);
  });
  assert.deepEqual(await gateway.createImportStore('').source(id),{bytes,format:'pdf',sourceHash:'a'.repeat(64)});
  assert.equal(calls[0].url,env.SUPABASE_URL+'/rest/v1/rpc/get_cv_import_source');
  assert.deepEqual(JSON.parse(calls[0].init.body),{p_source:id});
  assert.equal(calls[1].url,env.SUPABASE_URL+`/storage/v1/object/authenticated/cv-imports/${id}/${id}/original.pdf`);
  for(const code of ['SNAPSHOT_NOT_FOUND','RESOURCE_FORBIDDEN']) {
    let reads=0;
    const denied=createDatabaseGateway(env,identity,async(url)=>{reads++; assert.ok(url.includes('/rpc/')); return Response.json({code,message:'private details'},{status:404});});
    await assert.rejects(()=>denied.createImportStore('').source(id));
    assert.equal(reads,1);
  }
});
test('source route is authenticated-path classified, GET only, private no-store and binary',async()=>{
  const url=`https://resumora.invalid/v1/intelligence/imports/${id}/source`;
  assert.equal(isIntelligencePath(new URL(url).pathname),true);
  let calls=0,cancels=0;
  const options={workflow:{source:async(source)=>{calls++;assert.equal(source,id);return {bytes:new Uint8Array([1,2]),format:'pdf'};},cancel:async()=>{cancels++;}},gateway:{},operations:{}};
  const response=await intelligenceRoute(new Request(url),options);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(response.headers.get('Content-Type'),'application/pdf');
  assert.equal(response.headers.has('Set-Cookie'),false);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2]);
  assert.equal((await intelligenceRoute(new Request(url,{method:'POST'}),options)).status,405);
  assert.equal(calls,1);assert.equal(cancels,0);
});
const review={id,sourceHash:'a'.repeat(64),format:'pdf',parserVersion:'synthetic',pages:1,admission:{kind:'cv',reason:'CV',pages:[1]},extraction:{schemaVersion:'cv-extraction/1',candidates:[{id:'n',path:'name',value:'Synthetic Owner',quote:'Synthetic Owner',page:1,confidence:'high'},{id:'r',path:'roles.0.title',value:'Engineer',quote:'Engineer',page:1,confidence:'low'}],warnings:[],omittedPages:[]},confirmedIds:[]};
test('partial section autosave goes through review recording without requiring complete unrelated sections',async()=>{
  const draft=confirmImported(importedDraft(review),['n']);let recorded=0;
  const response=await cvRoute(new Request('https://resumora.invalid/v1/base-cv/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft,mode:'autosave',expectedRevision:0,requestId:crypto.randomUUID()})}),{saveReviewedImport:async(input)=>{recorded++;assert.deepEqual(input.selected,['n']);return {id,revision:1,reason:'save',createdAt:'2026-10-29T00:00:00Z',parentId:null,payload:input.payload};},saveDraft:async()=>{throw new Error('review audit bypassed');}});
  assert.equal(response.status,200);assert.equal(recorded,1);
  const saved=await response.json();assert.equal(saved.draft.roles[0].title.status,'extracted_unconfirmed');assert.equal(saved.draft.name.status,'user_confirmed');
});
test('unknown confidence fails admission to review; unknown Word locations stay explicitly unlocated',()=>{
  for(const confidence of [undefined,null,'unknown']) {
    const invalid=structuredClone(review);invalid.extraction.candidates[0].confidence=confidence;
    assert.throws(()=>importedDraft(invalid),/INVALID_IMPORT_REVIEW/);
  }
  const word=structuredClone(review);word.format='docx';word.pages=null;word.admission.pages=[];
  word.extraction.candidates.forEach(c=>{c.page=null;});
  const draft=importedDraft(word);
  assert.equal(draft.name.status,'extracted_unconfirmed');
  assert.ok(draft.sources.some(s=>s.locator===`import:${id}:excerpt:n`));
  assert.equal(draft.importReview.extraction.candidates[0].page,null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabaseGateway} from '../src/db/supabase.ts';
import {importWorkflow} from '../src/intelligence/import-workflow.ts';
const id='11111111-1111-4111-8111-111111111111';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'},identity={user:{id},accessToken:'synthetic-user'};
for(const [name,status,expected] of [['definite refusal',403,'STORAGE_UPLOAD_REJECTED'],['unknown backend acknowledgement',500,'STORAGE_OUTCOME_UNKNOWN']])test(name+' stays before processor/provider and a replay retains the same result',async()=>{
 let row,puts=0,processed=0,providers=0;
 const g=createDatabaseGateway(env,identity,async()=>{puts++;return Response.json({code:'AccessDenied',message:'PRIVATE_DOCUMENT_NAME_OR_TOKEN_MUST_NOT_BE_LOGGED'},{status});});
 const store={begin:async input=>{if(row)return {created:false,record:row};row={id,operationId:input.operationId,state:'uploading',format:'pdf',objectKey:`${id}/${id}/original.pdf`,review:null,error:null};return {created:true,record:row};},get:async()=>row,complete:async(_id,state,review,error)=>(row={...row,state,review,error}),putObject:g.createImportStore('').putObject};
 const warnings=[],original=console.warn;console.warn=(...args)=>warnings.push(args);
 try{
  const w=importWorkflow({userId:id,store,aiEnabled:true,processor:async()=>{processed++;throw Error('Unexpected processor');},operations:{extract:async()=>{providers++;}}});
  const input={operationId:id,format:'pdf',bytes:new TextEncoder().encode('%PDF-1.4\n%%EOF'),expectedRevision:0,signal:new AbortController().signal};
  const a=await w.start(input);assert.equal(a.error,expected);assert.equal(a.state,status===403?'failed':'unknown');assert.deepEqual(await w.start(input),a);
  assert.equal(puts,1);assert.equal(processed,0);assert.equal(providers,0);
  assert.ok(warnings.some(args=>args[0]==='import-storage'&&args[1].httpStatus===status));
  assert.ok(!JSON.stringify(warnings).includes('PRIVATE_'));
 }finally{console.warn=original;}
});
test('upload transport loss is an unknown storage outcome, never a definite provider failure',async()=>{
 const g=createDatabaseGateway(env,identity,async()=>{throw Error('PRIVATE_TOKEN');});const original=console.warn;console.warn=()=>{};
 try{await assert.rejects(g.createImportStore('').putObject(`${id}/${id}/original.pdf`,new Uint8Array([1])),e=>e.code==='STORAGE_OUTCOME_UNKNOWN');}finally{console.warn=original;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDraft,newRole,fact} from '@resumora/contracts/editor/model';
import {encodeDraft} from '@resumora/contracts/editor/transport';
import {validateRoleSummary,validateRewrite,isRoleRewriteReview} from '@resumora/contracts/intelligence/model';
import {careerContext} from '@resumora/contracts/intelligence/context';
import {intelligenceOperations} from '../src/intelligence/operations.ts';
import {intelligenceRoute} from '../src/intelligence/routes.ts';
function fixture(){const d=blankDraft(),r=newRole();r.context=fact('Prepared weekly reports.');r.bullets=[fact('Maintained SQL reports.')];d.roles=[r];return {d,r};}
const proposal=(r,text='Prepared weekly SQL reports.')=>({schemaVersion:'career-role-rewrite/1',targetId:r.id,text,factIds:[r.context.id,r.bullets[0].id],warnings:[]});
test('summary prompt is scoped, concise and distinct from full-role structure, without modifying source evidence',async()=>{
 const{d,r}=fixture(),before=structuredClone(d),calls=[];
 const ops=intelligenceOperations(async input=>{calls.push(input);return proposal(r);});
 await ops.rewrite({draft:d,targetId:r.id,operationId:crypto.randomUUID(),userId:crypto.randomUUID(),purpose:'summary'});
 assert.equal(calls[0].promptVersion,'career.role-summary.v3-scope-context');assert.match(calls[0].system,/400 characters/);assert.match(calls[0].system,/scope and context/);
 await ops.rewrite({draft:d,targetId:r.id,operationId:crypto.randomUUID(),userId:crypto.randomUUID()});
 assert.equal(calls[1].promptVersion,'career.role-rewrite.v3-structured');assert.match(calls[1].system,/Never return HTML/);assert.match(calls[1].system,/never force every sentence/);assert.deepEqual(d,before);
});
test('new role context generation rejects long paragraphs and more than two sentences at both validation boundaries',async()=>{
 const {d,r}=fixture();
 const invalid=[
  'Prepared reports. Maintained SQL reporting. Supported weekly reporting.',
  'A'.repeat(400)+'.',
  'Prepared\nreports.',
  '- Prepared reports.',
  'Supported 20 teams.',
 ];
 for(const text of invalid){
  const result=proposal(r,text);
  const callbackOps=intelligenceOperations(async task=>{
   assert.throws(()=>task.validateOutput(result),undefined,text);
   return proposal(r);
  });
  await callbackOps.rewrite({draft:d,targetId:r.id,operationId:crypto.randomUUID(),userId:crypto.randomUUID(),purpose:'summary'});
  const finalOps=intelligenceOperations(async()=>result);
  await assert.rejects(()=>finalOps.rewrite({draft:d,targetId:r.id,operationId:crypto.randomUUID(),userId:crypto.randomUUID(),purpose:'summary'}),undefined,text);
 }
});
test('new role context generation accepts sparse evidence and two sentences at the character boundary',async()=>{
 const {d,r}=fixture();
 for(const text of ['Supported weekly SQL reporting.','Supported weekly SQL reporting. Maintained reporting context.','A'.repeat(399)+'.']){
  const result=proposal(r,text);
  const ops=intelligenceOperations(async task=>{assert.deepEqual(task.validateOutput(result),result);return result;});
  assert.deepEqual(await ops.rewrite({draft:d,targetId:r.id,operationId:crypto.randomUUID(),userId:crypto.randomUUID(),purpose:'summary'}),result);
 }
});
test('legacy summaries remain valid saved reviews and full rewrites keep their longer paragraph allowance',async()=>{
 const {d,r}=fixture(),context=careerContext(d,r.id);
 const text=Array(5).fill('Prepared weekly reports using the documented SQL reporting workflow for the reporting team.').join(' ');
 const result=proposal(r,text);
 assert.ok(text.length>400);
 const review={id:'legacy-summary',purpose:'summary',status:'pending',input:context,proposal:result};
 assert.ok(isRoleRewriteReview(review));
 assert.ok(isRoleRewriteReview({...review,status:'accepted'}));
 d.roleRewriteReviews=[review];
 const {decodeDraft}=await import('@resumora/contracts/editor/transport');
 assert.equal(decodeDraft(encodeDraft(d)).roleRewriteReviews[0].proposal.text,text);
 const ops=intelligenceOperations(async task=>{assert.deepEqual(task.validateOutput(result),result);return result;});
 assert.deepEqual(await ops.rewrite({draft:d,targetId:r.id,operationId:crypto.randomUUID(),userId:crypto.randomUUID()}),result);
});
test('summary validation rejects lists, overlength and unsupported metrics but allows numbered list markers in full rewrite',()=>{
 const{d,r}=fixture(),ctx=careerContext(d,r.id);
 for(const text of ['x'.repeat(1201),'- Prepared reports.','Prepared\nreports.','Improved output by 90%.'])assert.throws(()=>validateRoleSummary(proposal(r,text),r.id,ctx.facts));
 assert.ok(validateRewrite(proposal(r,'1. Prepared reports.\n2. Maintained SQL reports.'),r.id,ctx.facts));
 const review={id:'summary',purpose:'summary',status:'accepted',input:ctx,proposal:proposal(r)};
 assert.ok(isRoleRewriteReview(review));assert.equal(isRoleRewriteReview({...review,purpose:'freeform'}),false);assert.equal(isRoleRewriteReview({...review,proposal:proposal(r,'x'.repeat(1201))}),false);
});
function routeFixture(){const{d,r}=fixture(),id=crypto.randomUUID(),snapshot={id,revision:1,payload:encodeDraft(d)},operations=new Map();let requests=0;
 const options={enabled:true,userId:crypto.randomUUID(),gateway:{loadSnapshot:async key=>key===id?snapshot:null,loadDraft:async()=>snapshot,reserveCareer:async()=>true,getWorkspaceOperation:async key=>operations.get(key),beginWorkspaceOperation:async(key,kind,input)=>{operations.set(key,{id:key,kind,input,state:'processing',result:null});return{created:true}},finishWorkspaceOperation:async(key,state,result)=>operations.set(key,{...operations.get(key),state,result})},operations:{rewrite:async input=>{requests++;assert.equal(input.purpose,'summary');return proposal(r);}}};
 const body={snapshotId:id,revision:1,targetId:r.id,operationId:crypto.randomUUID(),purpose:'summary'};
 const request=(data=body,path='rewrite')=>intelligenceRoute(new Request('https://app.invalid/v1/intelligence/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),options);
 return{body,request,options,operations,count:()=>requests};}
test('summary replay recovers one owned operation and rejects the same ID for a different purpose',async()=>{
 const f=routeFixture();assert.equal((await f.request()).status,200);assert.equal((await f.request()).status,200);assert.equal(f.count(),1);
 const other={...f.body};delete other.purpose;assert.equal((await f.request(other)).status,409);assert.equal(f.count(),1);
 assert.equal(f.operations.get(f.body.operationId).input.purpose,'summary');
});
test('invalid purpose, question-purpose mixing, missing source and stale revisions fail before inference',async()=>{
 const f=routeFixture();assert.equal((await f.request({...f.body,purpose:'arbitrary'})).status,400);assert.equal((await f.request(f.body,'questions')).status,400);
 assert.equal((await f.request({...f.body,snapshotId:crypto.randomUUID()})).status,404);assert.equal((await f.request({...f.body,revision:2})).status,404);assert.equal(f.count(),0);
});
test('accepts a grounded short paragraph of up to five sentences and rejects longer summaries',()=>{
 const {d,r}=fixture(),context=careerContext(d,r.id);
 const sentence='Prepared weekly reports using the documented SQL reporting workflow.';
 const text=Array(5).fill(sentence).join(' ');
 assert.ok(validateRoleSummary(proposal(r,text),r.id,context.facts));
 assert.throws(()=>validateRoleSummary(proposal(r,Array(6).fill(sentence).join(' ')),r.id,context.facts));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDraft,newRole,fact} from '@resumora/contracts/editor/model';
import {encodeDraft} from '@resumora/contracts/editor/transport';
import {experienceFingerprint} from '@resumora/contracts/intelligence/experience';
import {intelligenceRoute} from '../src/intelligence/routes.ts';
import {experienceStream} from '../src/intelligence/experience-stream.ts';
import {sseData} from '@resumora/contracts/intelligence/stream';
test('a long fine-grained draft reaches its final result within the browser wire budget',async()=>{
 const text='x'.repeat(6000);
 const response=experienceStream(crypto.randomUUID(),async onDraft=>{for(let i=4;i<=text.length;i+=4)onDraft(text.slice(0,i));return Response.json({text});});
 let last;for await(const event of sseData(response,2_000_000))last=JSON.parse(event);
 assert.equal(last.kind,'ready');assert.equal(last.result.text,text);
});
test('authenticated experience streams provisional text then a durably recorded result; replay never generates',async()=>{
  const d=blankDraft(),r=newRole();r.context=fact('Prepared reports.');d.roles=[r];
  const snapshot={id:crypto.randomUUID(),revision:1,payload:encodeDraft(d)}, receipts=new Map();let calls=0;
  const body={snapshotId:snapshot.id,revision:1,targetId:r.id,operationId:crypto.randomUUID(),experience:{intent:'role',fingerprint:await experienceFingerprint(d,r.id)}};
  const result={schemaVersion:'experience-assistant/1',targetId:r.id,fingerprint:body.experience.fingerprint,intent:'role',text:'Prepared clear reports.',explanation:'Clearer.',factIds:[r.context.id]};
  const opts={enabled:true,userId:crypto.randomUUID(),gateway:{loadSnapshot:async()=>snapshot,loadDraft:async()=>snapshot,reserveCareer:async()=>true,getWorkspaceOperation:async id=>receipts.get(id),beginWorkspaceOperation:async(id,kind,input)=>{receipts.set(id,{id,kind,input,state:'processing'});return{created:true};},finishWorkspaceOperation:async(id,state,value)=>{receipts.set(id,{...receipts.get(id),state,result:value});}},operations:{experience:async input=>{calls++;input.onDraft?.('Prepared');input.onDraft?.('Prepared clear reports.');return result;}}};
  const post=()=>intelligenceRoute(new Request('https://app.invalid/v1/intelligence/experience',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify(body)}),opts);
  const response=await post();assert.match(response.headers.get('content-type'),/text\/event-stream/);
  const text=await response.text();assert.match(text,/draft/);assert.match(text,/ready/);assert.equal(receipts.get(body.operationId).state,'ready');
  await (await post()).text();assert.equal(calls,1);
});

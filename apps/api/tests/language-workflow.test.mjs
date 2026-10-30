import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeDraft,encodeDraft} from '@resumora/contracts/editor/transport';
import {fact} from '@resumora/contracts/editor/model';
import {translationItems} from '@resumora/contracts/editor/languages';
import {languageWorkflow} from '../src/languages/workflow.ts';
const fixture=JSON.parse(await readFile(new URL('../../../packages/contracts/fixtures/job-editor-import.json',import.meta.url),'utf8'));
const id='11111111-1111-4111-8111-111111111111';
const translated=input=>({schemaVersion:'cv-translation/1',sourceLocale:input.sourceLocale,targetLocale:input.targetLocale,completion:'complete',items:input.items.map(i=>({id:i.id,fieldId:i.fieldId,text:'Translated: '+i.text,factIds:i.factIds,evidenceIds:i.evidenceIds})),warnings:[],ambiguousTerms:[],suggestedGlossary:[]});
function setup(){
 const draft=decodeDraft(fixture);draft.language="ro";draft.presentation.order=[...new Set(['identity',...draft.presentation.order])];draft.presentation.hidden=draft.presentation.hidden.filter(s=>s!=='identity');
 let row={id:'source-current',revision:1,fingerprint:'a'.repeat(64),reason:'save',payload:encodeDraft(draft)},target=null,p=null,calls=0,writes=0;
 const inputs=[];const db={languageContext:async()=>({source:row,versions:[]}),loadBaseLanguage:async()=>target,
  languageCommand:async(action,key,input)=>{
   if(action==='get')return structuredClone(p);
   if(action==='start'){p={id:key,request:input,state:'pending',step:0,reviewRevision:0,output:null,review:null,accepted:null};return structuredClone(p);}
   if(action==='work'){if(p.state!=='pending'||p.step!==input.expectedStep)return{created:false,proposal:structuredClone(p)};p.state='processing';return{created:true,proposal:structuredClone(p)};}
   if(action==='settle'){p.state=input.error?'failed':input.complete?'ready':'pending';p.output=input.output??null;p.step++;return structuredClone(p);}
   if(action==='review'){assert.equal(input.expectedRevision,p.reviewRevision);p.review=input.review;p.reviewRevision++;return structuredClone(p);}
   if(action==='cancel'){p.state='cancelled';p.output=null;p.review=null;return structuredClone(p);}
   throw Error(action);
  },acceptLanguage:async input=>{writes++;target={revision:1,payload:input.payload};p.state='accepted';p.accepted={kind:'base',id:'accepted',revision:1,variantId:p.request.variantId};return p.accepted;}};
 const ops={translate:async({input})=>{calls++;inputs.push(input);return translated(input);}};
 const flow=languageWorkflow(db,ops,'synthetic-owner','synthetic-secret');
 const request={source:{kind:'base',documentId:draft.id,currentId:row.id,revision:row.revision,fingerprint:row.fingerprint},sourceLocale:'ro-RO',targetLocale:'en-GB',targetRevision:0,targetDocumentId:null,variantId:'lang_'+'b'.repeat(64),sectionIds:[],glossary:[]};
 return{flow,request,draft,ops,inputs,get row(){return row},set row(v){row=v},get target(){return target},set target(v){target=v},get p(){return p},get calls(){return calls},get writes(){return writes}};
}
async function ready(h){await h.flow.start(id,h.request);do{await h.flow.advance(id);}while(h.p.state==='pending');assert.equal(h.p.state,'ready');}
async function confirm(h){const {input}=await h.flow.inputFor(h.request);await h.flow.review(id,0,{values:h.p.output.items.map(i=>({id:i.id,text:i.text})),confirmed:[...new Set(input.items.map(i=>i.sectionId))]});}
test('reading, opening, replaying and editing a proposal never invokes extra inference; explicit confirmed acceptance is independent',async()=>{
 const h=setup();await h.flow.start(id,h.request);await h.flow.get(id);assert.equal(h.calls,0);await h.flow.advance(id);const calls=h.calls;await h.flow.advance(id);assert.equal(h.calls,calls);
 await assert.rejects(h.flow.accept(id,'save',0),/proposalNotReady/);await confirm(h);
 h.p.review.values[0].text='Manually edited: '+h.p.review.values[0].text;await h.flow.review(id,1,h.p.review);assert.equal(h.calls,calls);
 const accepted=await h.flow.accept(id,'save',2);assert.equal(h.writes,1);assert.equal(decodeDraft(h.target.payload).documentLocale,'en-GB');assert.deepEqual(h.row.payload,encodeDraft(h.draft));assert.deepEqual(await h.flow.accept(id,'save',2),accepted);assert.equal(h.writes,1);
});
test('a source changing during inference cannot settle a usable translation or write a target',async()=>{
 const h=setup();h.ops.translate=async({input})=>{h.row={...h.row,revision:2};return translated(input);};await h.flow.start(id,h.request);
 await assert.rejects(h.flow.advance(id),/staleSource/);assert.equal(h.p.state,'failed');assert.equal(h.writes,0);assert.equal(h.target,null);
});
test('manual target changes and incomplete section confirmation fence acceptance',async()=>{
 const h=setup();await ready(h);await h.flow.review(id,0,{values:h.p.output.items.map(i=>({id:i.id,text:i.text})),confirmed:[]});await assert.rejects(h.flow.accept(id,'save',1),/reviewIncomplete/);
 await confirm({...h,flow:{...h.flow,review:(key,_rev,review)=>h.flow.review(key,1,review)}});h.target={revision:2,payload:h.row.payload};await assert.rejects(h.flow.accept(id,'save',2),/targetChanged/);assert.equal(h.writes,0);
});
test('cancellation and in-flight replay do not dispatch another provider request',async()=>{
 const h=setup();await h.flow.start(id,h.request);h.p.state='processing';await h.flow.advance(id);assert.equal(h.calls,0);await h.flow.cancel(id);await h.flow.advance(id);assert.equal(h.calls,0);assert.equal(h.writes,0);
});
test('section regeneration sends only selected components; long CV work is bounded and advanced explicitly',async()=>{
 const h=setup();const {input}=await h.flow.inputFor(h.request);h.request.sectionIds=[input.items[0].sectionId];await ready(h);assert.ok(h.inputs.every(i=>i.items.every(item=>item.sectionId===h.request.sectionIds[0])));
 const long=setup();long.draft.technicalSkills=Array.from({length:120},(_,i)=>({...fact('Synthetic skill '+i),id:'skill-'+i,fieldId:'skill-field-'+i}));const wire=encodeDraft(long.draft);assert.deepEqual(decodeDraft(wire),long.draft);const components=await translationItems(decodeDraft(wire));assert.ok(components.length>100);assert.equal(new Set(components.map(i=>i.id)).size,components.length);long.row={...long.row,payload:wire};await long.flow.start(id,long.request);await long.flow.advance(id);assert.equal(long.calls,1);assert.equal(long.p.state,'pending');await long.flow.advance(id);assert.equal(long.calls,2);assert.ok(long.inputs.every(i=>i.items.length<=100));assert.deepEqual(long.inputs.flatMap(i=>i.items.map(item=>item.id)),components.map(i=>i.id));
});

test('declared source locale must match the accepted document before inference',async()=>{const h=setup();h.request.sourceLocale='en-GB';h.request.targetLocale='ro-RO';await assert.rejects(h.flow.start(id,h.request),/authoritativeSourceRequired/);assert.equal(h.calls,0);});

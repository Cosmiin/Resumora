import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDraft, fact, newRole } from '@resumora/contracts/editor/model';
import { encodeDraft } from '@resumora/contracts/editor/transport';
import * as language from '@resumora/contracts/editor/content-language';
import { intelligenceOperations } from '../src/intelligence/operations.ts';
import { intelligenceRoute } from '../src/intelligence/routes.ts';

const prose = 'Coordonam activitățile echipei și pregăteam rapoartele săptămânale folosind Salesforce și Excel. Verificam datele și explicam colegilor rezultatele pentru planificarea activităților.';
function fixture(text = prose) {
  const draft = blankDraft(), role = newRole();
  draft.language = 'en'; role.context = fact(text); draft.roles = [role];
  let head = { id: crypto.randomUUID(), revision: 1, payload: encodeDraft(draft) };
  const snapshots = new Map([[head.id,head]]), receipts = new Map(), tasks = [], reservations = [];
  let output = { outcome: 'detected', locale: 'ro-RO', confidence: 'high', labels: {} };
  const operations = intelligenceOperations(async task => { tasks.push(task); return output; });
  const options = { enabled:true,userId:'synthetic',operations,gateway:{
    loadSnapshot:async id=>snapshots.get(id),loadDraft:async()=>head,
    getWorkspaceOperation:async id=>receipts.get(id),
    beginWorkspaceOperation:async(id,kind,input)=>{if(!snapshots.has(input.snapshotId)||snapshots.get(input.snapshotId).revision!==input.revision)throw Object.assign(Error('INVALID_EDITOR_PAYLOAD'),{status:422,code:'INVALID_EDITOR_PAYLOAD'});if(receipts.has(id))return{created:false};receipts.set(id,{id,kind,input,state:'processing'});return{created:true};},
    finishWorkspaceOperation:async(id,state,result)=>Object.assign(receipts.get(id),{state,result}),
    reserveCareer:async input=>{reservations.push(input);return true;},
  }};
  const context = async()=>({snapshotId:head.id,revision:head.revision,targetId:draft.id,operationId:typeof language.languageDetectionOperationId === 'function' ? await language.languageDetectionOperationId(draft) : crypto.randomUUID()});
  const post = async(body)=>intelligenceRoute(new Request('https://app.invalid/v1/intelligence/language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body ?? await context())}),options);
  const save=()=>{head={id:crypto.randomUUID(),revision:head.revision+1,payload:encodeDraft(draft)};snapshots.set(head.id,head);};
  return { draft,role,context,post,save,tasks,receipts,reservations,options,setOutput:v=>{output=v;} };
}
test('saved Romanian narrative with borrowed technology terms is detected once through the accounted route',async()=>{
 const f=fixture();const context=await f.context();const response=await f.post(context);assert.equal(response.status,200);const value=await response.json();
 assert.equal(value.locale,'ro-RO');assert.equal(value.confidence,'high');assert.equal(value.source,'narrative');assert.match(value.narrativeFingerprint,/^[a-f0-9]{64}$/);
 assert.equal(f.tasks.length,1);assert.equal(f.reservations.length,1);assert.equal(f.tasks[0].input.narrative,prose);assert.equal(f.tasks[0].operation,'cv_rewrite');
 assert.equal((await f.post(context)).status,200);assert.equal(f.tasks.length,1);
 f.draft.name=fact('unrelated identifier');f.save();assert.equal((await f.post()).status,200);assert.equal(f.tasks.length,1);
});
test('empty manual draft returns explicit insufficient narrative without paid inference',async()=>{
 const f=fixture('');const response=await f.post();assert.equal(response.status,200);const value=await response.json();assert.equal(value.locale,'en');assert.equal(value.status,'insufficient');assert.equal(value.confidence,'low');assert.equal(f.tasks.length,0);assert.equal(f.reservations.length,0);
});
test('changed or deleted saved snapshots cannot start detection or return a delayed current decision',async()=>{
 const f=fixture();const old=await f.context();f.role.context=fact(prose+' Pregăteam documentația internă.');f.save();assert.equal((await f.post(old)).status,409);assert.equal(f.tasks.length,0);
 f.options.gateway.loadDraft=async()=>null;assert.equal((await f.post()).status,409);assert.equal(f.tasks.length,0);
});
test('French and Arabic labels are bounded and tied to the exact detected locale',async()=>{
 for(const locale of ['fr-FR','ar']) {
  const labelsModule=await import('@resumora/contracts/editor/document-labels');
  const labels=Object.fromEntries(labelsModule.documentLabelKeys.map(key=>[key,locale==='ar'?'عنوان':'Rubrique']));
  const f=fixture();f.setOutput({outcome:'detected',locale,confidence:'medium',labels});
  const response=await f.post();assert.equal(response.status,200);const value=await response.json();assert.equal(value.locale,locale);assert.deepEqual(value.labels,labels);
  const broken=fixture();broken.setOutput({outcome:'detected',locale,confidence:'high',labels:{experience:'Only one label'}});assert.equal((await broken.post()).status,502);
 }
});
test('explicit correction localizes labels without redetecting original narrative or changing provenance',async()=>{
 const labelsModule=await import('@resumora/contracts/editor/document-labels');const labels=Object.fromEntries(labelsModule.documentLabelKeys.map(key=>[key,'Libellé']));
 const f=fixture();f.draft.contentLanguage={locale:'fr-FR',confidence:'high',source:'user-correction',policyVersion:'cv-language/1'};f.save();f.setOutput({outcome:'detected',locale:'fr-FR',confidence:'high',labels});
 const response=await f.post();assert.equal(response.status,200);const value=await response.json();assert.equal(value.locale,'fr-FR');assert.equal(value.source,'user-correction');assert.equal(f.tasks[0].input.mode,'localize');assert.equal(f.tasks[0].input.narrative,'');
});
test('unknown outcomes do not silently generate another language and are recoverable without paid rerun',async()=>{
 const f=fixture();f.setOutput({outcome:'unsupported',locale:null,confidence:'low',labels:{}});const c=await f.context();const r=await f.post(c);assert.equal(r.status,200);const value=await r.json();assert.equal(value.status,'unavailable');assert.equal(value.confidence,'low');assert.equal((await f.post(c)).status,200);assert.equal(f.tasks.length,1);
});

test('all experience coaching paths use owned full locale despite foreign answers and client feedback override',async()=>{
 const {experienceFingerprint,experienceScoreFingerprint,experiencePoints,experienceText}=await import('@resumora/contracts/intelligence/experience');
 for (const locale of ['ro-RO','fr-FR','ar']) {
  const f=fixture();f.draft.documentLocale=locale;
  f.draft.answers=[{id:'foreign-answer',targetId:f.role.id,question:'tools',questionText:'Which tools?',text:'I checked the reports using SQL.',status:'confirmed',sourceId:'answer-source'}];
  const rawPoints=task=>task.input.points.map(p=>({id:p.id,meaningful:true,contribution:'specific',clarity:'partial',specificity:'partial',issue:'clarity',duplicateOf:null,strength:'Précis',improvement:'Clarifiez',suggestedQuestion:null}));
  const seen=[];const ops=intelligenceOperations(async task=>{
   seen.push(task);
   if(task.input.points)return {points:rawPoints(task),dimensions:['contribution','methods','scope','outcome'].map(dimension=>({dimension,grade:'missing',evidencePointIds:[]})),experience:null};
   if(task.promptVersion.includes('questions'))return{questions:[{dimension:'tools',text:'Quels outils utilisiez-vous ?',hint:'Précisez la méthode.'}]};
   if(task.promptVersion.includes('skills'))return{skills:[]};
   return{text:'Coordonam activitățile echipei.',explanation:'Formularea este clară.',factIds:[task.input.facts[0].id]};
  });
  for (const intent of ['score','questions','point','role','skills']) {
   const result=await ops.experience({operationId:crypto.randomUUID(),userId:'synthetic',draft:f.draft,targetId:f.role.id,
    request:{intent,feedbackLocale:'en-US',fingerprint:intent==='score'?await experienceScoreFingerprint(f.draft,f.role.id):await experienceFingerprint(f.draft,f.role.id),
    ...(['questions','point'].includes(intent)?{point:experiencePoints(experienceText(f.draft,f.role.id))[0]}:{})}});
   if(intent==='score')assert.equal(result.assessment.feedbackLocale,locale);
  }
  assert.equal(seen.length,5);
  for(const task of seen){assert.equal(task.input.locale,locale);assert.equal(task.input.documentLocale,locale);assert.equal(task.contentLocale,locale);assert.ok(task.system.includes(`(${locale})`));}
  const role=seen.find(c=>c.promptVersion.startsWith('experience-role/'));assert.ok(role.input.facts.some(f=>f.text==='I checked the reports using SQL.'));
  assert.equal(f.draft.answers[0].text,'I checked the reports using SQL.');
 }
});
test('placeholder and duplicate feedback never silently use English for a non-English document',async()=>{
 const f=fixture('x');f.draft.documentLocale='fr-FR';
 const {experienceFingerprint,experiencePoints,experienceText}=await import('@resumora/contracts/intelligence/experience');
 const seen=[];const ops=intelligenceOperations(async task=>{seen.push(task);return{text:'',explanation:'Précisez votre activité.',factIds:[],needsDetails:true,question:'Quelle activité réalisiez-vous ?'};});
 const r=await ops.experience({operationId:crypto.randomUUID(),userId:'synthetic',draft:f.draft,targetId:f.role.id,request:{intent:'point',fingerprint:await experienceFingerprint(f.draft,f.role.id),point:experiencePoints(experienceText(f.draft,f.role.id))[0]}});
 assert.equal(r.needsDetails,'Quelle activité réalisiez-vous ?');assert.equal(seen.length,1);
 const {parseAssessment}=await import('../src/intelligence/experience-assessment.ts');
 const sources=[{id:'p0',point:{start:0,end:12,text:'Rapports SQL'}},{id:'p1',point:{start:13,end:25,text:'Rapports SQL'}}];
 const raw={points:sources.map((p,i)=>({id:p.id,meaningful:true,contribution:'specific',clarity:'partial',specificity:'partial',issue:i?'duplicate':'clarity',duplicateOf:i?'p0':null,strength:null,improvement:i?'Ce point répète le précédent.':null,suggestedQuestion:null})),dimensions:['contribution','methods','scope','outcome'].map(dimension=>({dimension,grade:'missing',evidencePointIds:[]})),experience:null};
 const value=parseAssessment(raw,sources,'fr-FR','complete');assert.equal(value.points[1].improvement,'Ce point répète le précédent.');
});
test('summary-only profiles detect without an experience target and returned decision is fenced after in-flight deletion',async()=>{
 const f=fixture();f.draft.roles=[];f.draft.summary={...f.draft.summary,text:prose,approval:"approved"};f.save();assert.equal((await f.post()).status,200);
 const delayed=fixture();let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 delayed.options.operations=intelligenceOperations(async()=>{started();await gate;return{outcome:'detected',locale:'ro-RO',confidence:'high',labels:{}};});
 const response=delayed.post();await entered;delayed.options.gateway.loadDraft=async()=>null;release();assert.equal((await response).status,409);
});

test('legacy enhancement can normalize a foreign-language answer into the CV language without rewriting evidence',async()=>{
 const {enhancementRoute}=await import('../src/ai/routes.ts');
 const {SyntheticLedger}=await import('../fixtures/synthetic-ledger.ts');
 const f=fixture();f.draft.documentLocale='fr-FR';f.draft.contentLanguage={locale:'fr-FR',confidence:'high',source:'user-correction',policyVersion:'cv-language/1'};
 f.draft.answers=[{id:'answer',targetId:f.role.id,question:'tools',questionText:'Which tools?',text:'I used SQL.',status:'confirmed',sourceId:'answer-source'}];
 const snapshot={id:crypto.randomUUID(),revision:1,payload:encodeDraft(f.draft)},ledger=new SyntheticLedger();let calls=0;
 const gateway={loadSnapshot:async()=>snapshot,reserveEnhancement:async()=>({created:true}),beginAttempt:s=>ledger.begin(s),finishAttempt:(id,r)=>ledger.finish(id,r)};
 const env={AI_PAID_INFERENCE:'on',AI_WORKER_SECRET:'x'.repeat(40),AI_PROCESSING_POLICY:'synthetic',OPENROUTER_API_KEY:'synthetic',OPENAI_API_KEY:'synthetic',OPENROUTER_MODEL:'synthetic/model',OPENROUTER_ENDPOINT:'synthetic',OPENAI_MODEL:'synthetic-model'};
 const response=await enhancementRoute(new Request('https://app.invalid/v1/enhancement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshotId:snapshot.id,snapshotRevision:1,targetId:f.role.id,operationId:crypto.randomUUID()})}),env,gateway,'synthetic',async(_url,init)=>{
  calls++;const body=JSON.parse(init.body);assert.ok(body.messages[0].content.includes('(fr-FR)'));
  return Response.json({id:'synthetic-result',model:body.model,usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30},choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'Utilisation de SQL pour les rapports.',factIds:['answer']})}}]});
 });
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.proposal?.text,'Utilisation de SQL pour les rapports.');assert.equal(result.proposal.sources[0].text,'I used SQL.');assert.equal(calls,1);assert.equal(f.draft.answers[0].text,'I used SQL.');
});

test('direct generation waits for reliable language instead of treating interface fallback as a detection',async()=>{
 const f=fixture();f.save();const snapshotBody=await f.context();
 const response=await intelligenceRoute(new Request('https://app.invalid/v1/intelligence/questions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...snapshotBody,targetId:f.role.id,operationId:crypto.randomUUID()})}),f.options);
 assert.equal(response.status,409);assert.equal((await response.json()).error.code,'CONTENT_LANGUAGE_REQUIRED');assert.equal(f.tasks.length,0);assert.equal(f.reservations.length,0);
});
test('old diagnostic feedback remains readable but is stale after content-language correction',async()=>{
 const {currentExperienceAssessment,experienceText}=await import('@resumora/contracts/intelligence/experience');
 const {experiencePolicy}=await import('@resumora/contracts/intelligence/experience-policy');
 const f=fixture();f.draft.documentLocale='en';
 f.draft.experienceEnrichment={[f.role.id]:{version:1,assessment:{body:experienceText(f.draft,f.role.id),fingerprint:'a'.repeat(64),value:{rubric:'experience-quality/3',feedbackLocale:'en',scope:'complete',experience:null,policyVersion:experiencePolicy.version,score:0,points:[],dimensions:[]}}}};
 assert.ok(currentExperienceAssessment(f.draft,f.role.id));f.draft.contentLanguage={locale:'fr-FR',confidence:'high',source:'user-correction',policyVersion:'cv-language/1'};
 assert.equal(currentExperienceAssessment(f.draft,f.role.id),undefined);assert.equal(f.draft.experienceEnrichment[f.role.id].assessment.value.feedbackLocale,'en');
});

test('configured primary/fallback and streaming keep the full CV language instruction and exact mixed-language evidence',async()=>{
 const {configuredStructuredRunner}=await import('../src/intelligence/configured.ts');
 const {SyntheticLedger}=await import('../fixtures/synthetic-ledger.ts');
 const {experienceFingerprint}=await import('@resumora/contracts/intelligence/experience');
 const f=fixture();f.draft.contentLanguage={locale:'fr-FR',confidence:'high',source:'user-correction',policyVersion:'cv-language/1'};
 f.draft.answers=[{id:'answer',targetId:f.role.id,question:'tools',questionText:'Tools?',text:'I used SQL.',status:'confirmed',sourceId:'answer-source'}];
 const sent=[],ledger=new SyntheticLedger(),seen=[];
 const env={AI_PAID_INFERENCE:'on',AI_WORKER_SECRET:'x'.repeat(40),AI_PROCESSING_POLICY:'synthetic',OPENROUTER_API_KEY:'synthetic',OPENAI_API_KEY:'synthetic',OPENROUTER_MODEL:'synthetic/model',OPENROUTER_ENDPOINT:'synthetic',OPENAI_MODEL:'synthetic-model'};
 const run=configuredStructuredRunner(env,'synthetic',{durability:'durable',begin:s=>ledger.begin(s),finish:(id,r)=>ledger.finish(id,r),report:r=>ledger.report(r)},AbortSignal.timeout(5000),async(_url,init)=>{
  const body=JSON.parse(init.body);sent.push(body);if(sent.length===1)return new Response('',{status:503});
  const data=JSON.parse(body.messages[1].content);assert.equal(data.locale,'fr-FR');assert.ok(data.facts.some(f=>f.text==='I used SQL.'));
  const output={text:'Coordination des activités et des rapports avec SQL.',explanation:'La formulation précise les activités.',factIds:data.facts.map(f=>f.id)};
  const content=JSON.stringify(output),event={id:'synthetic-result',model:body.model,usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30},choices:[{index:0,finish_reason:'stop',delta:{content}}]};
  return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`,{headers:{'Content-Type':'text/event-stream'}});
 });
 const result=await intelligenceOperations(run).experience({operationId:crypto.randomUUID(),userId:'synthetic',draft:f.draft,targetId:f.role.id,onDraft:t=>seen.push(t),request:{intent:'role',fingerprint:await experienceFingerprint(f.draft,f.role.id),feedbackLocale:'en'}});
 assert.equal(result.text,'Coordination des activités et des rapports avec SQL.');assert.equal(sent.length,2);assert.equal(seen.at(-1),result.text);
 for(const body of sent){assert.equal(body.stream,true);assert.ok(body.messages[0].content.includes('(fr-FR)'));}
 const report=await ledger.report({from:'2000-01-01',to:'2099-01-01'});assert.equal(report.totals.attempts,2);assert.ok(report.recent.every(a=>JSON.parse(a.requestFingerprint).includes('fr-FR')));
});

test('explicit bounded language retry requires a terminal failed/unavailable receipt and never bypasses processing work',async()=>{
 const f=fixture();f.setOutput({outcome:'unsupported',locale:null,confidence:'low',labels:{}});
 const first=await f.context();assert.equal((await f.post(first)).status,200);
 const next={...first,languageAttempt:1,operationId:await language.languageDetectionOperationId(f.draft,1)};
 f.setOutput({outcome:'detected',locale:'ro-RO',confidence:'high',labels:{}});assert.equal((await f.post(next)).status,200);assert.equal(f.tasks.length,2);
 const second={...next,languageAttempt:2,operationId:await language.languageDetectionOperationId(f.draft,2)};
 assert.equal((await f.post(second)).status,409);assert.equal(f.tasks.length,2);
 f.receipts.get(next.operationId).state='processing';assert.equal((await f.post(second)).status,409);assert.equal(f.tasks.length,2);
 f.receipts.get(next.operationId).state='unknown';assert.equal((await f.post(second)).status,200);assert.equal(f.tasks.length,3);
 const forged={...first,languageAttempt:4,operationId:crypto.randomUUID()};assert.equal((await f.post(forged)).status,400);assert.equal(f.tasks.length,3);
});

test('import extraction carries multilingual confidence and complete localized labels while preserving source quotations',async()=>{
 const {documentLabelKeys}=await import('@resumora/contracts/editor/document-labels');
 const labels=Object.fromEntries(documentLabelKeys.map(key=>[key,'عنوان']));
 const text='نسقت أنشطة الفريق وراجعت التقارير باستخدام SQL.';
 const extraction={schemaVersion:'cv-extraction/1',detectedLanguage:'ar',languageConfidence:'high',documentLabels:labels,candidates:[{id:'narrative',path:'roles.0.context',value:text,quote:text,page:1,confidence:'high',warning:''}],warnings:[],omittedPages:[]};
 const document={schemaVersion:'document-pages/1',format:'pdf',sha256:'a'.repeat(64),parserVersion:'synthetic',pages:[{number:1,warnings:[]}],fileBase64:Buffer.from('%PDF synthetic').toString('base64'),warnings:[]};
 const seen=[];const extract=output=>intelligenceOperations(async task=>{seen.push(task);return task.stage==='admit'?{kind:'cv',reason:'سيرة ذاتية',pages:[1]}:output;}).extract({operationId:crypto.randomUUID(),userId:'synthetic',document});
 const result=await extract(extraction);assert.equal(result.extraction.detectedLanguage,'ar');assert.equal(result.extraction.languageConfidence,'high');assert.deepEqual(result.extraction.documentLabels,labels);assert.equal(result.extraction.candidates[0].quote,text);assert.equal(result.extraction.candidates[0].value,text);
 await assert.rejects(extract({...extraction,documentLabels:{experience:'عنوان'}}),/AI_OUTPUT_INVALID/);
 await assert.rejects(extract({...extraction,detectedLanguage:null,languageConfidence:'high',documentLabels:{}}),/AI_OUTPUT_INVALID/);
});
test('skill generation retains localized competency labels and established technology names without references',async()=>{
 const {experienceFingerprint}=await import('@resumora/contracts/intelligence/experience');
 const f=fixture();f.draft.documentLocale='fr-FR';f.role.context=fact('I coordinated the team and maintained SQL queries.');
 const ops=intelligenceOperations(async task=>{
  assert.equal(task.input.documentLocale,'fr-FR');
  return{skills:[{label:'Coordination d’équipe',category:'professionalSkills',importance:'core'},{label:'SQL',category:'technicalSkills',importance:'core'}]};
 });
 const result=await ops.experience({operationId:crypto.randomUUID(),userId:'synthetic',draft:f.draft,targetId:f.role.id,request:{intent:'skills',fingerprint:await experienceFingerprint(f.draft,f.role.id)}});
 assert.deepEqual(result.skills.map(s=>s.label).sort(),['Coordination d’équipe','SQL']);assert.ok(result.skills.every(s=>!('evidence' in s)));
});

test('translated versions never inherit base-language labels when target localization is unavailable',async()=>{
 const {builtInDocumentLabels,documentLabels}=await import('@resumora/contracts/editor/document-labels');
 const f=fixture();f.draft.contentLanguage={locale:'ro',confidence:'high',source:'import',policyVersion:'cv-language/1',labels:builtInDocumentLabels('ro')};
 // Legacy lineage can resolve a translated locale above inherited base metadata.
 f.draft.translation={documentLocale:'fr-FR'};
 const ops=intelligenceOperations(async()=>({outcome:'unsupported',locale:null,confidence:'low',labels:{}}));
 const result=await ops.detectLanguage({operationId:crypto.randomUUID(),userId:'synthetic',draft:f.draft});
 assert.equal(result.locale,'fr-FR');assert.equal(result.source,'translation');assert.equal(result.labels,undefined);
 assert.equal(documentLabels({...f.draft,contentLanguage:result}),null);
});

test('concurrent detection tabs share a single reserved inference and pending receipt',async()=>{
 const f=fixture();let release,entered;
 const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);let calls=0;
 f.options.operations=intelligenceOperations(async()=>{calls++;entered();await gate;return{outcome:'detected',locale:'ro-RO',confidence:'high',labels:{}};});
 const context=await f.context(),first=f.post(context);await started;
 assert.equal((await f.post(context)).status,409);release();assert.equal((await first).status,200);
 assert.equal((await f.post(context)).status,200);assert.equal(calls,1);assert.equal(f.reservations.length,1);
});
test('lost detection receipt acknowledgements do not discard validated output or open another paid attempt',async()=>{
 const f=fixture();let saves=0;const waiting=[];const finish=f.options.gateway.finishWorkspaceOperation;
 f.options.waitUntil=p=>waiting.push(p);f.options.gateway.finishWorkspaceOperation=async(...args)=>{if(++saves<=2)throw Error('RECEIPT_UNAVAILABLE');return finish(...args);};
 const context=await f.context(),response=await f.post(context);assert.equal(response.status,200);assert.equal(response.headers.get('X-Result-Receipt'),'pending');assert.equal((await response.json()).locale,'ro-RO');
 await Promise.all(waiting);assert.equal((await f.post(context)).status,200);assert.equal(f.tasks.length,1);assert.equal(f.reservations.length,1);
});

test('a settled narrative language stays authoritative after accepted prose edits while provisional decisions can re-evaluate',async()=>{
 const f=fixture();f.draft.contentLanguage={locale:'ro-RO',confidence:'high',source:'narrative',policyVersion:'cv-language/1',status:'detected',narrativeFingerprint:'a'.repeat(64)};
 assert.equal(await language.hasReliableContentLanguage(f.draft),true);
 f.role.context=fact(prose+' Actualizam procedurile interne.');
 const seen=[];const result=await intelligenceOperations(async task=>{seen.push(task);return{};}).detectLanguage({operationId:crypto.randomUUID(),userId:'synthetic',draft:f.draft});
 assert.equal(result.locale,'ro-RO');assert.equal(result.source,'narrative');assert.equal(seen.length,0);
 f.draft.contentLanguage={...f.draft.contentLanguage,status:'insufficient',confidence:'low'};
 assert.equal(await language.hasReliableContentLanguage(f.draft),false);
});

test('substantial unspaced Khmer and Lao narrative trigger bounded inference without a privileged script list',async()=>{
 const {documentLabelKeys}=await import('@resumora/contracts/editor/document-labels');
 for(const [locale,sentence] of [['km','ខ្ញុំបានរៀបចំរបាយការណ៍និងសម្របសម្រួលការងាររបស់ក្រុម។'],['lo','ຂ້ອຍໄດ້ຈັດເຮັດລາຍງານແລະປະສານງານຂອງທີມ.']]){
  const f=fixture(sentence.repeat(5));f.setOutput({outcome:'detected',locale,confidence:'high',labels:Object.fromEntries(documentLabelKeys.map(key=>[key,'Synthetic localized label']))});
  assert.equal(language.hasSubstantialLanguageNarrative(f.draft),true);
  const response=await f.post();assert.equal(response.status,200);assert.equal((await response.json()).locale,locale);assert.equal(f.tasks.length,1);assert.equal(f.tasks[0].input.mode,'detect');
 }
});

for (const mode of ['detect', 'localize']) {
 for (const fallback of [false, true]) {
  test(`configured runner validates raw ${mode} output before materializing its decision${fallback ? ' after provider fallback' : ''}`, async () => {
   const {configuredStructuredRunner}=await import('../src/intelligence/configured.ts');
   const {SyntheticLedger}=await import('../fixtures/synthetic-ledger.ts');
   const {documentLabelKeys}=await import('@resumora/contracts/editor/document-labels');
   const f=fixture(),ledger=new SyntheticLedger(),sent=[];
   const labels=Object.fromEntries(documentLabelKeys.map(key=>[key,'Libellé français']));
   if(mode==='localize'){
    f.draft.contentLanguage={locale:'fr-FR',confidence:'high',source:'user-correction',policyVersion:'cv-language/1'};
    f.save();
   }
   const env={AI_PAID_INFERENCE:'on',AI_WORKER_SECRET:'x'.repeat(40),AI_PROCESSING_POLICY:'synthetic',OPENROUTER_API_KEY:'synthetic',OPENAI_API_KEY:'synthetic',OPENROUTER_MODEL:'synthetic/model',OPENROUTER_ENDPOINT:'synthetic',OPENAI_MODEL:'synthetic-model'};
   const run=configuredStructuredRunner(env,'synthetic',{durability:'durable',begin:s=>ledger.begin(s),finish:(id,r)=>ledger.finish(id,r),report:r=>ledger.report(r)},AbortSignal.timeout(5000),async(_url,init)=>{
    const body=JSON.parse(init.body);sent.push(body);
    if(fallback&&sent.length===1)return new Response('',{status:503});
    const data=JSON.parse(body.messages[1].content);
    assert.equal(data.mode,mode);
    assert.equal(data.narrative,mode==='detect'?prose:'');
    if(mode==='localize')assert.equal(data.locale,'fr-FR');
    return Response.json({id:'synthetic-language-result',model:body.model,usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30},choices:[{finish_reason:'stop',message:{content:JSON.stringify({outcome:'detected',locale:'fr-FR',confidence:'medium',labels})}}]});
   });
   f.options.operations=intelligenceOperations(run);
   const context=await f.context(),response=await f.post(context);
   assert.equal(response.status,200);
   const decision=await response.json();
   assert.equal(decision.locale,'fr-FR');
   assert.equal(decision.source,mode==='detect'?'narrative':'user-correction');
   assert.equal(decision.confidence,mode==='detect'?'medium':'high');
   assert.equal(decision.status,'detected');
   assert.deepEqual(decision.labels,labels);
   assert.match(decision.narrativeFingerprint,/^[a-f0-9]{64}$/);
   assert.equal(f.receipts.get(context.operationId).state,'ready');
   assert.deepEqual(f.receipts.get(context.operationId).result,decision);
   assert.equal(f.reservations.length,1);
   assert.equal(sent.length,fallback?2:1);
   const report=await ledger.report({from:'2000-01-01',to:'2099-01-01'});
   assert.equal(report.totals.attempts,fallback?2:1);
   assert.equal(report.recent.filter(a=>a.result?.status==='completed').length,1);
   assert.equal((await f.post(context)).status,200);
   assert.equal(sent.length,fallback?2:1);
  });
 }
}

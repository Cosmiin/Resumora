import { selfContainedJobDraft,type CurrentJobDocument } from '@resumora/contracts/jobs/current-document';
import type { CurrentDocumentGateway } from './current-documents.ts';
import { publicJobUrl } from './url.ts';
import { isUuid,type SavedJob } from '@resumora/contracts/jobs/connected';
import { tailorTargets,deriveJobSuggestions,fingerprint,jobClarificationQuestion,validateVacancy,validateTailor,eligibleEvidence,evidenceCoverage,type JobWorkflow,type Vacancy,type WorkflowOperation,type TailorProposal,type MatchResult } from '@resumora/contracts/jobs/workflow';
import { jobEditorFacts,type JobEditorPayload,type JobEditorGateway } from '@resumora/contracts/jobs/documents';
import { decodeDraft,encodeDraft,type DraftSnapshot } from '@resumora/contracts/editor/transport';
import { isAuthored } from '@resumora/contracts/editor/model';
import { privateJson,routeError } from './routes.ts';
import { readBody } from '../cv/routes.ts';
export interface WorkflowGateway extends CurrentDocumentGateway {
 saveDraft(input:{requestId:string;expectedRevision:number;mode:'autosave'|'checkpoint';payload:ReturnType<typeof encodeDraft>}):Promise<DraftSnapshot>;
 getJob(id:string):Promise<SavedJob|null>;loadDraft():Promise<DraftSnapshot|null>;
 getJobWorkflow(id:string):Promise<JobWorkflow&{actions?:Record<string,string>}>;
 reviewJobWorkflow(input:{requestId:string;jobId:string;revision:number;value:Vacancy}):Promise<JobWorkflow>;
 requestJobWorkflow(input:{requestId:string;jobId:string;kind:string;revision:number;targetId?:string;locale?:'ro'|'en'}):Promise<WorkflowOperation>;
 cancelJobWorkflow(jobId:string,operationId:string):Promise<unknown>;
 jobWorkflowAction(input:{requestId:string;jobId:string;revision:number;id:string;state:string}):Promise<JobWorkflow>;
 linkJobSourceVersion(input:{requestId:string;jobId:string;parentId:string;revision:number}):Promise<JobWorkflow>;
 acceptJobTailor(input:{requestId:string;jobId:string;operationId:string;documentId:string|null;expectedRevision:number;payload:JobEditorPayload}):Promise<unknown>;
}
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export async function jobWorkflowRoute(request:Request,gateway:WorkflowGateway,aiEnabled=false){
 const url=new URL(request.url),m=/^\/v1\/jobs\/([^/]+)\/workflow(?:\/(review|extract|fetch|match|tailor|prepare|cancel|action|accept|source|clarify))?$/.exec(url.pathname);
 if(!m||!isUuid(m[1])||([...url.searchParams.keys()].some(k=>k!=='locale')||url.searchParams.getAll('locale').length>1||(url.searchParams.has('locale')&&!['ro','en'].includes(url.searchParams.get('locale')!))||(request.method!=='GET'&&!!url.search)))return privateJson({error:{code:'invalidRequest'}},400);const [,jobId,action]=m;const selectedLocale=url.searchParams.get('locale') as 'ro'|'en'|null;
 if(request.method!==(action?'POST':'GET'))return privateJson({error:{code:'method'}},405);
 try{
  const job=await gateway.getJob(jobId);if(!job)return privateJson({error:{code:'missing'}},404);
  const workflow=await gateway.getJobWorkflow(jobId);
  if(!action){const base=await gateway.loadDraft(),document=await gateway.loadCurrentJobDocument(jobId,selectedLocale??undefined);const latest=workflow.operations.find(o=>o.kind==='match'&&o.state==='ready'&&o.jobRevision===workflow.revision&&o.snapshotId===base?.id&&(o.documentVersionId??null)===(document?.id??null));
   const vacancy=workflow.reviewed??workflow.extracted;
   const d=base?decodeDraft(base.payload):null,targetLocale=selectedLocale??d?.language??document?.locale??null,targetDocument=targetLocale?await gateway.loadCurrentJobDocument(jobId,targetLocale):null,currentSections=d?[{id:'summary',label:'Professional summary',text:d.summary.text},{id:'professionalSkills',label:'Professional skills',text:d.professionalSkills.map(f=>f.value).join(', ')},{id:'technicalSkills',label:'Technical skills',text:d.technicalSkills.map(f=>f.value).join(', ')},...d.roles.map(r=>({id:r.id,label:[r.title.value,r.company.value].filter(Boolean).join(' — '),questionLabel:r.title.value||r.id,text:[r.context.value,...r.bullets.map(b=>b.value)].join('\n')})),...d.optionalSections.filter(s=>s.kind!=='languages').flatMap(s=>s.entries.map(e=>({id:e.id,label:e.title.value||s.label,questionLabel:e.title.value||e.id,text:[e.details.value,...(e.bullets??[]).map(b=>b.value)].join('\n')})))]:[];
   return privateJson({...workflow,sourceText:job.intake.text,suggestions:latest&&vacancy&&d?await deriveJobSuggestions(vacancy,latest.result as MatchResult,eligibleEvidence(d),{revision:workflow.revision,snapshotId:base!.id,actions:workflow.actions??{}}):[],aiEnabled,currentSnapshotId:base?.id??null,currentDocumentVersionId:document?.id??null,documentLocale:document?.locale??selectedLocale,targetLocale,currentTargetDocumentVersionId:targetDocument?.id??null,currentSnapshotRevision:base?.revision??null,currentSections,skillLabels:d?Object.fromEntries([...d.professionalSkills,...d.technicalSkills].map(f=>[f.id,f.value])):{},...(latest&&vacancy?{coverage:{profile:evidenceCoverage(vacancy,latest.result as MatchResult,'profile'),cv:evidenceCoverage(vacancy,latest.result as MatchResult,'cv')}}:{})});}
  const body=await readBody(request);if(body instanceof Response)return body;
  if(action==='cancel'){if(!exact(body,['operationId'])||!isUuid(body.operationId))throw Error('invalidRequest');return privateJson(await gateway.cancelJobWorkflow(jobId,body.operationId));}
  if(!isUuid(body.requestId))throw Error('invalidRequest');
  if(action==='accept'){
   if(!exact(body,['requestId','operationId','documentId','expectedRevision','decisions'])||!isUuid(body.operationId)||!(body.documentId===null||isUuid(body.documentId))||!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0||!Array.isArray(body.decisions)||!body.decisions.length||body.decisions.length>200)throw Error('invalidRequest');
   const operation=workflow.operations.find(o=>o.id===body.operationId&&o.kind==='tailor'&&o.state==='ready');
   const base=await gateway.loadDraft();if(!operation||!base||operation.snapshotId!==base.id||operation.jobRevision!==workflow.revision)return privateJson({error:{code:'stale'}},409);
   const draft=decodeDraft(base.payload);if(operation.targetLocale)draft.language=operation.targetLocale;const vacancy=workflow.reviewed??workflow.extracted;if(!vacancy)throw Error('invalidRequest');
   const sourceDocument=await gateway.loadCurrentJobDocument(jobId,operation.documentLocale??undefined),prior=await gateway.loadCurrentJobDocument(jobId,operation.targetLocale??draft.language);if((prior?.documentId??null)!==body.documentId||(prior?.revision??0)!==body.expectedRevision||(operation.documentVersionId??null)!==(sourceDocument?.id??null)||(operation.targetDocumentVersionId??null)!==(prior?.id??null))return privateJson({error:{code:'stale'}},409);
   const combined=new Map<string,import('@resumora/contracts/jobs/workflow').TailorSection>();
   for(const o of [operation,...workflow.operations.filter(o=>o.id!==operation.id&&o.kind==='tailor'&&o.state==='ready'&&o.result&&o.snapshotId===operation.snapshotId&&o.jobRevision===operation.jobRevision&&(o.documentVersionId??null)===(operation.documentVersionId??null))])for(const section of (o.result as TailorProposal).sections)if(!combined.has(section.targetId))combined.set(section.targetId,section);
   const proposal:TailorProposal={schemaVersion:'job-tailor/1',sections:[...combined.values()]};
   if(!proposal||proposal.schemaVersion!=='job-tailor/1')throw Error('invalidRequest');
   const evidence=eligibleEvidence(draft),accepted=prior&&prior.provenance.sourceSnapshotId===base.id?decodeDraft(prior.payload):structuredClone(draft);
   if(prior){const p=decodeDraft(prior.payload).presentation;for(const key of ['templateVersionId','photo'] as const){if(p[key]===undefined)delete accepted.presentation[key];else Object.assign(accepted.presentation,{[key]:p[key]});}}
   const targets=new Set<string>();
   for(const d of body.decisions){if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['targetId','accept','text'].includes(k))||typeof d.targetId!=='string'||typeof d.accept!=='boolean'||(d.text!==undefined&&(typeof d.text!=='string'||!d.text.trim()||d.text.length>20000))||targets.has(d.targetId))throw Error('invalidRequest');targets.add(d.targetId);
    const s=proposal.sections.find(s=>s.targetId===d.targetId);if(!s)throw Error('invalidRequest');if(!d.accept||s.action==='retain')continue;
    const current={...s,...(d.text!==undefined?{text:d.text}:{})};validateTailor({schemaVersion:'job-tailor/1',sections:[current]},draft,vacancy,evidence,s.targetId);
    if(s.targetId==='summary')accepted.summary={...accepted.summary,text:current.text,approval:'approved'};
    else if(s.targetId==='professionalSkills')accepted.professionalSkills=s.skillIds.map(id=>structuredClone(draft.professionalSkills.find(f=>f.id===id)!));
    else if(s.targetId==='technicalSkills')accepted.technicalSkills=s.skillIds.map(id=>structuredClone(draft.technicalSkills.find(f=>f.id===id)!));
    else {const target=accepted.roles.find(r=>r.id===s.targetId)??accepted.optionalSections.flatMap(s=>s.entries).find(e=>e.id===s.targetId);if(!target)throw Error('invalidRequest');const field='context' in target?target.context:target.details;field.value=current.text;field.status=d.text!==undefined?'user_authored':'draft';target.bullets=[];delete accepted.presentation.approvedWording?.[s.targetId];delete accepted.presentation.contributionHtml?.[s.targetId];}
   }
   return privateJson(await gateway.saveCurrentJobDocument({requestId:body.requestId,jobId,locale:accepted.language,documentId:body.documentId as string|null,expectedRevision:Number(body.expectedRevision),baseSnapshotId:base.id,payload:encodeDraft(selfContainedJobDraft(accepted)),operationId:body.operationId,provenance:{sourceSnapshotId:base.id,sourceRevision:base.revision,jobRevision:workflow.revision,acceptedTargets:[...targets],generatedTargets:body.decisions.filter((d:any)=>d.accept&&d.text===undefined).map((d:any)=>d.targetId)}}));
  }
  if(!Number.isSafeInteger(body.revision)||Number(body.revision)<1)throw Error('invalidRequest');
  if(action==='clarify'){
   if(!exact(body,['requestId','revision','snapshotId','snapshotRevision','requirementId','targetId','outcome','text'])||!isUuid(body.snapshotId)||!Number.isSafeInteger(body.snapshotRevision)||Number(body.snapshotRevision)<1||typeof body.requirementId!=='string'||typeof body.targetId!=='string'||!['answer','no','unknown','skip'].includes(String(body.outcome))||typeof body.text!=='string'||body.text.length>6000||body.outcome==='answer'&&!body.text.trim())throw Error('invalidRequest');
   if(body.revision!==workflow.revision)return privateJson({error:{code:'stale'}},409);
   const source=await gateway.loadSnapshot(body.snapshotId);if(!source||source.revision!==body.snapshotRevision)return privateJson({error:{code:'missing'}},404);
   const base=decodeDraft(source.payload),requirement=(workflow.reviewed??workflow.extracted)?.requirements.find(r=>r.id===body.requirementId),target=base.roles.find(r=>r.id===body.targetId)??base.optionalSections.filter(s=>s.kind!=='languages').flatMap(s=>s.entries).find(e=>e.id===body.targetId);
   if(!requirement||!target)throw Error('invalidRequest');
   const plannedQuestionId='job_requirement_'+await fingerprint({requirement:requirement.text.trim().toLocaleLowerCase(),target:target.id});
   if(base.answers.some(a=>a.plannedQuestionId===plannedQuestionId&&a.status!=='draft'))return privateJson({alreadyAnswered:true});
   const sourceId='job_answer_'+body.requestId;
   base.sources.push({id:sourceId,kind:'answer',label:'Saved job clarification'});
   base.answers.push({id:body.requestId,targetId:target.id,question:'context',questionText:jobClarificationQuestion(requirement.text,target.title.value||target.id),plannedQuestionId,text:body.outcome==='no'?'No':body.text,status:body.outcome==='skip'?'skipped':body.outcome==='unknown'?'unknown':'confirmed',sourceId});
   const saved=await gateway.saveDraft({requestId:body.requestId,expectedRevision:source.revision,mode:'autosave',payload:encodeDraft(base)});
   return privateJson({saved:true,snapshotId:saved.id,revision:saved.revision,requiresMatchRefresh:true});
  }
  if(action==='source'){if(!exact(body,['requestId','revision','parentId'])||!isUuid(body.parentId))throw Error('invalidRequest');return privateJson(await gateway.linkJobSourceVersion({requestId:body.requestId,jobId,parentId:body.parentId,revision:Number(body.revision)}));}
  if(action==='review'){if(!exact(body,['requestId','revision','value']))throw Error('invalidRequest');return privateJson(await gateway.reviewJobWorkflow({requestId:body.requestId,jobId,revision:Number(body.revision),value:validateVacancy(body.value,job.intake.text,true)}));}
  if(action==='action'){if(!exact(body,['requestId','revision','id','state'])||typeof body.id!=='string'||!body.id||body.id.length>256||!['include','dismissed','skipped','completed'].includes(String(body.state)))throw Error('invalidRequest');return privateJson(await gateway.jobWorkflowAction({requestId:body.requestId,jobId,revision:Number(body.revision),id:body.id,state:String(body.state)}));}
  if(!exact(body,['requestId','revision',...(body.targetId===undefined?[]:['targetId']),...(body.locale===undefined?[]:['locale'])])||(body.locale!==undefined&&(!['ro','en'].includes(String(body.locale))||!['match','prepare','tailor'].includes(action)))||(body.targetId!==undefined&&(typeof body.targetId!=='string'||!body.targetId||body.targetId.length>256||action!=='tailor')))throw Error('invalidRequest');
  if(action==='fetch'){if(job.intake.text.trim()||!job.intake.sourceUrl)throw Error('invalidRequest');publicJobUrl(job.intake.sourceUrl);}
  if(action==='extract'&&!job.intake.text.trim())throw Error('invalidRequest');
  if(body.targetId!==undefined){const base=await gateway.loadDraft();if(!base||!tailorTargets(decodeDraft(base.payload)).includes(body.targetId as string))throw Error('invalidRequest');}
  return privateJson(await gateway.requestJobWorkflow({requestId:body.requestId,jobId,kind:action,revision:Number(body.revision),...(body.locale?{locale:body.locale as 'ro'|'en'}:{}),...(typeof body.targetId==='string'?{targetId:body.targetId}:{})}),202);
 }catch(error){if(error instanceof Error&&error.message==='INVALID_WORKFLOW_OUTPUT')return privateJson({error:{code:'invalidRequest'}},400);return routeError(error);}
}

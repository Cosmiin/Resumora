import { selfContainedJobDraft,type CurrentJobDocument } from '@resumora/contracts/jobs/current-document';
import type { CurrentDocumentGateway } from './current-documents.ts';
import { publicJobUrl } from './url.ts';
import { isUuid,type SavedJob } from '@resumora/contracts/jobs/connected';
import { validateVacancy,validateTailor,eligibleEvidence,evidenceCoverage,type JobWorkflow,type Vacancy,type WorkflowOperation,type TailorProposal,type MatchResult } from '@resumora/contracts/jobs/workflow';
import { jobEditorFacts,type JobEditorPayload,type JobEditorGateway } from '@resumora/contracts/jobs/documents';
import { decodeDraft,encodeDraft,type DraftSnapshot } from '@resumora/contracts/editor/transport';
import { isAuthored } from '@resumora/contracts/editor/model';
import { privateJson,routeError } from './routes.ts';
import { readBody } from '../cv/routes.ts';
export interface WorkflowGateway extends CurrentDocumentGateway {
 getJob(id:string):Promise<SavedJob|null>;loadDraft():Promise<DraftSnapshot|null>;
 getJobWorkflow(id:string):Promise<JobWorkflow&{actions?:Record<string,string>}>;
 reviewJobWorkflow(input:{requestId:string;jobId:string;revision:number;value:Vacancy}):Promise<JobWorkflow>;
 requestJobWorkflow(input:{requestId:string;jobId:string;kind:string;revision:number;targetId?:string}):Promise<WorkflowOperation>;
 cancelJobWorkflow(jobId:string,operationId:string):Promise<unknown>;
 jobWorkflowAction(input:{requestId:string;jobId:string;revision:number;id:string;state:string}):Promise<JobWorkflow>;
 linkJobSourceVersion(input:{requestId:string;jobId:string;parentId:string;revision:number}):Promise<JobWorkflow>;
 acceptJobTailor(input:{requestId:string;jobId:string;operationId:string;documentId:string|null;expectedRevision:number;payload:JobEditorPayload}):Promise<unknown>;
}
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export async function jobWorkflowRoute(request:Request,gateway:WorkflowGateway,aiEnabled=false){
 const url=new URL(request.url),m=/^\/v1\/jobs\/([^/]+)\/workflow(?:\/(review|extract|match|tailor|prepare|cancel|action|accept|source))?$/.exec(url.pathname);
 if(!m||!isUuid(m[1])||url.search)return privateJson({error:{code:'invalidRequest'}},400);const [,jobId,action]=m;
 if(request.method!==(action?'POST':'GET'))return privateJson({error:{code:'method'}},405);
 try{
  const job=await gateway.getJob(jobId);if(!job)return privateJson({error:{code:'missing'}},404);
  const workflow=await gateway.getJobWorkflow(jobId);
  if(!action){const base=await gateway.loadDraft(),document=await gateway.loadCurrentJobDocument(jobId);const latest=workflow.operations.find(o=>o.kind==='match'&&o.state==='ready'&&o.jobRevision===workflow.revision&&o.snapshotId===base?.id&&(o.documentVersionId??null)===(document?.id??null));
   const vacancy=workflow.reviewed??workflow.extracted;return privateJson({...workflow,aiEnabled,currentSnapshotId:base?.id??null,currentDocumentVersionId:document?.id??null,...(latest&&vacancy?{coverage:{profile:evidenceCoverage(vacancy,latest.result as MatchResult,'profile'),cv:evidenceCoverage(vacancy,latest.result as MatchResult,'cv')}}:{})});}
  const body=await readBody(request);if(body instanceof Response)return body;
  if(action==='cancel'){if(!exact(body,['operationId'])||!isUuid(body.operationId))throw Error('invalidRequest');return privateJson(await gateway.cancelJobWorkflow(jobId,body.operationId));}
  if(!isUuid(body.requestId))throw Error('invalidRequest');
  if(action==='accept'){
   if(!exact(body,['requestId','operationId','documentId','expectedRevision','decisions'])||!isUuid(body.operationId)||!(body.documentId===null||isUuid(body.documentId))||!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0||!Array.isArray(body.decisions)||!body.decisions.length||body.decisions.length>200)throw Error('invalidRequest');
   const operation=workflow.operations.find(o=>o.id===body.operationId&&o.kind==='tailor'&&o.state==='ready');
   const base=await gateway.loadDraft();if(!operation||!base||operation.snapshotId!==base.id||operation.jobRevision!==workflow.revision)return privateJson({error:{code:'stale'}},409);
   const draft=decodeDraft(base.payload),vacancy=workflow.reviewed??workflow.extracted;if(!vacancy)throw Error('invalidRequest');
   const prior=await gateway.loadCurrentJobDocument(jobId);if((prior?.documentId??null)!==body.documentId||(prior?.revision??0)!==body.expectedRevision||(operation.documentVersionId??null)!==(prior?.id??null))return privateJson({error:{code:'stale'}},409);
   const proposal=operation.result as TailorProposal;
   if(!proposal||proposal.schemaVersion!=='job-tailor/1')throw Error('invalidRequest');
   const evidence=eligibleEvidence(draft),accepted=prior&&prior.provenance.sourceSnapshotId===base.id?decodeDraft(prior.payload):structuredClone(draft);
   if(prior){const p=decodeDraft(prior.payload).presentation;accepted.presentation.templateVersionId=p.templateVersionId;accepted.presentation.photo=p.photo;}
   const targets=new Set<string>();
   for(const d of body.decisions){if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['targetId','accept','text'].includes(k))||typeof d.targetId!=='string'||typeof d.accept!=='boolean'||(d.text!==undefined&&(typeof d.text!=='string'||!d.text.trim()||d.text.length>20000))||targets.has(d.targetId))throw Error('invalidRequest');targets.add(d.targetId);
    const s=proposal.sections.find(s=>s.targetId===d.targetId);if(!s)throw Error('invalidRequest');if(!d.accept||s.action==='retain')continue;
    const current={...s,...(d.text!==undefined?{text:d.text}:{})};validateTailor({schemaVersion:'job-tailor/1',sections:[current]},draft,vacancy,evidence,s.targetId);
    if(s.targetId==='summary')accepted.summary={...accepted.summary,text:current.text,approval:'approved'};
    else if(s.targetId==='professionalSkills')accepted.professionalSkills=s.skillIds.map(id=>structuredClone(draft.professionalSkills.find(f=>f.id===id)!));
    else if(s.targetId==='technicalSkills')accepted.technicalSkills=s.skillIds.map(id=>structuredClone(draft.technicalSkills.find(f=>f.id===id)!));
    else {const target=accepted.roles.find(r=>r.id===s.targetId)??accepted.optionalSections.flatMap(s=>s.entries).find(e=>e.id===s.targetId);if(!target)throw Error('invalidRequest');const field='context' in target?target.context:target.details;field.value=current.text;field.status=d.text!==undefined?'user_authored':'draft';target.bullets=[];delete accepted.presentation.approvedWording?.[s.targetId];delete accepted.presentation.contributionHtml?.[s.targetId];}
   }
   return privateJson(await gateway.saveCurrentJobDocument({requestId:body.requestId,jobId,locale:accepted.language,documentId:body.documentId as string|null,expectedRevision:Number(body.expectedRevision),baseSnapshotId:base.id,payload:encodeDraft(selfContainedJobDraft(accepted)),operationId:body.operationId,provenance:{sourceSnapshotId:base.id,sourceRevision:base.revision,jobRevision:workflow.revision,acceptedTargets:[...targets]}}));
  }
  if(!Number.isSafeInteger(body.revision)||Number(body.revision)<1)throw Error('invalidRequest');
  if(action==='source'){if(!exact(body,['requestId','revision','parentId'])||!isUuid(body.parentId))throw Error('invalidRequest');return privateJson(await gateway.linkJobSourceVersion({requestId:body.requestId,jobId,parentId:body.parentId,revision:Number(body.revision)}));}
  if(action==='review'){if(!exact(body,['requestId','revision','value']))throw Error('invalidRequest');return privateJson(await gateway.reviewJobWorkflow({requestId:body.requestId,jobId,revision:Number(body.revision),value:validateVacancy(body.value,job.intake.text,true)}));}
  if(action==='action'){if(!exact(body,['requestId','revision','id','state'])||typeof body.id!=='string'||!body.id||body.id.length>256||!['include','dismissed','skipped','completed'].includes(String(body.state)))throw Error('invalidRequest');return privateJson(await gateway.jobWorkflowAction({requestId:body.requestId,jobId,revision:Number(body.revision),id:body.id,state:String(body.state)}));}
  if(!exact(body,body.targetId===undefined?['requestId','revision']:['requestId','revision','targetId'])||(body.targetId!==undefined&&(typeof body.targetId!=='string'||!body.targetId||body.targetId.length>256||action!=='tailor')))throw Error('invalidRequest');
  return privateJson(await gateway.requestJobWorkflow({requestId:body.requestId,jobId,kind:action,revision:Number(body.revision),...(typeof body.targetId==='string'?{targetId:body.targetId}:{})}),202);
 }catch(error){if(error instanceof Error&&error.message==='INVALID_WORKFLOW_OUTPUT')return privateJson({error:{code:'invalidRequest'}},400);return routeError(error);}
}

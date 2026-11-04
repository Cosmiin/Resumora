import type { ContentLocale } from "../editor/content-language.ts";
import { currentWording } from '../editor/wording.ts';
import { isUuid } from './connected.ts';
import { encodeDraft,decodeDraft,type EditorWireEnvelope } from '../editor/transport.ts';
import type { BaseDraft,Fact } from '../editor/model.ts';
import { projectJobEditor,type JobEditorPayload } from './documents.ts';
/** fingerprint hashes THIS current accepted payload (content + presentation).
 * provenance.sourceFingerprint instead identifies its historical source Base. */
export type CurrentJobDocument={id:string;documentId:string;revision:number;fingerprint:string;locale:ContentLocale;createdAt:string;provenance:Record<string,unknown>;payload:EditorWireEnvelope};
export type CurrentJobSourcePin={documentId:string;currentId:string;fingerprint:string;revision:number};
export type CurrentJobWrite={requestId:string;jobId:string;locale:string;documentId:string|null;expectedRevision:number;payload:EditorWireEnvelope;baseSnapshotId:string|null;operationId?:string;provenance?:Record<string,unknown>;sourceCurrent?:CurrentJobSourcePin};
/** Shape only; authority/current equality must be checked under SQL row locks. */
export function isCurrentJobSourcePin(v:unknown):v is CurrentJobSourcePin{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;const p=v as Record<string,unknown>;
 return Object.keys(p).sort().join(',')==='currentId,documentId,fingerprint,revision'&&isUuid(p.documentId)&&isUuid(p.currentId)&&typeof p.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(p.fingerprint)&&Number.isSafeInteger(p.revision)&&Number(p.revision)>0;
}

/** Accepted DOCUMENT content only. Never a factual profile or reusable answer
 * archive. Generated text stays identifiable through opaque document provenance. */
export function selfContainedJobDraft(input:BaseDraft):BaseDraft{
 const d=structuredClone(input);
 for(const target of [...d.roles,...d.optionalSections.filter(s=>s.kind!=='languages').flatMap(s=>s.entries)]){
  const wording=currentWording(input,target.id,true);
  if(wording!==null){
   const field='context' in target?target.context:target.details;
   field.value=wording;field.status='draft';
   if(input.presentation.approvedWording?.[target.id]?.scope==='experience')target.bullets=[];
  }
 }
 delete d.nameParts;delete d.importReview;delete d.importSkillChoices;delete d.questionPlans;delete d.roleRewriteReviews;delete d.experienceEnrichment;delete d.skillReserves;delete d.skillReview;delete d.skillExclusions;d.referenceProse=[];d.answers=[];
 delete d.presentation.approvedWording;delete d.presentation.contributionHtml;
 const clean=(v:unknown)=>{if(!v||typeof v!=='object')return;for(const value of Object.values(v)){if(Array.isArray(value))value.forEach(clean);else clean(value);}const f=v as Partial<Fact>;if(typeof f.fieldId==='string'&&typeof f.sourceId==='string'){f.sourceId='job_document';delete f.sourceClaimId;delete f.sourceLineage;}};
 clean(d);d.sources=[{id:'job_document',kind:'document',label:'Accepted job CV content'}];
 return decodeDraft(encodeDraft(d));
}
export function materializeJobDocument(source:EditorWireEnvelope,payload:JobEditorPayload){return encodeDraft(selfContainedJobDraft(projectJobEditor(source,payload)));}

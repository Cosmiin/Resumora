import { isUuid } from './connected.ts';
import { encodeDraft,decodeDraft,type EditorWireEnvelope } from '../editor/transport.ts';
import type { BaseDraft,Fact } from '../editor/model.ts';
import { projectJobEditor,type JobEditorPayload } from './documents.ts';
/** fingerprint hashes THIS current accepted payload (content + presentation).
 * provenance.sourceFingerprint instead identifies its historical source Base. */
export type CurrentJobDocument={id:string;documentId:string;revision:number;fingerprint:string;locale:'ro'|'en';createdAt:string;provenance:Record<string,unknown>;payload:EditorWireEnvelope};
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
 const d=structuredClone(input),hidden=new Set(d.presentation.hidden),fields=new Set(d.presentation.hiddenFields??[]);
 delete d.nameParts;delete d.importReview;delete d.questionPlans;delete d.roleRewriteReviews;d.referenceProse=[];d.answers=[];
 if(hidden.has('identity')){d.name.value='';d.titles.forEach(t=>t.value='');d.contacts=[];delete d.nameParts;}
 d.contacts=d.contacts.filter(c=>c.visible&&!fields.has(c.value.fieldId));
 if(hidden.has('summary'))d.summary.text='';
 if(hidden.has('professionalSkills'))d.professionalSkills=[];if(hidden.has('technicalSkills'))d.technicalSkills=[];
 if(hidden.has('experience'))d.roles=[];if(hidden.has('education'))d.education=[];
 d.optionalSections=d.optionalSections.filter(s=>!hidden.has(s.id));
 d.professionalSkills=d.professionalSkills.filter(f=>!fields.has(f.fieldId));d.technicalSkills=d.technicalSkills.filter(f=>!fields.has(f.fieldId));
 const wording=d.presentation.approvedWording??{};
 for(const target of [...d.roles,...d.optionalSections.filter(s=>s.kind!=='languages').flatMap(s=>s.entries)]){
  const field='context' in target?target.context:target.details;
  if(wording[target.id]&&!fields.has(field.fieldId)){field.value=wording[target.id].text;field.status='draft';target.bullets=[];}
  else if(fields.has(`${target.id}-contributions`))target.bullets=[];
 }
 delete d.presentation.approvedWording;delete d.presentation.contributionHtml;
 // Retain only visible field values; replace source references with one
 // job-local source marker and remove upload/claim lineage and raw source text.
 const clean=(v:unknown)=>{if(!v||typeof v!=='object')return;for(const value of Object.values(v)){if(Array.isArray(value))value.forEach(clean);else clean(value);}const f=v as Partial<Fact>;if(typeof f.fieldId==='string'&&Object.hasOwn(f,'value')){if(fields.has(f.fieldId))f.value=typeof f.value==='boolean'?false:typeof f.value==='object'?{year:'',month:''}:'';f.sourceId='job_document';delete f.sourceClaimId;delete f.sourceLineage;}};
 clean(d);d.sources=[{id:'job_document',kind:'document',label:'Accepted job CV content'}];
 // Keep settings/IDs needed to render this accepted document. There is no hidden
 // source underneath the settings that can later resurrect removed content.
 return decodeDraft(encodeDraft(d));
}
export function materializeJobDocument(source:EditorWireEnvelope,payload:JobEditorPayload){return encodeDraft(selfContainedJobDraft(projectJobEditor(source,payload)));}

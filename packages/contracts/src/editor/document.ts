import { currentWording } from './wording.ts';
import { encodeDraft, decodeDraft } from './transport.ts';
import type { BaseDraft, Fact } from './model.ts';
export function selfContainedDocumentDraft(input:BaseDraft):BaseDraft{
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
 const clean=(v:unknown)=>{if(!v||typeof v!=='object')return;for(const value of Object.values(v)){if(Array.isArray(value))value.forEach(clean);else clean(value);}const f=v as Partial<Fact>;if(typeof f.fieldId==='string'&&typeof f.sourceId==='string'){f.sourceId='accepted_document';delete f.sourceClaimId;delete f.sourceLineage;}};
 clean(d);d.sources=[{id:'accepted_document',kind:'document',label:'Accepted CV content'}];
 return decodeDraft(encodeDraft(d));
}

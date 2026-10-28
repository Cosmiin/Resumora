import type { BaseDraft, Fact } from '../editor/model.ts';
import { answerEvidenceText } from './model.ts';
export type CareerFact={id:string;text:string;sourceId:string;sourceClaimId?:string;sourceLineage?:{sourceId:string;sourceClaimId?:string}[]};
export type CareerContext={targetId:string;locale:'ro'|'en';facts:CareerFact[]};
/** Already owned snapshot only. Contact/identity/whole-document sources are deliberately excluded. */
export function careerContext(draft:BaseDraft,targetId:string):CareerContext{
  const role=draft.roles.find(r=>r.id===targetId),entry=draft.optionalSections.filter(s=>s.kind!=='languages').flatMap(s=>s.entries).find(e=>e.id===targetId);
  if(!role&&!entry)throw new Error('INVALID_TARGET');
  const fields:Fact<string>[]=(role?[role.context,...role.bullets]:[entry!.details,...(entry!.bullets??[])]).filter(f=>['user_confirmed','user_authored'].includes(f.status)&&f.value.trim());
  const facts:CareerFact[]=fields.map(f=>({id:f.id,text:f.value,sourceId:f.sourceId,...(f.sourceClaimId?{sourceClaimId:f.sourceClaimId}:{}),...(f.sourceLineage?{sourceLineage:structuredClone(f.sourceLineage)}:{})}));
  for(const a of draft.answers.filter(a=>a.targetId===targetId&&a.status==='confirmed'&&a.sourceId&&answerEvidenceText(a).trim())){
    const value=answerEvidenceText(a);
    if(!fields.some(f=>f.fieldId===a.cvFieldId&&f.value===value&&f.sourceId===a.sourceId))facts.push({id:a.id,text:value,sourceId:a.sourceId!});
  }
  if(!facts.length||facts.length>24||new Set(facts.map(f=>f.id)).size!==facts.length||facts.some(f=>!f.sourceId||f.text.length>2000)||facts.reduce((n,f)=>n+f.text.length,0)>8000)throw new Error('INVALID_SCOPED_CONTEXT');
  return {targetId,locale:draft.language,facts};
}

import { skillInventoryPolicy } from '../intelligence/skill-keywords.ts';
import type { ContentLocale } from "../editor/content-language.ts";
import { isAccepted, type BaseDraft } from '../editor/model.ts';
import { currentWording } from '../editor/wording.ts';
import { jobEditorFacts } from './documents.ts';
import { answerEvidenceText } from '../intelligence/model.ts';
export const categories = ['technical','responsibilities','experience','achievements','qualifications','professional','title','domain','languages','conditions'] as const;
export type Category = typeof categories[number];
export type Span = { start: number; end: number; quote: string };
export type JobRequirement = { id: string; text: string; categories: Category[]; priority: 'required'|'preferred'|'unspecified'; emphasis: 'central'|'supporting'|'unknown'; operator: 'and'|'or'; components: {id:string;text:string}[]; evidence: Span[]; eligibility: boolean; origin: 'extracted'|'manual' };
export const overviewFields = ['title','company','location','workArrangement','geographicEligibility','employmentType','contractDuration','workingHours','travel','salary','experience','education','certifications','languages','postedAt','updatedAt','deadline','applicationUrl'] as const;
export type Vacancy = { schemaVersion:'vacancy-extraction/3'; sourceLocale:string|null; overview: Record<typeof overviewFields[number], {value:string;evidence:Span[]}|null>; requirements:JobRequirement[]; issues:{kind:'ambiguity'|'conflict'|'incomplete';message:string;evidence:Span[]}[]; completeness:'complete'|'partial' };
export type Evidence = {id:string;targetId:string;key:string;text:string;sourceId:string;kind:'fact'|'answer'|'cv';inCv:boolean;cvText?:string};
export type MatchClass = 'demonstrated'|'claimed_limited'|'transferable'|'not_evidenced'|'unknown'|'conflict';
export type ComponentMatch = { requirementId:string;componentId:string;scope:'profile'|'cv';matchClass:MatchClass;evidence:{id:string;quote:string}[];reason:string };
export type MatchResult = {schemaVersion:'job-evidence-match/1';components:ComponentMatch[];suggestions?:JobSuggestion[]};
export type TailorSection = {targetId:string;action:'retain'|'rewrite'|'reorder';text:string;skillIds:string[];evidenceIds:string[];requirementIds:string[];reason:string;warnings:string[]};
export type TailorProposal = {schemaVersion:'job-tailor/1';sections:TailorSection[]};
export type WorkflowOperation = {languagePolicyVersion?:string|null;answersRevision?:number;id:string;kind:'fetch'|'extract'|'match'|'tailor';state:'queued'|'processing'|'ready'|'failed'|'cancelled'|'stale'|'unknown';jobRevision:number;snapshotId:string|null;snapshotRevision:number|null;documentVersionId?:string|null;documentLocale?:ContentLocale|null;targetLocale?:ContentLocale;targetDocumentVersionId?:string|null;result:Vacancy|MatchResult|TailorProposal|null;error:string|null;createdAt:string};
export type JobWorkflow = {revision:number;extracted:Vacancy|null;reviewed:Vacancy|null;operations:WorkflowOperation[];sourceParentId:string|null;duplicates:{id:string;title:string;kind:'exact'|'updated'}[]};
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=6000):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\u0000\uD800-\uDFFF]/u.test(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const unique=(v:string[])=>new Set(v).size===v.length;
const strings=(v:unknown,max=200):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(x=>text(x,256))&&unique(v);
export class WorkflowOutputError extends Error {
 readonly reason: 'STRUCTURE'|'SPAN_SHAPE'|'SPAN_SOURCE_MISMATCH';
 constructor(reason: WorkflowOutputError['reason'] = 'STRUCTURE') { super('INVALID_WORKFLOW_OUTPUT'); this.reason = reason; }
}
function fail(reason?: WorkflowOutputError['reason']):never {throw new WorkflowOutputError(reason);}
export async function fingerprint(v:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))).map(n=>n.toString(16).padStart(2,'0')).join('');}
export function validateSpans(v:unknown,source:string):Span[]{
 if(!Array.isArray(v)||v.length>30)fail('SPAN_SHAPE');
 for(const s of v){
  if(!object(s)||!exact(s,['start','end','quote'])||!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||s.start<0||s.end<=s.start||s.end>source.length||!text(s.quote,20000))fail('SPAN_SHAPE');
  if(source.slice(s.start,s.end)!==s.quote)fail('SPAN_SOURCE_MISMATCH');
 }
 return v;
}
export function validateVacancy(value:unknown,source:string,manual=false):Vacancy {
 if(!object(value)||!exact(value,['schemaVersion','sourceLocale','overview','requirements','issues','completeness'])||value.schemaVersion!=='vacancy-extraction/3'||!(value.sourceLocale===null||text(value.sourceLocale,40))||!object(value.overview)||!exact(value.overview,[...overviewFields])||!['complete','partial'].includes(value.completeness))fail();
 for(const field of overviewFields){const v=value.overview[field];if(v===null)continue;if(!object(v)||!exact(v,['value','evidence'])||!text(v.value,2000))fail();validateSpans(v.evidence,source);if(!manual&&(!v.evidence.length||!v.evidence.some((s:Span)=>s.quote.includes(v.value))))fail();if(field==='applicationUrl'){try{const u=new URL(v.value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)fail();}catch{fail();}}}
 if(!Array.isArray(value.requirements)||value.requirements.length>200)fail();
 for(const r of value.requirements){if(!object(r)||!exact(r,['id','text','categories','priority','emphasis','operator','components','evidence','eligibility','origin'])||!text(r.id,128)||!text(r.text)||!strings(r.categories,10)||!r.categories.length||!r.categories.every((c:string)=>categories.includes(c as Category))||!['required','preferred','unspecified'].includes(r.priority)||!['central','supporting','unknown'].includes(r.emphasis)||!['and','or'].includes(r.operator)||typeof r.eligibility!=='boolean'||r.origin!==(manual?'manual':'extracted')||!Array.isArray(r.components)||!r.components.length||r.components.length>20)fail();validateSpans(r.evidence,source);if(!manual&&(!r.evidence.length||!r.evidence.some((s:Span)=>s.quote.includes(r.text))))fail();for(const c of r.components)if(!object(c)||!exact(c,['id','text'])||!text(c.id,128)||!text(c.text,2000))fail();if(!unique(r.components.map((c:{id:string})=>c.id)))fail();}
 if(!unique(value.requirements.map((r:JobRequirement)=>r.id)))fail();
 if(!Array.isArray(value.issues)||value.issues.length>40)fail();for(const i of value.issues){if(!object(i)||!exact(i,['kind','message','evidence'])||!['ambiguity','conflict','incomplete'].includes(i.kind)||!text(i.message,1000))fail();validateSpans(i.evidence,source);}
 return structuredClone(value) as Vacancy;
}
export function eligibleEvidence(draft:BaseDraft):Evidence[]{
 const visible=new Map(visibleCvFields(draft).map(f=>[f.id,f.text]));
 const rows:Evidence[]=jobEditorFacts(draft).filter(r=>isAccepted(r.fact)&&typeof r.fact.value==='string'&&!!r.fact.value.trim()&&!['contact','name'].includes(r.key)&&draft.sources.some(s=>s.id===r.ref.sourceId)).map(r=>({id:r.fact.id,targetId:r.ref.entityId,key:r.key,text:String(r.fact.value),sourceId:r.fact.sourceId,kind:'fact',inCv:visible.has(r.fact.id),...(visible.has(r.fact.id)?{cvText:visible.get(r.fact.id)}:{})}));
 for(const a of draft.answers)if(a.status==='confirmed'&&a.sourceId&&draft.sources.some(s=>s.id===a.sourceId))rows.push({id:a.id,targetId:a.targetId,key:'answer',text:answerEvidenceText(a),sourceId:a.sourceId,kind:'answer',inCv:visible.has(a.id),...(visible.has(a.id)?{cvText:visible.get(a.id)}:{})});
 return rows;
}
export function visibleCvFields(d:BaseDraft):{id:string;targetId:string;text:string}[]{
 const rows:{id:string;targetId:string;text:string}[]=[],hidden=new Set(d.presentation.hiddenFields??[]);
 const add=(targetId:string,f:BaseDraft['name'])=>{if(typeof f.value==='string'&&f.value.trim()&&!hidden.has(f.fieldId))rows.push({id:f.id,targetId,text:f.value});};
 const entry=(targetId:string,field:BaseDraft['name'],bullets:BaseDraft['name'][]=[])=>{
  const wording=currentWording(d,targetId),p=d.presentation.approvedWording?.[targetId];
  if(wording){for(const source of p!.sources)rows.push({id:source.id,targetId,text:wording});}else add(targetId,field);
  if(!(wording&&p?.scope==='experience')&&!hidden.has(targetId+'-contributions'))bullets.forEach(f=>add(targetId,f));
 };
 for(const section of d.presentation.order){if(d.presentation.hidden.includes(section))continue;
  if(section==='identity')d.titles.forEach(f=>add(d.id,f));
  else if(section==='summary'&&d.summary.text&&!hidden.has('summary'))rows.push({id:d.summary.provenance?.id??d.summary.id,targetId:'summary',text:d.summary.text});
  else if(section==='professionalSkills'||section==='technicalSkills')d[section].forEach(f=>add(section,f));
  else if(section==='experience')for(const r of d.roles){[r.title,r.company,r.location].forEach(f=>add(r.id,f));entry(r.id,r.context,r.bullets);}
  else if(section==='education')for(const e of d.education)[e.qualification,e.field,e.institution,e.location,e.details].forEach(f=>add(e.id,f));
  else {const s=d.optionalSections.find(s=>s.id===section);if(!s)continue;if(s.heading)add(s.id,s.heading);for(const e of s.entries){if(!(s.heading&&e.id===s.id))add(e.id,e.title);if(s.kind==='languages'&&e.proficiency)add(e.id,e.proficiency);entry(e.id,e.details,e.bullets);}}
 }
 return rows;
}
export function projectCvEvidence(evidence:Evidence[],document:BaseDraft):Evidence[]{
 const visible=visibleCvFields(document);
 const rows=evidence.filter(e=>e.kind!=='cv').map(e=>{const exact=visible.find(v=>v.id===e.id);return {...e,inCv:!!exact,cvText:exact?.text??''};});
 for(const field of visible)if(!rows.some(e=>e.inCv&&e.cvText===field.text))rows.push({id:'cv:'+field.id,targetId:field.targetId,key:'document',text:'',cvText:field.text,sourceId:'current_document',kind:'cv',inCv:true});
 return rows;
}
export function validateMatch(value:unknown,vacancy:Vacancy,evidence:Evidence[]):MatchResult{
 if(!object(value)||!exact(value,['schemaVersion','components'])||value.schemaVersion!=='job-evidence-match/1'||!Array.isArray(value.components))fail();
 const expected=vacancy.requirements.flatMap(r=>r.components.flatMap(c=>['profile','cv'].map(scope=>`${r.id}:${c.id}:${scope}`)));
 if(value.components.length!==expected.length)fail();const found:string[]=[];
 for(const c of value.components){if(!object(c)||!exact(c,['requirementId','componentId','scope','matchClass','evidence','reason'])||!expected.includes(`${c.requirementId}:${c.componentId}:${c.scope}`)||!['demonstrated','claimed_limited','transferable','not_evidenced','unknown','conflict'].includes(c.matchClass)||!text(c.reason,1500)||!Array.isArray(c.evidence)||c.evidence.length>20)fail();found.push(`${c.requirementId}:${c.componentId}:${c.scope}`);
  if(['demonstrated','claimed_limited','transferable','conflict'].includes(c.matchClass)&&!c.evidence.length)fail();
  for(const s of c.evidence){if(!object(s)||!exact(s,['id','quote'])||!text(s.quote)||!evidence.some(e=>e.id===s.id&&(c.scope!=='profile'||e.kind!=='cv')&&(c.scope==='profile'?e.text:(e.cvText??e.text)).includes(s.quote)&&(c.scope==='profile'||e.inCv)))fail();}
  if(c.matchClass==='demonstrated'&&c.evidence.every((ref:{id:string})=>evidence.find(e=>e.id===ref.id)?.key==='skill'))fail();
  const r=vacancy.requirements.find(r=>r.id===c.requirementId)!;if(r.eligibility&&c.matchClass==='transferable')fail();
 }
 if(!unique(found))fail();
 for(const r of vacancy.requirements)for(const component of r.components){const profile=value.components.find((m:ComponentMatch)=>m.requirementId===r.id&&m.componentId===component.id&&m.scope==='profile'),cv=value.components.find((m:ComponentMatch)=>m.requirementId===r.id&&m.componentId===component.id&&m.scope==='cv');if(coverageMethod.strength[cv.matchClass as MatchClass]>coverageMethod.strength[profile.matchClass as MatchClass])fail();}
 return structuredClone(value) as MatchResult;
}
export const coverageMethod={version:'compatibility-1.2.0',weights:{technical:30,responsibilities:25,experience:15,achievements:10,qualifications:10,professional:5,title:5},priorities:{required:3,unspecified:2,preferred:1},strength:{demonstrated:1,claimed_limited:.75,transferable:.4,not_evidenced:0,unknown:0,conflict:0}} as const;
const primary=(r:JobRequirement):keyof typeof coverageMethod.weights=>{const c=r.categories[0];return c==='domain'?'responsibilities':c==='languages'||c==='conditions'?'qualifications':c;};
export function evidenceCoverage(vacancy:Vacancy,match:MatchResult,scope:'profile'|'cv'){
 const groups=new Map<string,{nominalWeight:number;numerator:number;denominator:number}>();
 const requirements=vacancy.requirements.map(r=>{const values=r.components.map(c=>{const m=match.components.find(m=>m.requirementId===r.id&&m.componentId===c.id&&m.scope===scope);return m?coverageMethod.strength[m.matchClass]:0;});const strength=r.operator==='or'?Math.max(...values):values.reduce<number>((a,b)=>a+b,0)/values.length;
 const category=primary(r),priority=coverageMethod.priorities[r.priority],g=groups.get(category)??{nominalWeight:coverageMethod.weights[category],numerator:0,denominator:0};if(!r.eligibility){g.numerator+=strength*priority;g.denominator+=priority;groups.set(category,g);}return {id:r.id,strength,eligibility:r.eligibility,state:strength===1?'supported':strength>0?'partially_supported':match.components.some(c=>c.requirementId===r.id&&c.scope===scope&&c.matchClass==='conflict')?'conflict':match.components.some(c=>c.requirementId===r.id&&c.scope===scope&&c.matchClass==='unknown')?'needs_confirmation':'not_evidenced'};});
 const weight=[...groups.values()].reduce((n,g)=>n+g.nominalWeight,0),categories=[...groups.entries()].map(([category,g])=>({category,...g,effectiveWeight:100*g.nominalWeight/weight,coverage:g.numerator/g.denominator}));
 return {method:coverageMethod.version,score:weight?Math.round(categories.reduce((n,g)=>n+g.effectiveWeight*g.coverage,0)*100)/100:null,categories,requirements,eligibility:requirements.filter(r=>r.eligibility).map(r=>({id:r.id,state:r.strength===1?'supported':r.state==='conflict'?'conflict':'needs_confirmation'}))};
}
export function tailorTargets(d:BaseDraft){return ['summary','professionalSkills','technicalSkills',...d.titles.map(f=>f.fieldId),...d.roles.map(r=>r.id),...d.education.map(e=>e.id),...d.optionalSections.flatMap(s=>s.entries.map(e=>e.id))];}
export function tailorTargetText(d:BaseDraft,id:string):string{
 if(id==='summary')return d.summary.text;
 if(id==='professionalSkills'||id==='technicalSkills')return d[id].map(f=>f.value).join(', ');
 const title=d.titles.find(f=>f.fieldId===id);if(title)return title.value;
 const role=d.roles.find(r=>r.id===id);if(role)return [currentWording(d,id)??role.context.value,...(currentWording(d,id)&&d.presentation.approvedWording?.[id]?.scope==='experience'?[]:role.bullets.map(b=>b.value))].join('\n');
 const edu=d.education.find(e=>e.id===id);if(edu)return edu.details.value;
 const entry=d.optionalSections.flatMap(s=>s.entries).find(e=>e.id===id);if(!entry)throw Error('INVALID_WORKFLOW_OUTPUT');
 return [currentWording(d,id)??entry.details.value,...(currentWording(d,id)&&d.presentation.approvedWording?.[id]?.scope==='experience'?[]:(entry.bullets??[]).map(b=>b.value))].join('\n');
}
export function validateTailor(value:unknown,draft:BaseDraft,vacancy:Vacancy,evidence:Evidence[],onlyTarget?:string):TailorProposal{
 const targets=onlyTarget?[onlyTarget]:tailorTargets(draft);
 if(!object(value)||!exact(value,['schemaVersion','sections'])||value.schemaVersion!=='job-tailor/1'||!Array.isArray(value.sections)||value.sections.length!==targets.length)fail();
 for(const s of value.sections){if(!object(s)||!exact(s,['targetId','action','text','skillIds','evidenceIds','requirementIds','reason','warnings'])||!targets.includes(s.targetId)||!['retain','rewrite','reorder'].includes(s.action)||typeof s.text!=='string'||s.text.length>20000||!strings(s.skillIds,200)||!strings(s.evidenceIds,500)||!strings(s.requirementIds,200)||!text(s.reason,1000)||!Array.isArray(s.warnings)||s.warnings.length>20||!s.warnings.every((w:unknown)=>text(w,1000))||!s.requirementIds.every((id:string)=>vacancy.requirements.some(r=>r.id===id)))fail();
  const cited=s.evidenceIds.map((id:string)=>{const row=evidence.find(e=>e.id===id&&e.kind!=='cv');if(!row||(!['summary','professionalSkills','technicalSkills',...draft.titles.map(f=>f.fieldId)].includes(s.targetId)&&(row.targetId!==s.targetId||!['context','details','bullet','answer','qualification','field','title','proficiency'].includes(row.key))))fail();return row;});
  if(s.action==='reorder'&&!['professionalSkills','technicalSkills'].includes(s.targetId))fail();
  if(s.action!=='retain'&&!cited.length)fail();
  if(['professionalSkills','technicalSkills'].includes(s.targetId)){if(s.text!==''||s.skillIds.length>skillInventoryPolicy.activeCategoryLimit||!s.skillIds.every((id:string)=>cited.some((e:Evidence)=>e.id===id&&e.targetId===s.targetId&&e.key==='skill')))fail();}else {
   if(s.skillIds.length)fail();
   // A label can be selected for a skill list, but cannot attest work performed.
   // Legacy labels without provenance remain selectable under the same rule.
   if(s.action!=='retain'&&(!cited.some((e:Evidence)=>e.key!=='skill')||cited.some((e:Evidence)=>e.key==='skill')))fail();
  }
  if(s.action==='rewrite'&&!s.text.trim()&&!s.skillIds.length)fail();
  const support=cited.map((e:Evidence)=>e.text).join('\n'),numbers=new Set(support.match(/\d+(?:[.,]\d+)*%?/g)??[]);for(const n of s.text.match(/\d+(?:[.,]\d+)*%?/g)??[])if(!numbers.has(n))fail();
 }
 if(!unique(value.sections.map((s:TailorSection)=>s.targetId)))fail();return structuredClone(value) as TailorProposal;
}
export function jobClarificationQuestion(requirement:string,target:string,locale='en'){
 const primary=locale.split('-')[0];
 if(primary==='ro')return `Ce activități ai desfășurat în ${target.slice(0,200)} care susțin această cerință a angajatorului: „${requirement.slice(0,1200)}”? Descrie numai activități realizate personal. Poți răspunde nu, nu știu sau poți omite întrebarea.`;
 if(primary!=='en')throw Error('CONTENT_LANGUAGE_REQUIRED');
 return `What, if any, work in ${target.slice(0,200)} supports this employer requirement: “${requirement.slice(0,1200)}”? Describe only activities you personally performed. You may answer no, unknown, or skip.`;}
export type JobSuggestion={question?:string|null;id:string;type:'include'|'clarify'|'verify'|'gap';requirementIds:string[];evidenceIds:string[];targetId:string|null;state:string;priority:number;reason:string};
export type SuggestionResult={schemaVersion:'job-suggestions/1';suggestions:JobSuggestion[]};
export async function validateSuggestions(value:unknown,vacancy:Vacancy,evidence:Evidence[]):Promise<SuggestionResult>{
 if(!object(value)||!exact(value,['schemaVersion','suggestions'])||value.schemaVersion!=='job-suggestions/1'||!Array.isArray(value.suggestions)||value.suggestions.length>40)fail();
 const suggestions:JobSuggestion[]=[];
 for(const s of value.suggestions){
  if(!object(s)||!exact(s,['type','requirementIds','evidenceIds','targetId','priority','reason',...(Object.hasOwn(s,'question')?['question']:[])])||!['include','clarify','verify','gap'].includes(s.type)||!strings(s.requirementIds,200)||!s.requirementIds.length||!s.requirementIds.every((id:string)=>vacancy.requirements.some(r=>r.id===id))||!strings(s.evidenceIds,500)||!s.evidenceIds.every((id:string)=>evidence.some(e=>e.id===id&&e.kind!=='cv'))||!(s.targetId===null||evidence.some(e=>e.targetId===s.targetId))||!Number.isInteger(s.priority)||s.priority<1||s.priority>100||!text(s.reason,1000)||(s.question!==undefined&&s.question!==null&&!text(s.question,2000)))fail();
  if(s.type==='include'&&(!s.evidenceIds.length||!s.targetId))fail();
  const id='suggestion_'+(await fingerprint({target:s.targetId,requirements:vacancy.requirements.filter(r=>s.requirementIds.includes(r.id)).map(r=>({text:r.text,priority:r.priority,components:r.components.map(c=>c.text)})).sort((a,b)=>a.text.localeCompare(b.text)),evidence:evidence.filter(e=>s.evidenceIds.includes(e.id)).map(e=>({id:e.id,text:e.text,target:e.targetId})).sort((a,b)=>a.id.localeCompare(b.id))})).slice(0,48);
  if(suggestions.some(s=>s.id===id))fail();suggestions.push({...s,id,state:'new'} as JobSuggestion);
 }
 return {schemaVersion:'job-suggestions/1',suggestions};
}

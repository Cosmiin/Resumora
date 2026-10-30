import { isAuthored, type BaseDraft } from '../editor/model.ts';
import { jobEditorFacts } from './documents.ts';
import { answerEvidenceText } from '../intelligence/model.ts';
export const categories = ['technical','responsibilities','experience','achievements','qualifications','professional','title','domain','languages','conditions'] as const;
export type Category = typeof categories[number];
export type Span = { start: number; end: number; quote: string };
export type JobRequirement = { id: string; text: string; categories: Category[]; priority: 'required'|'preferred'|'unspecified'; emphasis: 'central'|'supporting'|'unknown'; operator: 'and'|'or'; components: {id:string;text:string}[]; evidence: Span[]; eligibility: boolean; origin: 'extracted'|'manual' };
export const overviewFields = ['title','company','location','workArrangement','geographicEligibility','employmentType','contractDuration','workingHours','travel','salary','experience','education','certifications','languages','postedAt','updatedAt','deadline','applicationUrl'] as const;
export type Vacancy = { schemaVersion:'vacancy-extraction/3'; sourceLocale:string|null; overview: Record<typeof overviewFields[number], {value:string;evidence:Span[]}|null>; requirements:JobRequirement[]; issues:{kind:'ambiguity'|'conflict'|'incomplete';message:string;evidence:Span[]}[]; completeness:'complete'|'partial' };
export type Evidence = {id:string;targetId:string;key:string;text:string;sourceId:string;kind:'fact'|'answer';inCv:boolean};
export type MatchClass = 'demonstrated'|'claimed_limited'|'transferable'|'not_evidenced'|'unknown'|'conflict';
export type ComponentMatch = { requirementId:string;componentId:string;scope:'profile'|'cv';matchClass:MatchClass;evidence:{id:string;quote:string}[];reason:string };
export type MatchResult = {schemaVersion:'job-evidence-match/1';components:ComponentMatch[]};
export type TailorSection = {targetId:string;action:'retain'|'rewrite'|'reorder';text:string;skillIds:string[];evidenceIds:string[];requirementIds:string[];reason:string;warnings:string[]};
export type TailorProposal = {schemaVersion:'job-tailor/1';sections:TailorSection[]};
export type WorkflowOperation = {id:string;kind:'fetch'|'extract'|'match'|'tailor';state:'queued'|'processing'|'ready'|'failed'|'cancelled'|'stale'|'unknown';jobRevision:number;snapshotId:string|null;snapshotRevision:number|null;documentVersionId?:string|null;result:Vacancy|MatchResult|TailorProposal|null;error:string|null;createdAt:string};
export type JobWorkflow = {revision:number;extracted:Vacancy|null;reviewed:Vacancy|null;operations:WorkflowOperation[];sourceParentId:string|null;duplicates:{id:string;title:string;kind:'exact'|'updated'}[]};
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=6000):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\u0000\uD800-\uDFFF]/u.test(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const unique=(v:string[])=>new Set(v).size===v.length;
const strings=(v:unknown,max=200):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(x=>text(x,256))&&unique(v);
function fail():never {throw new Error('INVALID_WORKFLOW_OUTPUT');}
export async function fingerprint(v:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))).map(n=>n.toString(16).padStart(2,'0')).join('');}
export function validateSpans(v:unknown,source:string):Span[]{
 if(!Array.isArray(v)||v.length>30)fail();
 for(const s of v)if(!object(s)||!exact(s,['start','end','quote'])||!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||s.start<0||s.end<=s.start||s.end>source.length||!text(s.quote,20000)||source.slice(s.start,s.end)!==s.quote)fail();
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
 const hidden=new Set(draft.presentation.hidden),fields=new Set(draft.presentation.hiddenFields??[]);
 const targets=new Map<string,string>();draft.roles.forEach(r=>targets.set(r.id,'experience'));draft.education.forEach(e=>targets.set(e.id,'education'));draft.optionalSections.forEach(s=>s.entries.forEach(e=>targets.set(e.id,s.id)));
 const rows:Evidence[]=jobEditorFacts(draft).filter(r=>isAuthored(r.fact)&&typeof r.fact.value==='string'&&!!r.fact.value.trim()&&r.key!=='contact'&&r.key!=='name'&&draft.sources.some(s=>s.id===r.ref.sourceId)).map(r=>({id:r.fact.id,targetId:r.ref.entityId,key:r.key,text:String(r.fact.value),sourceId:r.fact.sourceId,kind:'fact',inCv:!hidden.has(targets.get(r.ref.entityId)??r.ref.entityId)&&!fields.has(r.fact.fieldId)&&!(draft.presentation.approvedWording?.[r.ref.entityId]&&['context','details','bullet'].includes(r.key)&&!draft.presentation.approvedWording[r.ref.entityId].sources.some(s=>s.id===r.fact.id))}));
 for(const a of draft.answers)if(a.status==='confirmed'&&a.sourceId&&draft.sources.some(s=>s.id===a.sourceId))rows.push({id:a.id,targetId:a.targetId,key:'answer',text:answerEvidenceText(a),sourceId:a.sourceId,kind:'answer',inCv:!hidden.has(targets.get(a.targetId)??a.targetId)&&!!draft.presentation.approvedWording?.[a.targetId]?.sources.some(s=>s.id===a.id)});
 return rows;
}
export function validateMatch(value:unknown,vacancy:Vacancy,evidence:Evidence[]):MatchResult{
 if(!object(value)||!exact(value,['schemaVersion','components'])||value.schemaVersion!=='job-evidence-match/1'||!Array.isArray(value.components))fail();
 const expected=vacancy.requirements.flatMap(r=>r.components.flatMap(c=>['profile','cv'].map(scope=>`${r.id}:${c.id}:${scope}`)));
 if(value.components.length!==expected.length)fail();const found:string[]=[];
 for(const c of value.components){if(!object(c)||!exact(c,['requirementId','componentId','scope','matchClass','evidence','reason'])||!expected.includes(`${c.requirementId}:${c.componentId}:${c.scope}`)||!['demonstrated','claimed_limited','transferable','not_evidenced','unknown','conflict'].includes(c.matchClass)||!text(c.reason,1500)||!Array.isArray(c.evidence)||c.evidence.length>20)fail();found.push(`${c.requirementId}:${c.componentId}:${c.scope}`);
  if(['demonstrated','claimed_limited','transferable','conflict'].includes(c.matchClass)&&!c.evidence.length)fail();
  for(const s of c.evidence){if(!object(s)||!exact(s,['id','quote'])||!text(s.quote)||!evidence.some(e=>e.id===s.id&&e.text.includes(s.quote)&&(c.scope==='profile'||e.inCv)))fail();}
  const r=vacancy.requirements.find(r=>r.id===c.requirementId)!;if(r.eligibility&&c.matchClass==='transferable')fail();
 }
 if(!unique(found))fail();return structuredClone(value) as MatchResult;
}
export const coverageMethod={version:'compatibility-1.1.0',weights:{technical:30,responsibilities:25,experience:15,achievements:10,qualifications:10,professional:5,title:5},priorities:{required:3,unspecified:2,preferred:1},strength:{demonstrated:1,claimed_limited:.75,transferable:.4,not_evidenced:0,unknown:0,conflict:0}} as const;
const primary=(r:JobRequirement):keyof typeof coverageMethod.weights=>{const c=r.categories[0];return c==='domain'?'responsibilities':c==='languages'||c==='conditions'?'qualifications':c;};
export function evidenceCoverage(vacancy:Vacancy,match:MatchResult,scope:'profile'|'cv'){
 const groups=new Map<string,{nominalWeight:number;numerator:number;denominator:number}>();
 const requirements=vacancy.requirements.map(r=>{const values=r.components.map(c=>{const m=match.components.find(m=>m.requirementId===r.id&&m.componentId===c.id&&m.scope===scope);return m?coverageMethod.strength[m.matchClass]:0;});const strength=r.operator==='or'?Math.max(...values):values.reduce<number>((a,b)=>a+b,0)/values.length;
 const category=primary(r),priority=coverageMethod.priorities[r.priority],g=groups.get(category)??{nominalWeight:coverageMethod.weights[category],numerator:0,denominator:0};g.numerator+=strength*priority;g.denominator+=priority;groups.set(category,g);return {id:r.id,strength,eligibility:r.eligibility,state:strength===1?'supported':strength>0?'partially_supported':match.components.some(c=>c.requirementId===r.id&&c.scope===scope&&c.matchClass==='conflict')?'conflict':match.components.some(c=>c.requirementId===r.id&&c.scope===scope&&c.matchClass==='unknown')?'needs_confirmation':'not_evidenced'};});
 const weight=[...groups.values()].reduce((n,g)=>n+g.nominalWeight,0),categories=[...groups.entries()].map(([category,g])=>({category,...g,effectiveWeight:100*g.nominalWeight/weight,coverage:g.numerator/g.denominator}));
 return {method:coverageMethod.version,score:weight?Math.round(categories.reduce((n,g)=>n+g.effectiveWeight*g.coverage,0)*100)/100:null,categories,requirements,eligibility:requirements.filter(r=>r.eligibility).map(r=>({id:r.id,state:r.strength===1?'supported':r.state==='conflict'?'conflict':'needs_confirmation'}))};
}
export function tailorTargets(d:BaseDraft){return ['summary','professionalSkills','technicalSkills',...d.roles.map(r=>r.id),...d.optionalSections.filter(s=>s.kind!=='languages').flatMap(s=>s.entries.map(e=>e.id))];}
export function validateTailor(value:unknown,draft:BaseDraft,vacancy:Vacancy,evidence:Evidence[],onlyTarget?:string):TailorProposal{
 const targets=onlyTarget?[onlyTarget]:tailorTargets(draft);
 if(!object(value)||!exact(value,['schemaVersion','sections'])||value.schemaVersion!=='job-tailor/1'||!Array.isArray(value.sections)||value.sections.length!==targets.length)fail();
 for(const s of value.sections){if(!object(s)||!exact(s,['targetId','action','text','skillIds','evidenceIds','requirementIds','reason','warnings'])||!targets.includes(s.targetId)||!['retain','rewrite','reorder'].includes(s.action)||typeof s.text!=='string'||s.text.length>20000||!strings(s.skillIds,200)||!strings(s.evidenceIds,500)||!strings(s.requirementIds,200)||!text(s.reason,1000)||!Array.isArray(s.warnings)||s.warnings.length>20||!s.warnings.every((w:unknown)=>text(w,1000))||!s.requirementIds.every((id:string)=>vacancy.requirements.some(r=>r.id===id)))fail();
  const cited=s.evidenceIds.map((id:string)=>{const row=evidence.find(e=>e.id===id);if(!row||(!['summary','professionalSkills','technicalSkills'].includes(s.targetId)&&(row.targetId!==s.targetId||!['context','details','bullet','answer'].includes(row.key))))fail();return row;});
  if(s.action!=='retain'&&!cited.length)fail();
  if(['professionalSkills','technicalSkills'].includes(s.targetId)){if(s.text!==''||!s.skillIds.every((id:string)=>draft[s.targetId as 'professionalSkills'|'technicalSkills'].some(f=>f.id===id&&isAuthored(f))))fail();}else if(s.skillIds.length)fail();
  if(s.action==='rewrite'&&!s.text.trim()&&!s.skillIds.length)fail();
  const support=cited.map((e:Evidence)=>e.text).join('\n'),numbers=new Set(support.match(/\d+(?:[.,]\d+)*%?/g)??[]);for(const n of s.text.match(/\d+(?:[.,]\d+)*%?/g)??[])if(!numbers.has(n))fail();
 }
 if(!unique(value.sections.map((s:TailorSection)=>s.targetId)))fail();return structuredClone(value) as TailorProposal;
}

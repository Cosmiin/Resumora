import { skillInventoryPolicy } from '../intelligence/skill-keywords.ts';
import { answerEvidenceText } from '../intelligence/model.ts';
import { allInventorySkills } from '../intelligence/skills-improvement.ts';
import { type BaseDraft, type Fact, type DocumentPresentation, summaryFact, writeSummary, isAccepted, coreSections } from '../editor/model.ts';
import { decodeDraft, isBaseDraft, type EditorWireEnvelope } from '../editor/transport.ts';
import { isPhoto } from '../editor/photo.ts';
import { isUuid } from './connected.ts';

// Editor correlation handles are never canonical claim/resource UUIDs.
export type JobFactRef = { entityId: string; fieldId: string; valueId: string; sourceId: string };
export type JobPin = { id: string; versionId: string | null; fingerprint: string };
export type JobEditorPayload = {
  schemaVersion: 'resumora-job-editor/1';
  acceptance: 'accepted';
  source: { snapshotId: string; revision: number };
  job: JobPin;
  selectedFacts: JobFactRef[];
  selectedAnswerIds: string[];
  // Pending proposals belong to the proposal workflow, never to saved versions.
  wording: { targetId: string; text: string; origin: 'ai_generated' | 'user_authored';
    acceptance: 'accepted'; scope?: 'experience'; valueIds: string[]; answerIds: string[] }[];
  presentation: Partial<Pick<DocumentPresentation, 'order' | 'hidden' | 'hiddenFields' | 'templateVersionId' | 'photo'>> & { summaryText?: string; professionalSkillIds?: string[]; technicalSkillIds?: string[] };
  localAdditions: { id: string; targetId: string; kind: 'bullet' | 'professionalSkill' | 'technicalSkill';
    text: string; scope: 'job-only'; origin: 'user_authored' }[];
};
export type JobEditorVersion = {
  id: string; documentId: string; revision: number; parentId: string | null; restoredFrom?: string;
  createdAt: string; reason: 'save' | 'restore'; payload: JobEditorPayload; sourcePayload: EditorWireEnvelope;
};
export type JobEditorSave = { requestId: string; documentId: string | null; expectedRevision: number; payload: JobEditorPayload };
export interface JobEditorGateway {
  jobEditorPin?(jobId:string):Promise<JobPin>;
  jobEditorContext(jobId: string): Promise<{ job: JobPin; source: JobEditorPayload['source'] }>;
  loadJobEditor(jobId: string, documentId?: string, versionId?: string): Promise<JobEditorVersion | null>;
  jobEditorHistory(jobId: string, documentId: string, page?: { beforeRevision?: number; limit?: number }): Promise<JobEditorVersion[]>;
  saveJobEditor(jobId: string, input: JobEditorSave): Promise<JobEditorVersion>;
  restoreJobEditor(jobId: string, input: { requestId: string; documentId: string; expectedRevision: number; versionId: string }): Promise<JobEditorVersion>;
  deleteJobEditor(jobId: string, input: { requestId: string; documentId: string; expectedRevision: number }): Promise<{ documentId: string; deleted: true }>;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[], required = allowed) =>
  Object.keys(v).every(k => allowed.includes(k)) && required.every(k => Object.hasOwn(v, k));
const handle = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 20000;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 5000 && v.every(handle) && new Set(v).size === v.length;
export const positiveRevision = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
export function isJobPin(v: unknown): v is JobPin {
  return record(v) && keys(v, ['id','versionId','fingerprint']) && isUuid(v.id) && (v.versionId === null || isUuid(v.versionId))
    && typeof v.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(v.fingerprint);
}
export function isJobEditorPayload(v: unknown): v is JobEditorPayload {
  if (!record(v) || !keys(v, ['schemaVersion','acceptance','source','job','selectedFacts','selectedAnswerIds','wording','presentation','localAdditions']) ||
    v.schemaVersion !== 'resumora-job-editor/1' || v.acceptance !== 'accepted' || !record(v.source) ||
    !keys(v.source, ['snapshotId','revision']) || !isUuid(v.source.snapshotId) || !positiveRevision(v.source.revision) || !isJobPin(v.job) ||
    !Array.isArray(v.selectedFacts) || v.selectedFacts.length > 5000 || !v.selectedFacts.every(f => record(f) &&
      keys(f, ['entityId','fieldId','valueId','sourceId']) && Object.values(f).every(handle)) ||
    new Set(v.selectedFacts.map(f => f.valueId)).size !== v.selectedFacts.length || !strings(v.selectedAnswerIds) ||
    !Array.isArray(v.wording) || v.wording.length > 200 || !v.wording.every(w => record(w) &&
      keys(w, ['targetId','text','origin','acceptance','valueIds','answerIds','scope'], ['targetId','text','origin','acceptance','valueIds','answerIds']) && handle(w.targetId) && text(w.text) &&
      ['ai_generated','user_authored'].includes(w.origin as string) && w.acceptance === 'accepted' && (!Object.hasOwn(w, 'scope') || w.scope === 'experience') && strings(w.valueIds) && strings(w.answerIds) && w.valueIds.length + w.answerIds.length > 0) ||
    new Set(v.wording.map(w => w.targetId)).size !== v.wording.length || !record(v.presentation) ||
    !keys(v.presentation, ['order','hidden','hiddenFields','templateVersionId','photo','summaryText','professionalSkillIds','technicalSkillIds'], []) ||
    ['order','hidden','hiddenFields','professionalSkillIds','technicalSkillIds'].some(k => Object.hasOwn(v.presentation as object, k) && !strings((v.presentation as Record<string, unknown>)[k])) ||
    (Object.hasOwn(v.presentation, 'summaryText') && (typeof v.presentation.summaryText !== 'string' || v.presentation.summaryText.length > 20000)) ||
    (Object.hasOwn(v.presentation, 'templateVersionId') && (typeof v.presentation.templateVersionId !== 'string' || !/^[a-z][a-z0-9_-]{1,79}$/.test(v.presentation.templateVersionId))) ||
    (Object.hasOwn(v.presentation, 'photo') && !isPhoto(v.presentation.photo)) ||
    !Array.isArray(v.localAdditions) || v.localAdditions.length > 200 || !v.localAdditions.every(a => record(a) &&
      keys(a, ['id','targetId','kind','text','scope','origin']) && typeof a.id === 'string' && /^job_local_[a-zA-Z0-9_-]{1,100}$/.test(a.id) &&
      handle(a.targetId) && ['bullet','professionalSkill','technicalSkill'].includes(a.kind as string) && text(a.text) && a.scope === 'job-only' && a.origin === 'user_authored') ||
    new Set(v.localAdditions.map(a => a.id)).size !== v.localAdditions.length) return false;
  return true;
}
export function jobEditorFacts(d: BaseDraft): { ref: JobFactRef; fact: Fact; key: string }[] {
  const rows: ReturnType<typeof jobEditorFacts> = [];
  const add = (entityId: string, key: string, f: Fact) => rows.push({ ref: { entityId, fieldId: f.fieldId, valueId: f.id, sourceId: f.sourceId }, fact: f, key });
  const summary=summaryFact(d);if(summary)add('summary','summary',summary);
  add(d.id, 'name', d.name); d.titles.forEach(f => add(d.id, 'title', f));
  d.contacts.forEach(c => add(c.id, 'contact', c.value));
  for (const group of ['professionalSkills','technicalSkills'] as const) allInventorySkills(d, group).forEach(f => add(group, 'skill', f));
  const entity = (e: { id: string }, fields: Record<string, unknown>) => {
    for (const [key, f] of Object.entries(fields)) {
      if (key === 'bullets') (f as Fact[]).forEach(b => add(e.id, 'bullet', b));
      else if (record(f) && typeof f.fieldId === 'string') add(e.id, key, f as Fact);
    }
  };
  d.roles.forEach(r => entity(r, r)); d.education.forEach(e => entity(e, e));
  d.optionalSections.forEach(s => {
    if (s.heading) add(s.id, 'heading', s.heading);
    s.entries.forEach(e => entity(e, e));
  });
  return rows;
}
function invalid(): never { throw new Error('invalidJobEditor'); }
// A disposable render projection, never a write-back to the career source. Exact
// answers, import metadata and source provenance survive by cloning the codec.
export function projectJobEditor(source: EditorWireEnvelope, payload: JobEditorPayload): BaseDraft {
  if (!isJobEditorPayload(payload)) invalid();
  const draft = decodeDraft(source), facts = jobEditorFacts(draft);
  if (new Set(facts.map(f => f.ref.valueId)).size !== facts.length || new Set(facts.map(f => f.ref.fieldId)).size !== facts.length) invalid();
  const selected = payload.selectedFacts.map(ref => {
    const row = facts.find(f => Object.entries(ref).every(([k,v]) => f.ref[k as keyof JobFactRef] === v));
    if (!row || !isAccepted(row.fact) || !draft.sources.some(s => s.id === ref.sourceId)) invalid();
    return row;
  });
  const answers = payload.selectedAnswerIds.map(id => {
    const found = draft.answers.filter(a => a.id === id && a.status === 'confirmed');
    if (found.length !== 1) invalid();
    return found[0];
  });
  const entries = draft.optionalSections.filter(s => s.kind !== 'languages').flatMap(s => s.entries);
  const targets = [...draft.roles, ...entries];
  for (const w of payload.wording) {
    if (targets.filter(t => t.id === w.targetId).length !== 1) invalid();
    const evidence = w.valueIds.map(id => {
      const row = selected.find(f => f.ref.valueId === id && f.ref.entityId === w.targetId && ['context','details','bullet'].includes(f.key) && typeof f.fact.value === 'string');
      if (!row) invalid();
      return { id: row.fact.id, text: row.fact.value as string, sourceId: row.fact.sourceId,
        ...(row.fact.sourceClaimId ? { sourceClaimId: row.fact.sourceClaimId } : {}),
        ...(row.fact.sourceLineage ? { sourceLineage: row.fact.sourceLineage } : {}) };
    });
    for (const id of w.answerIds) {
      const a = answers.find(a => a.id === id && a.targetId === w.targetId);
      // Existing renderer's wording provenance requires a real source handle.
      if (!a || !a.sourceId || !draft.sources.some(s => s.id === a.sourceId)) invalid();
      evidence.push({ id: a.id, text: answerEvidenceText(a), sourceId: a.sourceId });
    }
    (draft.presentation.approvedWording ??= {})[w.targetId] = { text: w.text, sources: evidence, ...(w.scope ? { scope: w.scope, origin: w.origin } : {}) };
    delete draft.presentation.contributionHtml?.[w.targetId];
  }
  const hiddenContacts = draft.contacts.filter(c => !c.visible).map(c => c.value.fieldId);
  if (hiddenContacts.length) draft.presentation.hiddenFields = [...new Set([...(draft.presentation.hiddenFields ?? []), ...hiddenContacts])];
  draft.contacts.forEach(c => { c.visible = true; });
  const { summaryText, professionalSkillIds, technicalSkillIds, ...presentation } = payload.presentation;
  Object.assign(draft.presentation, structuredClone(presentation));
  if (summaryText !== undefined) writeSummary(draft,summaryText);
  const sections = [...coreSections, ...draft.optionalSections.map(s => s.id)];
  if (draft.presentation.order.some(id => !sections.includes(id)) || draft.presentation.hidden.some(id => !sections.includes(id))) invalid();
  const ids = new Set([...facts.flatMap(f => [f.ref.valueId, f.ref.fieldId, f.ref.entityId]), ...draft.sources.map(s => s.id), ...draft.answers.map(a => a.id)]);
  for (const addition of payload.localAdditions) {
    if (ids.has(addition.id)) invalid(); ids.add(addition.id);
    const f: Fact<string> = { id: addition.id, fieldId: addition.id, value: addition.text, status: 'user_authored', sourceId: 'job_local_manual' };
    if (addition.kind === 'bullet') {
      const matches = targets.filter(t => t.id === addition.targetId);
      if (matches.length !== 1) invalid(); const target = matches[0];
      (target.bullets ??= []).push(f);
      delete draft.presentation.contributionHtml?.[addition.targetId];
    } else {
      const group = addition.kind === 'professionalSkill' ? 'professionalSkills' : 'technicalSkills';
      if (addition.targetId !== group) invalid(); draft[group].push(f);
    }
  }
  if (payload.localAdditions.length) {
    if (draft.sources.some(s => s.id === 'job_local_manual')) invalid();
    draft.sources.push({ id: 'job_local_manual', kind: 'manual', label: 'Job-only manual additions' });
  }
  for (const [group, selection] of [['professionalSkills', professionalSkillIds], ['technicalSkills', technicalSkillIds]] as const) {
    if (selection !== undefined) {
      const inventory = allInventorySkills(draft, group);
      // Historical active-only projections remain readable. A new selection
      // that draws from reserves follows the current thirty-skill limit.
      if (selection.length > skillInventoryPolicy.activeCategoryLimit && selection.some(id => draft.skillReserves?.[group].some(f => f.id === id))) invalid();
      draft[group] = selection.map(id => {
        const matches = inventory.filter(f => f.id === id);
        if (matches.length !== 1 || !isAccepted(matches[0]) || !draft.sources.some(s => s.id === matches[0].sourceId)) invalid();
        return matches[0];
      });
      if (draft.skillReserves) draft.skillReserves[group] = draft.skillReserves[group].filter(f => !selection.includes(f.id));
    }
  }
  if (!isBaseDraft(draft)) invalid();
  return draft;
}

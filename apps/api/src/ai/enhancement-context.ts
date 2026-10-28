import type { BaseDraft, Fact } from '../../../../packages/contracts/src/editor/model.ts';

export type ScopedFact = { id: string; text: string; sourceId: string; sourceClaimId?: string;
  sourceLineage?: { sourceId: string; sourceClaimId?: string }[] };
export type EnhancementContext = { targetId: string; locale: 'ro' | 'en'; facts: ScopedFact[] };

/** Internal projection of an already ownership-verified draft, never a browser request parser.
 * No identity/contact/location/raw source/whole-CV/job text is projected. Free text still
 * needs an approved privacy review before configured execution; this is not a PII detector.
 */
export function projectEnhancementContext(draft: BaseDraft, targetId: string): EnhancementContext {
  const role = draft.roles.find(r => r.id === targetId);
  const entry = draft.optionalSections.filter(s => s.kind !== 'languages').flatMap(s => s.entries).find(e => e.id === targetId);
  if (!role && !entry) throw new Error('INVALID_TARGET');
  const fields: Fact<string>[] = (role ? [role.context, ...role.bullets] : [entry!.details, ...(entry!.bullets ?? [])])
    .filter(f => ['user_confirmed', 'user_authored'].includes(f.status) && f.value.trim());
  const facts: ScopedFact[] = fields.map(f => ({
    id: f.id, text: f.value, sourceId: f.sourceId,
    ...(f.sourceClaimId ? { sourceClaimId: f.sourceClaimId } : {}),
    ...(f.sourceLineage ? { sourceLineage: structuredClone(f.sourceLineage) } : {}),
  }));
  for (const answer of draft.answers.filter(a => a.targetId === targetId && a.status === 'confirmed' && a.sourceId && a.text.trim())) {
    // An answer already represented by its CV field must not become duplicated evidence.
    if (!fields.some(f => f.fieldId === answer.cvFieldId && f.value === answer.text && f.sourceId === answer.sourceId)) {
      facts.push({ id: answer.id, text: answer.text, sourceId: answer.sourceId! });
    }
  }
  if (!facts.length || facts.length > 24 || new Set(facts.map(f => f.id)).size !== facts.length
    || facts.some(f => !f.sourceId || f.text.length > 2000)
    || facts.reduce((n, f) => n + f.text.length, 0) > 8000) throw new Error('INVALID_SCOPED_CONTEXT');
  return { targetId, locale: draft.language, facts };
}

export type EnhancementProposal = { status: 'proposal'; targetId: string; text: string; sources: ScopedFact[] };
/** Conservative groundwork truth boundary: only exact quotations of verified evidence.
 * Paraphrasing/semantic entailment is deliberately deferred. IDs alone do not prove truth.
 */
export function validateProposal(value: unknown, context: EnhancementContext): EnhancementProposal {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== 'factIds,text'
    || typeof v.text !== 'string' || !Array.isArray(v.factIds) || v.factIds.length !== 1 || typeof v.factIds[0] !== 'string') throw new Error('OUTPUT_INVALID');
  const factId = v.factIds[0];
  const fact = context.facts.find(f => f.id === factId);
  if (!fact || v.text !== fact.text) throw new Error('OUTPUT_UNSUPPORTED');
  return { status: 'proposal', targetId: context.targetId, text: v.text, sources: [structuredClone(fact)] };
}

/** A constrained rewrite grammar, not semantic entailment: combine up to three cited
 * facts, removing a first-person prefix and normalizing terminal punctuation only.
 * No novel words, titles, metrics or qualifications are permitted. */
export function composeGrounded(facts: readonly ScopedFact[], locale: 'en' | 'ro'): string {
  return facts.map(f => {
    let text = f.text.trim().replace(/[.;]+$/u, '');
    text = text.replace(locale === 'ro' ? /^Eu\s+/u : /^I\s+/u, '');
    return text ? text[0].toLocaleUpperCase(locale) + text.slice(1) : '';
  }).join('; ') + '.';
}
export function validateGroundedProposal(value: unknown, context: EnhancementContext): EnhancementProposal {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== 'factIds,text' ||
    typeof v.text !== 'string' || v.text.length > 6000 || !Array.isArray(v.factIds) || v.factIds.length < 1 || v.factIds.length > 3 ||
    new Set(v.factIds).size !== v.factIds.length) throw new Error('OUTPUT_INVALID');
  const facts = v.factIds.map(id => context.facts.find(f => f.id === id));
  if (facts.some(f => !f)) throw new Error('OUTPUT_UNSUPPORTED');
  const sources = facts as ScopedFact[];
  if (v.text !== composeGrounded(sources, context.locale) && !(sources.length === 1 && v.text === sources[0].text)) throw new Error('OUTPUT_UNSUPPORTED');
  return { status: 'proposal', targetId: context.targetId, text: v.text, sources: structuredClone(sources) };
}

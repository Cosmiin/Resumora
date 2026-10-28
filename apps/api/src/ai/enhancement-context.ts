import { careerContext } from "@resumora/contracts/intelligence/context";
import type { CareerContext, CareerFact } from "@resumora/contracts/intelligence/context";
export type ScopedFact = CareerFact;
export type EnhancementContext = CareerContext;
export const projectEnhancementContext = careerContext;

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

import { careerContext } from "@resumora/contracts/intelligence/context";
import type {
  CareerContext,
  CareerFact,
} from "@resumora/contracts/intelligence/context";
export type ScopedFact = CareerFact;
export type EnhancementContext = CareerContext;
export const projectEnhancementContext = careerContext;

export type EnhancementProposal = {
  status: "proposal";
  targetId: string;
  text: string;
  sources: ScopedFact[];
};
/** Conservative groundwork truth boundary: only exact quotations of verified evidence.
 * Paraphrasing/semantic entailment is deliberately deferred. IDs alone do not prove truth.
 */
export function validateProposal(
  value: unknown,
  context: EnhancementContext,
): EnhancementProposal {
  const v = value as Record<string, unknown> | null;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(",") !== "factIds,text" ||
    typeof v.text !== "string" ||
    !Array.isArray(v.factIds) ||
    v.factIds.length !== 1 ||
    typeof v.factIds[0] !== "string"
  )
    throw new Error("OUTPUT_INVALID");
  const factId = v.factIds[0];
  const fact = context.facts.find((f) => f.id === factId);
  if (!fact || v.text !== fact.text) throw new Error("OUTPUT_UNSUPPORTED");
  return {
    status: "proposal",
    targetId: context.targetId,
    text: v.text,
    sources: [structuredClone(fact)],
  };
}

/** A constrained rewrite grammar, not semantic entailment: combine up to three cited
 * facts, removing a first-person prefix and normalizing terminal punctuation only.
 * No novel words, titles, metrics or qualifications are permitted. */
export function composeGrounded(
  facts: readonly ScopedFact[],
  locale: "en" | "ro",
): string {
  return (
    facts
      .map((f) => {
        let text = f.text.trim().replace(/[.;]+$/u, "");
        text = text.replace(locale === "ro" ? /^Eu\s+/u : /^I\s+/u, "");
        return text ? text[0].toLocaleUpperCase(locale) + text.slice(1) : "";
      })
      .join("; ") + "."
  );
}
export function validateGroundedProposal(
  value: unknown,
  context: EnhancementContext,
): EnhancementProposal {
  const v = value as Record<string, unknown> | null;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(",") !== "factIds,text" ||
    typeof v.text !== "string" ||
    v.text.length > 6000 ||
    !Array.isArray(v.factIds) ||
    v.factIds.length < 1 ||
    v.factIds.length > 3 ||
    new Set(v.factIds).size !== v.factIds.length
  )
    throw new Error("OUTPUT_INVALID");
  const facts = v.factIds.map((id) => context.facts.find((f) => f.id === id));
  if (facts.some((f) => !f)) throw new Error("OUTPUT_UNSUPPORTED");
  const sources = facts as ScopedFact[];
  if (
    v.text !== composeGrounded(sources, context.locale) &&
    !(sources.length === 1 && v.text === sources[0].text)
  )
    throw new Error("OUTPUT_UNSUPPORTED");
  return {
    status: "proposal",
    targetId: context.targetId,
    text: v.text,
    sources: structuredClone(sources),
  };
}

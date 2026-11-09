import { hasUnknownNumber, type Proposal, type TailorFlag as Flag } from "@resumora/shared";

/** Fields that name the employer, the role or its dates: tailoring never changes them. */
export const ENTITY_FIELDS = ["company", "title", "startDate", "endDate"] as const;
type EntityField = (typeof ENTITY_FIELDS)[number];

export type CheckContext = {
  /** CV text, notes, facts and answers the proposal may draw on. */
  sources: string[];
  /** The item's current entity fields, for experience roles. */
  original?: Partial<Record<EntityField, string>>;
};

const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}.#+-]*[\p{L}\p{N}#+]|[\p{L}\p{N}]/gu;

/** "e.g", "i.e": single letters joined by dots. "1st", "3rd": ordinals. Neither is a tool. */
const NOT_TOOL = /^(?:\p{L}(?:\.\p{L})+|\d+(?:st|nd|rd|th))$/iu;

/**
 * Words that look like a tool or technology name: "AWS", "PostgreSQL", "Node.js", "C#", or a capitalised word
 * mid-sentence. A one-word name field (a skill like "Kubernetes") counts too.
 */
function toolNames(text: string, nameField: boolean): string[] {
  return text.split(/[.!?]\s+|\n/).flatMap((sentence) => [...sentence.matchAll(TOKEN)].flatMap((match, index) => {
    const word = match[0];
    if (NOT_TOOL.test(word)) return [];
    const technical = /\p{Ll}\p{Lu}/u.test(word) || (/^\p{Lu}{2,}$/u.test(word)) || (/\p{L}/u.test(word) && /[#+.\d]/.test(word));
    const capitalised = (index > 0 || (nameField && !/\s/.test(text.trim()))) && /^\p{Lu}/u.test(word);
    return technical || capitalised ? [word] : [];
  }));
}

/** Code checks for one proposal: invented numbers, changed employer/title/dates, untagged unknown tools. */
export function checkProposal(proposal: Proposal, ctx: CheckContext): Flag[] {
  const field = proposal.field as EntityField;
  if ((ENTITY_FIELDS as readonly string[]).includes(field)) {
    const before = ctx.original?.[field];
    return before !== undefined && proposal.text.trim() !== before.trim()
      ? [{ rule: "entity", detail: `${field} must stay "${before}"` }] : [];
  }
  const flags: Flag[] = [];
  if (hasUnknownNumber(proposal.text, ctx.sources)) flags.push({ rule: "number", detail: "A number that isn't in your CV, notes or answers" });
  if (!proposal.inferred) {
    const known = new Set(ctx.sources.flatMap((source) => [...source.matchAll(TOKEN)].map((match) => match[0].toLowerCase())));
    const unknown = [...new Set(toolNames(proposal.text, proposal.field === "name").filter((word) => !known.has(word.toLowerCase())))];
    if (unknown.length > 0) flags.push({ rule: "tool", detail: unknown.join(", ") });
  }
  return flags;
}

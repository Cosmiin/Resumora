import type { Experience } from "./cv.ts";

const SEPARATORS = /[\s·|,\-–]+/g;
const squash = (text: string) => text.toLocaleLowerCase().replace(SEPARATORS, "");

/**
 * True when a role's description only repeats its company and/or location (an old import copied the
 * "Company · Location" line there). Case, spaces and the separators · | , - – are ignored, and the
 * location may appear whole or in its parts ("Hamburg" for "Hamburg, Germany").
 */
export function isCopiedDescription(role: Pick<Experience, "company" | "location" | "description">): boolean {
  const text = squash(role.description);
  const pieces = [role.company, role.location, ...role.location.split(",")].map(squash).filter(Boolean);
  if (!text || !pieces.length) return false;
  // Can the text be built from the pieces, one after another? (word-break check)
  const reachable = [true, ...Array<boolean>(text.length).fill(false)];
  for (let end = 1; end <= text.length; end++) {
    reachable[end] = pieces.some((p) => p.length <= end && reachable[end - p.length] && text.startsWith(p, end - p.length));
  }
  return reachable[text.length]!;
}

import type { MatchScore } from "@resumora/shared";

/** The ad's keywords from a score: the ones the CV shows, and the ones it does not (partly there counts as missing). */
export function keywordsOf(score: MatchScore | null): { has: string[]; missing: string[] } {
  const has: string[] = [];
  const missing: string[] = [];
  for (const label of score?.labels ?? []) {
    if (label.kind !== "keyword" || !label.ref.startsWith("k:")) continue;
    const word = label.ref.slice(2).trim();
    if (word) (label.status === "met" ? has : missing).push(word);
  }
  return { has, missing };
}


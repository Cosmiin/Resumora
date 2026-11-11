import type { JobExtraction, ScoredKind } from "@resumora/shared";

/** A label's name: the job's requirement text ("r3" → requirement 3), or a keyword's term ("k:BPMN" → BPMN). */
export function nameOf(ref: string, job: JobExtraction | null): string | null {
  if (ref.startsWith("k:")) return ref.slice(2).trim() || null;
  const index = /^r(\d+)$/.exec(ref)?.[1];
  return index === undefined ? null : job?.requirements[Number(index)]?.text.trim() || null;
}

/** The labels' suffix for an item's kind: roles keep the plain keys. */
export const kindKey = (kind: ScoredKind | undefined) => (kind === "project" || kind === "volunteering" ? `.${kind}` as const : "" as const);

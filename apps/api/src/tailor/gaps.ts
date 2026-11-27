import type { JobExtraction, MatchLabel, MatchScore } from "@resumora/shared";

/** Something the job asks for that the CV does not show yet (or only partly, or only hints at). */
export interface Gap {
  ref: string;
  kind: MatchLabel["kind"];
  /** The requirement's text, or the keyword. */
  text: string;
  status: MatchLabel["status"];
}

const key = (ref: string) => (ref.startsWith("k:") ? ref.toLowerCase() : ref);

/**
 * What a role step may still write for: the Base score's labels that are not plainly met, minus the ones the tailored
 * CV now meets. A tailored score made for other requirements closes keywords only (its requirement refs point elsewhere).
 */
export function openGaps(base: MatchScore, tailored: MatchScore | null, job: Pick<JobExtraction, "requirements">): Gap[] {
  const sameRequirements = tailored?.requirementTexts !== undefined
    && tailored.requirementTexts.length === job.requirements.length
    && tailored.requirementTexts.every((text, index) => text === job.requirements[index]!.text);
  const closed = new Set((tailored?.labels ?? [])
    .filter((label) => (label.kind === "keyword" || sameRequirements) && label.status === "met" && !label.inferred)
    .map((label) => key(label.ref)));
  return base.labels.filter((label) => (label.status !== "met" || label.inferred) && !closed.has(key(label.ref))).flatMap((label) => {
    const text = label.kind === "keyword" ? label.ref.slice(2) : job.requirements[Number(label.ref.slice(1))]?.text;
    return text ? [{ ref: label.ref, kind: label.kind, text, status: label.status }] : [];
  });
}

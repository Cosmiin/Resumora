/** Bump version when assessment inputs, grading instructions or weights change.
 * A version change is assessed lazily on the next profile visit, never in bulk.
 */
export type ExperienceScoringPolicy = {
  rubric: "experience-quality/2" | "experience-quality/3";
  weights: Readonly<Record<"contribution" | "clarity" | "specificity", number>>;
  thresholds: { useful: number; clear: number; substantialWork: number };
};
export const legacyExperiencePolicyVersion = "experience-score/3";
/** Retain old definitions so changing weights never makes saved profiles undecodable. */
export const experiencePolicies: Readonly<
  Record<string, ExperienceScoringPolicy>
> = {
  "experience-score/3": {
    rubric: "experience-quality/2",
    weights: { contribution: 40, clarity: 30, specificity: 30 },
    thresholds: { useful: 50, clear: 75, substantialWork: 40 },
  },
  "experience-score/4": {
    rubric: "experience-quality/2",
    weights: { contribution: 40, clarity: 30, specificity: 30 },
    thresholds: { useful: 50, clear: 75, substantialWork: 40 },
  },
  "experience-score/5": {
    rubric: "experience-quality/3",
    weights: { contribution: 40, clarity: 30, specificity: 30 },
    thresholds: { useful: 50, clear: 75, substantialWork: 40 },
  },
};
const activeVersion = "experience-score/5";
export const experiencePolicy = {
  ...experiencePolicies[activeVersion],
  version: activeVersion,
  settleMs: 1500,
} as const;

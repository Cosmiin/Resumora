import { blankDraft, fact, newRole } from "../base/model";
import {
  detailDimensions,
  experiencePoints,
  experienceText,
} from "@resumora/contracts/intelligence/experience";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";
export function questionFixture(
  suggestedQuestion: string | null = "Who used these reports?",
) {
  const d = blankDraft(),
    r = newRole();
  d.language = "en";
  r.title = fact("Analyst");
  r.context = fact("Prepared reports.\nMaintained SQL queries.");
  d.roles = [r];
  const body = experienceText(d, r.id);
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      assessment: {
        fingerprint: "a".repeat(64),
        body,
        value: {
          rubric: "experience-quality/3",
          policyVersion: experiencePolicy.version,
          feedbackLocale: "en",
          scope: "complete",
          experience: null,
          score: 65,
          dimensions: detailDimensions.map((dimension) => ({
            dimension,
            grade: "missing",
            evidence: [],
          })),
          points: experiencePoints(body).map((point, index) => ({
            id: `p${index}`,
            point,
            meaningful: true,
            contribution: "partial",
            clarity: "specific",
            specificity: "partial",
            score: 65,
            issue: "scope",
            duplicateOf: null,
            strength: null,
            improvement: "Clarify the audience.",
            suggestedQuestion,
          })),
        },
      },
    },
  };
  return d;
}

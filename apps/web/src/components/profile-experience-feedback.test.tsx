import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { blankDraft, newRole, fact, type BaseDraft } from "../base/model";
import {
  experienceText,
  experienceScoreIdentity,
  experiencePoints,
  pointQualityScore,
  experienceQualityScore,
} from "@resumora/contracts/intelligence/experience";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";
import { ExperienceScoreHint } from "./ExperienceScoreHint";
import { ExperienceScoresContext } from "./useProfileExperienceScores";
import { LanguageContext } from "./ui";
function fixture() {
  const draft = blankDraft(),
    role = newRole();
  draft.language = "en";
  role.title = fact("Analyst");
  role.context = fact("Prepared weekly reports for service managers.");
  draft.roles = [role];
  const points = experiencePoints(experienceText(draft, role.id)).map(
    (point, index) => {
      const p = {
        point,
        meaningful: true,
        contribution: "specific" as const,
        clarity: "specific" as const,
        specificity: "specific" as const,
        issue: "none" as const,
      };
      return { ...p, id: `p${index}`, duplicateOf: null, strength: null, improvement: null, suggestedQuestion: null, score: pointQualityScore(p) };
    },
  );
  draft.experienceEnrichment = {
    [role.id]: {
      version: 1,
      assessment: {
        fingerprint: "a".repeat(64),
        body: experienceText(draft, role.id),
        scoreIdentity: experienceScoreIdentity(draft, role.id),
        value: {
          rubric: "experience-quality/3",
          feedbackLocale: "en", scope: "complete", experience: null,
          policyVersion: experiencePolicy.version,
          score: experienceQualityScore(points),
          points,
          dimensions: ["contribution", "methods", "scope", "outcome"].map(
            (dimension) => ({
              dimension: dimension as any,
              grade: "missing" as const,
              evidence: [],
            }),
          ),
        },
      },
    },
  };
  return draft;
}
function view(draft: BaseDraft) {
  const request = vi.fn();
  const result = render(
    <LanguageContext value="en">
      <ExperienceScoresContext
        value={{
          forRole: () => ({
            check: request,
            queue: request,
            preparing: false,
            running: false,
          }),
        }}
      >
        <ExperienceScoreHint draft={draft} id={draft.roles[0].id} />
      </ExperienceScoresContext>
    </LanguageContext>,
  );
  return { ...result, request };
}
it("shows positive feedback for a strong experience without inventing an improvement or making requests", () => {
  const h = view(fixture());
  expect(screen.getByText("Writing quality: 100/100")).toBeTruthy();
  expect(
    screen.getByText(
      "Your contributions are clear and useful. No need to make them longer.",
    ),
  ).toBeTruthy();
  expect(h.request).not.toHaveBeenCalled();
});
it("retains a labelled previous score while suppressing obsolete point advice after edits", () => {
  const draft = fixture();
  draft.roles[0].context = fact("New wording to assess.");
  const h = view(draft);
  expect(
    screen.getByText("Writing quality: 100/100 · previous score"),
  ).toBeTruthy();
  expect(screen.getByText("Updating after your changes…")).toBeTruthy();
  expect(
    screen.queryByText(
      "Your contributions are clear and useful. No need to make them longer.",
    ),
  ).toBeNull();
  expect(h.container.querySelector('[aria-busy="true"]')).toBeTruthy();
});
it("a failed assessment shows unavailable guidance rather than a fabricated score", () => {
  const draft = fixture(),
    id = draft.roles[0].id;
  delete draft.experienceEnrichment![id].assessment;
  draft.experienceEnrichment![id].scorePending = {
    id: crypto.randomUUID(),
    body: experienceText(draft, id),
    scoreIdentity: experienceScoreIdentity(draft, id),
    request: { intent: "score", fingerprint: "a".repeat(64) },
  };
  draft.experienceEnrichment![id].scoreError = "failed";
  const h = view(draft);
  expect(
    screen.getByText(
      "Assessment is unavailable. You can edit or retry inside this experience.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/Writing quality:/)).toBeNull();
  expect(h.container.querySelector('[aria-busy="true"]')).toBeNull();
});

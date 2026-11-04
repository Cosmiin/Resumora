import {experiencePolicy} from "@resumora/contracts/intelligence/experience-policy";
import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ExperienceDetailPanel } from "./ExperienceDetailPanel";
import { LanguageContext } from "./ui";
import {
  detailDimensions,
  type ExperienceSession,
  experiencePoints,
} from "@resumora/contracts/intelligence/experience";
import type { useExperienceScore } from "./useExperienceScore";
function score(): ReturnType<typeof useExperienceScore> {
  return {
    queue: vi.fn(async () => {}),
    running: false,
    preparing: false,
    lastCheck: undefined,
    pending: undefined,
    error: undefined,
    check: vi.fn(async () => {}),
  };
}
function assessment(): NonNullable<ExperienceSession["assessment"]> {
  return {
    fingerprint: "a".repeat(64),
    body: "Applied CV wording.",
    value: {
      rubric: "experience-quality/3", policyVersion:experiencePolicy.version, feedbackLocale:"en", scope:"complete",experience:null,
      points: experiencePoints("Applied CV wording.").map((point,index) => ({
        id:`p${index}`,duplicateOf:null,strength:null,improvement:null,suggestedQuestion:null,
        point,
        meaningful: true,
        contribution: "partial",
        clarity: "specific",
        specificity: "partial",
        issue: "specificity",
        score: 65,
      })),
      score: 65,
      dimensions: detailDimensions.map((dimension, index) => ({
        dimension,
        grade: index === 0 ? "missing" : index === 1 ? "partial" : "specific",
        evidence:
          index < 2 ? (index === 1 ? ["Applied"] : []) : ["CV wording."],
      })),
    },
  };
}
it("shows neutral guidance before an assessment without claiming gaps or requesting AI", () => {
  const request = score();
  render(
    <LanguageContext value="en">
      <ExperienceDetailPanel body="Applied CV wording." score={request} ready />
    </LanguageContext>,
  );
  const panel = screen.getByRole("complementary", {
    name: "Experience quality",
  });
  expect(within(panel).getAllByText("Not assessed")).toHaveLength(4);
  expect(within(panel).queryByText("Missing", { exact: true })).toBeNull();
  expect(request.check).not.toHaveBeenCalled();
  expect(
    within(panel).getByText(
      "Name the tools, technologies or process you used.",
    ),
  ).toBeDefined();
});
it("turns a current saved assessment into neutral absent, partial and well explained guidance", () => {
  render(
    <LanguageContext value="en">
      <ExperienceDetailPanel
        assessment={assessment()}
        body="Applied CV wording."
        score={score()}
        ready
      />
    </LanguageContext>,
  );
  const panel = screen.getByRole("complementary", {
    name: "Experience quality",
  });
  expect(within(panel).getByText("Not stated", { exact: true })).toBeDefined();
  expect(
    within(panel).getByText("Could be clearer", { exact: true }),
  ).toBeDefined();
  expect(
    within(panel).getAllByText("Well explained", { exact: true }),
  ).toHaveLength(2);
  expect(
    within(panel).getByText(
      "Add one concrete detail: what did you do, for whom or why?",
    ),
  ).toBeDefined();
  expect(within(panel).getByRole("meter").getAttribute("aria-valuenow")).toBe(
    "65",
  );
});
it("does not present old grades as current advice after the applied wording changes", () => {
  render(
    <LanguageContext value="en">
      <ExperienceDetailPanel
        assessment={assessment()}
        body="New applied wording."
        score={score()}
        ready
      />
    </LanguageContext>,
  );
  const panel = screen.getByRole("complementary", {
    name: "Experience quality",
  });
  expect(within(panel).getAllByText("Not assessed")).toHaveLength(4);
  expect(within(panel).queryByRole("meter")).toBeNull();
  expect(
    within(panel).getByText(
      "The wording changed. Check again for current guidance.",
    ),
  ).toBeDefined();
});

import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it } from "vitest";
import { GuidedRoleOverview } from "./GuidedRoleOverview";
import { AnswerHint } from "./AnswerHint";
import { LanguageContext } from "./ui";
import type { DetailAssessment } from "@resumora/contracts/intelligence/experience";

it("a high average does not describe a role as needing only refinements when a point lacks a real contribution", () => {
  const assessment: DetailAssessment = {
    rubric: "experience-quality/3",
    policyVersion: "experience-score/5",
    feedbackLocale: "en",
    scope: "complete",
    score: 90,
    dimensions: [],
    experience: null,
    points: [
      {
        id: "p0",
        point: { start: 0, end: 1, text: "x" },
        meaningful: false,
        contribution: "missing",
        clarity: "missing",
        specificity: "missing",
        score: 0,
        issue: "example",
        duplicateOf: null,
        strength: null,
        improvement: "Describe a task you handled.",
        suggestedQuestion: null,
      },
    ],
  };
  render(
    <LanguageContext value="en">
      <GuidedRoleOverview body="x" assessment={assessment}>
        Actions
      </GuidedRoleOverview>
    </LanguageContext>,
  );
  expect(screen.queryByText(/already a strong description/)).toBeNull();
  expect(
    screen.getByRole("button", { name: /Describe a task you handled/ }),
  ).toBeTruthy();
});

it("a specific improvement focuses the exact original point without changing the wording", () => {
  const assessment: DetailAssessment = {
    rubric: "experience-quality/3",
    policyVersion: "experience-score/5",
    feedbackLocale: "en",
    scope: "complete",
    score: 65,
    dimensions: [],
    experience: null,
    points: [
      {
        id: "p1",
        point: { start: 19, end: 34, text: "Checked records." },
        meaningful: true,
        contribution: "partial",
        clarity: "specific",
        specificity: "partial",
        score: 65,
        issue: "scope",
        duplicateOf: null,
        strength: null,
        improvement: "Explain who used the checked records.",
        suggestedQuestion: null,
      },
    ],
  };
  render(
    <LanguageContext value="en">
      <GuidedRoleOverview
        body={"Prepared reports.\n\nChecked records."}
        assessment={assessment}
      >
        <button>Continue</button>
      </GuidedRoleOverview>
    </LanguageContext>,
  );
  const advice = screen.getByRole("button", {
    name: /Point 2.*Explain who used/,
  });
  fireEvent.click(advice);
  const point = document.getElementById(advice.getAttribute("aria-controls")!)!;
  expect(document.activeElement).toBe(point);
  expect(point.textContent).toContain("Checked records.");
  expect(point.classList.contains("is-selected")).toBe(true);
  expect(screen.getByText("Prepared reports.")).toBeTruthy();
});

it("older questions receive useful local guidance without supplying an invented answer", () => {
  render(
    <LanguageContext value="en">
      <AnswerHint
        id="hint"
        question={{
          id: "q",
          dimension: "scale",
          text: "How broad was the work?",
        }}
      />
    </LanguageContext>,
  );
  expect(
    screen.getByText(/Include numbers only if you remember them/),
  ).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
});

it("keeps questions inside the selected original point and guidance on the right", () => {
  render(
    <LanguageContext value="en">
      <GuidedRoleOverview
        body={"Prepared reports.\n\nChecked records."}
        activePoint={{ start: 0, end: 17, text: "Prepared reports." }}
        questioning
      >
        <label>
          Who used the reports?
          <textarea />
        </label>
      </GuidedRoleOverview>
    </LanguageContext>,
  );
  const answer = screen.getByRole("textbox");
  expect(answer.closest(".guided-original-point")?.textContent).toContain(
    "Prepared reports.",
  );
  expect(
    screen
      .getByRole("complementary", { name: "Writing guidance" })
      .contains(answer),
  ).toBe(false);
  expect(screen.getByText("Checked records.")).toBeTruthy();
});
it("offers a labeled illustrative example without inserting it into the answer", () => {
  render(
    <LanguageContext value="en">
      <AnswerHint
        id="example-hint"
        question={{ id: "q", dimension: "impact", text: "What changed?" }}
      />
    </LanguageContext>,
  );
  fireEvent.click(screen.getByText("See an example"));
  expect(screen.getByText(/The team used my weekly report/)).toBeTruthy();
  expect(screen.getByText(/Use your own details/)).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
});

it("does not attach a general question to the last selected point", () => {
  const body = "Prepared reports.\n\nChecked records.";
  const view = render(
    <LanguageContext value="en">
      <GuidedRoleOverview body={body} onSelectPoint={() => {}}>
        Actions
      </GuidedRoleOverview>
    </LanguageContext>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Checked records." }));
  view.rerender(
    <LanguageContext value="en">
      <GuidedRoleOverview body={body} questioning>
        <label>
          General question
          <textarea />
        </label>
      </GuidedRoleOverview>
    </LanguageContext>,
  );
  expect(
    screen.getByRole("textbox").closest(".guided-original-point"),
  ).toBeNull();
});

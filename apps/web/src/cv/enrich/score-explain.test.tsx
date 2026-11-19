import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fingerprint, type Experience, type RoleResult } from "@resumora/shared";
import { FocusOpenProvider } from "./focus-context.ts";
import { RoleScoreList, nextStepOf } from "./RoleScoreList.tsx";
import { ScoreExplain } from "./ScoreExplain.tsx";

const role: Experience = {
  id: "r1", company: "Nordlane Logistics", title: "Operations Analyst", location: "", startDate: "2022-01", endDate: "", current: true, description: "",
  bullets: [
    { id: "b1", text: "Built the weekly delivery report." },
    { id: "b2", text: "Trained six colleagues to run the planning sheets in Excel, halving weekly planning mistakes." },
  ],
  notes: [],
};
const marks = { company: "shown", purpose: "shown", actions: "shown", tools: "shown", results: "shown", scale: "shown", leadership: "na", seniority: "na", people: "applies", domain: "na" } as const;
const result: RoleResult = {
  roleId: "r1", policy: "score/7", fingerprint: fingerprint(role, "en"), score: 88, lines: 86,
  coverage: { score: 92, marks, shape: { amount: false, repeats: true, order: true } },
  bullets: [
    { id: "b1", score: 70, contribution: "specific", clarity: "specific", specificity: "partial", impact: "missing", concise: "specific", issue: "specificity", tip: "Say who used the report.", question: null },
    { id: "b2", score: 100, contribution: "specific", clarity: "specific", specificity: "specific", impact: "specific", concise: "specific", issue: "none", tip: null, question: null },
  ],
  nextStep: { bulletId: "b1", issue: "specificity", tip: "Say who used the report." }, thin: false,
  roleQuestions: [{ id: "rq1", text: "Who did you work with?", options: [], kind: "role", topic: "people" }],
  questions: [],
};
const texts = (list: HTMLElement) => within(list).getAllByRole("listitem").map((li) => li.textContent);

describe("Understand the score", () => {
  it("shows the number, its two parts as bars, a tick per item every role needs, then the checklist that doesn't count", () => {
    render(<ScoreExplain open onClose={() => {}} name="Operations Analyst" role={role} result={result} />);
    expect(screen.getByRole("heading", { name: "Operations Analyst: the score" })).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Your lines · 60%" })).toHaveAttribute("aria-valuenow", "86");
    expect(screen.getByRole("progressbar", { name: "What every role needs · 40%" })).toHaveAttribute("aria-valuetext", "4 of 4");
    expect(texts(screen.getByRole("list", { name: "What every role needs" }))).toEqual([
      "Shown: What you did", "Shown: Tools", "Shown: Results", "Shown: Scale",
    ]);
    expect(texts(screen.getByRole("list", { name: "Shape" }))).toEqual(["○Missing: 3 to 6 lines", "✓Shown: No repeated lines", "✓Shown: Strongest line first"]);
    expect(texts(screen.getByRole("list", { name: "Worth adding" }))).toEqual([
      "✓Shown: What the company does", "✓Shown: What the role was for", "○Missing: People you worked with",
    ]);
  });

  it("takes the role's strongest bullet apart into its five checks", () => {
    render(<ScoreExplain open onClose={() => {}} name="Operations Analyst" role={role} result={result} />);
    expect(screen.getByRole("heading", { name: "What a strong bullet looks like" })).toBeInTheDocument();
    expect(screen.getByText(/“Trained six colleagues to run the planning sheets in Excel/)).toBeInTheDocument();
    expect(texts(screen.getByRole("list", { name: "The five checks" }))).toEqual(["Shown: What you did", "Shown: Clear", "Shown: Specific", "Shown: Result", "Shown: Concise"]);
  });

  it("an older score with no parts shows the number and the bullet only; Close closes", async () => {
    const onClose = vi.fn();
    const old: RoleResult = { ...result, lines: undefined, coverage: undefined, bullets: [{ ...result.bullets[0]!, concise: undefined }] };
    render(<ScoreExplain open onClose={onClose} name="Operations Analyst" role={role} result={old} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(texts(screen.getByRole("list", { name: "The five checks" }))).toEqual(["Shown: What you did", "Shown: Clear", "Missing: Specific: partly", "Missing: Result", "Shown: Concise"]);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("a role's score, clicked in the Contents column", () => {
  function list(over: Partial<RoleResult> = {}, openFocus = vi.fn()) {
    render(
      <FocusOpenProvider value={openFocus}>
        <RoleScoreList items={[{ item: role, kind: "role" }]} scores={new Map([["r1", { state: "ready", result: { ...result, ...over } }]])} onOpen={() => {}} expandable />
      </FocusOpenProvider>,
    );
    return openFocus;
  }

  it("shows the number, one next step with its button, and the link to the explanation", async () => {
    const openFocus = list();
    await userEvent.click(screen.getByRole("button", { name: "Operations Analyst, score 88 of 100, Clear" }));
    // Every core item is shown, and people is only worth adding: the next step is the score's own tip.
    expect(screen.getByText("Next: Say who used the report.")).toBeInTheDocument();
    // The full score card is gone from here: no ring text, no tips list.
    expect(screen.queryByText("How clearly this role tells a recruiter what you did.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Answer 1 question" }));
    expect(openFocus).toHaveBeenCalledWith({ roleId: "r1", mode: "improve" });
    await userEvent.click(screen.getByRole("button", { name: "Understand the score" }));
    expect(screen.getByRole("heading", { name: "Operations Analyst: the score" })).toBeInTheDocument();
  });

  it("the next step is the first of: a core parameter not shown, the score's tip, nothing", () => {
    expect(nextStepOf({ ...result, coverage: { ...result.coverage!, marks: { ...marks, tools: "applies" } } })).toBe("name the tools you used, where you used them.");
    expect(nextStepOf(result)).toBe("Say who used the report.");
    expect(nextStepOf({ ...result, coverage: { ...result.coverage!, marks: { ...marks, people: "na" } }, nextStep: null })).toBeNull();
  });

  // Owner review: below 100 a role can always be worked on, even with no step to name.
  it("below 100 with no step to name, offers to look for what would still raise it", async () => {
    list({ coverage: { ...result.coverage!, marks: { ...marks, people: "na" } }, nextStep: null, roleQuestions: [] });
    await userEvent.click(screen.getByRole("button", { name: /Operations Analyst/ }));
    expect(screen.getByText("Not at 100 yet. I can look for what would still raise it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Improve this role" })).toBeInTheDocument();
  });

  it("at 100 with nothing to add, says so and offers no button", async () => {
    list({ score: 100, coverage: { ...result.coverage!, marks: { ...marks, people: "na" } }, nextStep: null, roleQuestions: [] });
    await userEvent.click(screen.getByRole("button", { name: /Operations Analyst/ }));
    expect(screen.getByText("Nothing to add here right now.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Answer|Improve/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Understand the score" })).toBeInTheDocument();
  });
});

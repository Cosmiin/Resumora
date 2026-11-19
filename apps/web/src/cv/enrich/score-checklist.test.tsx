import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { fingerprint, type Coverage, type Experience, type RoleResult } from "@resumora/shared";
import { RoleChecklist } from "./Checklist.tsx";
import { nextStepOf } from "./RoleScoreList.tsx";
import { ScoreExplain } from "./ScoreExplain.tsx";

const role: Experience = {
  id: "r1", company: "Nordlane Logistics", title: "Operations Analyst", location: "", startDate: "2022-01", endDate: "", current: true, description: "",
  bullets: [{ id: "b1", text: "Built the weekly delivery report." }], notes: [],
};
const allShown = { company: "shown", purpose: "shown", actions: "shown", tools: "shown", results: "shown", scale: "shown" } as const;
const coverage = (over: Partial<Coverage["marks"]> = {}, shape: Coverage["shape"] = { amount: false, repeats: true, order: true }): Coverage => ({
  score: 100, marks: { ...allShown, leadership: "na", seniority: "applies", people: "shown", domain: "unknown", ...over }, shape,
});
const result = (c: Coverage = coverage()): RoleResult => ({
  roleId: "r1", policy: "score/9", fingerprint: fingerprint(role, "en"), score: 88, lines: 80, coverage: c,
  bullets: [{ id: "b1", score: 80, contribution: "specific", clarity: "specific", specificity: "specific", impact: "partial", concise: "specific", issue: "impact", tip: "Say what changed.", question: null }],
  nextStep: { bulletId: "b1", issue: "impact", tip: "Say what changed." }, thin: false, roleQuestions: [], questions: [],
});
const items = (list: HTMLElement) => within(list).getAllByRole("listitem").map((li) => li.textContent);

describe("RoleChecklist", () => {
  it("ticks the shape checks and the worth-adding items that apply, with no row for one that doesn't", () => {
    render(<RoleChecklist result={result()} />);
    expect(items(screen.getByRole("list", { name: "Shape" }))).toEqual([
      "○Missing: 3 to 6 lines", "✓Shown: No repeated lines", "✓Shown: Strongest line first",
    ]);
    expect(items(screen.getByRole("list", { name: "Worth adding" }))).toEqual([
      "○Missing: Seniority and reporting line", "✓Shown: People you worked with", "○Missing: Domain knowledge",
    ]);
    expect(screen.queryByText("Leadership")).toBeNull();
  });

  it("shows nothing for an older score with no marks", () => {
    const { container } = render(<RoleChecklist result={{ ...result(), coverage: undefined }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ScoreExplain", () => {
  it("splits what makes the number from what doesn't change it", () => {
    render(<ScoreExplain open onClose={() => {}} name="Operations Analyst" role={role} result={result()} />);
    expect(screen.getByRole("heading", { name: "What makes the number" })).toBeInTheDocument();
    expect(screen.getByText("Your lines · 60%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Your lines · 60%" })).toHaveAttribute("aria-valuenow", "80");
    expect(screen.getByText("What every role needs · 40%")).toBeInTheDocument();
    expect(screen.getByText("6 of 6")).toBeInTheDocument();
    expect(items(screen.getByRole("list", { name: "What every role needs" }))).toHaveLength(6);
    expect(screen.getByRole("heading", { name: "Doesn't change the number" })).toBeInTheDocument();
    expect(screen.getByText(/They can't lower your score, so answering a question about them is never wasted\./)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Worth adding" })).toBeInTheDocument();
  });

  it("counts the core items shown", () => {
    render(<ScoreExplain open onClose={() => {}} name="Operations Analyst" role={role} result={result(coverage({ tools: "applies", scale: "unknown" }))} />);
    expect(screen.getByText("4 of 6")).toBeInTheDocument();
  });
});

describe("a role's next step", () => {
  it("names only a core item, never one that is worth adding", () => {
    expect(nextStepOf(result(coverage({ leadership: "applies", seniority: "unknown", people: "applies", domain: "applies" })))).toBe("Say what changed.");
    expect(nextStepOf(result(coverage({ tools: "applies", leadership: "applies" })))).toBe("name the tools you used, where you used them.");
  });
});

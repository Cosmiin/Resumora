import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ScoreRows, scoreChange } from "./ScoreRows.tsx";

const rows = [
  { id: "r1", title: "Analyst", meta: "Acme · 2020 – Present", now: 85, was: 70 },
  { id: "r2", title: "Clerk", meta: "Beta · 2018 – 2020", now: 60, was: 60 },
  { id: "r3", title: "Intern", meta: "Gamma", now: 30, was: 35 },
  { id: "r4", title: "Helper", meta: "Delta", now: null },
];

describe("ScoreRows", () => {
  it("shows each role's title, company and period, and its score coloured by band", () => {
    render(<ScoreRows idPrefix="t" rows={rows} />);
    const analyst = screen.getByRole("group", { name: /Analyst/ });
    expect(within(analyst).getByText("Acme · 2020 – Present")).toBeInTheDocument();
    expect(within(analyst).getByText("85").closest("[data-band]")).toHaveAttribute("data-band", "clear");
    expect(within(screen.getByRole("group", { name: /Clerk/ })).getByText("60").closest("[data-band]")).toHaveAttribute("data-band", "goodStart");
    expect(within(screen.getByRole("group", { name: /Intern/ })).getByText("30").closest("[data-band]")).toHaveAttribute("data-band", "needsWork");
  });

  it("without a before score (the start screen) shows no change and no bar", () => {
    render(<ScoreRows idPrefix="t" rows={[{ id: "r1", title: "Analyst", meta: "Acme", now: 85 }]} />);
    const analyst = screen.getByRole("group", { name: /Analyst/ });
    expect(within(analyst).queryByText("+15")).toBeNull();
    expect(analyst.querySelector(".sr-bar")).toBeNull();
  });

  it("with a before score (the end screen) shows the change under the score and a before/after bar", () => {
    render(<ScoreRows idPrefix="t" rows={rows} />);
    const analyst = screen.getByRole("group", { name: /Analyst/ });
    expect(within(analyst).getByText("+15")).toBeInTheDocument();
    expect(within(analyst).getByText("was 70")).toBeInTheDocument();
    const bar = analyst.querySelector(".sr-bar");
    expect(bar?.querySelector(".sr-was")).toHaveStyle({ width: "70%" });
    expect(bar?.querySelector(".sr-now")).toHaveStyle({ width: "85%" });
    // Unchanged: a quieter bar and no change.
    const clerk = screen.getByRole("group", { name: /Clerk/ });
    expect(clerk.querySelector(".sr-bar")).toHaveClass("is-flat");
    expect(clerk.querySelector(".sr-change")).toBeNull();
    // Down: the drop shows.
    expect(within(screen.getByRole("group", { name: /Intern/ })).getByText("−5")).toBeInTheDocument();
  });

  it("a role with no score shows a dash and no bar", () => {
    render(<ScoreRows idPrefix="t" rows={rows} />);
    const helper = screen.getByRole("group", { name: /Helper/ });
    expect(within(helper).getByText("–")).toBeInTheDocument();
    expect(helper.querySelector(".sr-bar")).toBeNull();
  });

  it("scoreChange writes a gain with + and a drop with a minus sign", () => {
    expect(scoreChange(70, 85)).toBe("+15");
    expect(scoreChange(35, 30)).toBe("−5");
    expect(scoreChange(60, 60)).toBe("");
  });
});

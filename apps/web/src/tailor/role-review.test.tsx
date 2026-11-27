import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Proposal } from "@resumora/shared";
import { RoleReview } from "./RoleReview.tsx";

const role = {
  id: "r1", company: "Emedi", title: "Business Analyst", location: "", startDate: "2021-03", endDate: "", current: true,
  description: "Owns reporting for sales.", notes: [],
  bullets: [{ id: "b1", text: "Made weekly reports" }, { id: "b2", text: "Checked data" }, { id: "b3", text: "Ran workshops" }],
};
const proposals: Proposal[] = [
  { itemId: "r1", field: "description", text: "Owns reporting and KPI dashboards for sales.", inferred: false, flags: [] },
  { itemId: "b1", field: "text", text: "Made weekly KPI reports", inferred: false, flags: [] },
  { itemId: "b2", field: "text", text: "Checked data quality with sales leads", inferred: true, flags: [], reason: "From your answer: worked with sales leads" },
];

function review(over: Partial<React.ComponentProps<typeof RoleReview>> = {}) {
  const onAccept = vi.fn();
  render(<RoleReview role={role} proposals={proposals} locale="en" busy={false} onAccept={onAccept} {...over} />);
  return onAccept;
}

const card = () => screen.getByRole("article");
const press = (name: string) => userEvent.setup().click(screen.getByRole("button", { name }));

describe("RoleReview: a role's suggestions, one at a time", () => {
  it("shows the first suggestion alone, with where it stands among them; a suggestion starts chosen; lines with none are only counted", () => {
    review({ position: "Role 1 of 2", keywords: { has: 2, total: 5 } });
    expect(screen.getByRole("heading", { level: 1, name: "Business Analyst, Emedi" })).toBeInTheDocument();
    expect(screen.getByText("Role 1 of 2 · Mar 2021 – Present")).toBeInTheDocument();
    expect(screen.getByText("Suggestion 1 of 3")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(card()).toHaveTextContent("Owns reporting and KPI dashboards for sales.");
    expect(card()).toHaveTextContent("Now: Owns reporting for sales.");
    expect(screen.getByRole("button", { name: "Use this" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("One part of this line is my guess")).toBeNull();
    expect(screen.getByText("1 other line already fits the job and stays as it is.")).toBeInTheDocument();
    expect(screen.queryByText("Ran workshops")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save and continue" })).toBeNull();
  });

  it("Next and Previous walk through the suggestions; a guess waits for an answer; the last one offers Save", async () => {
    review();
    await press("Next suggestion");
    expect(screen.getByText("Suggestion 2 of 3")).toBeInTheDocument();
    expect(card()).toHaveTextContent("Made weekly KPI reports");
    await press("Next suggestion");
    expect(card()).toHaveTextContent("Checked data quality with sales leads");
    expect(screen.getByText("One part of this line is my guess")).toBeInTheDocument();
    expect(screen.getByText("From your answer: worked with sales leads")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, it's true. Use it" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Keep my line" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Next suggestion" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save and continue" })).toBeInTheDocument();
    await press("Previous");
    expect(screen.getByText("Suggestion 2 of 3")).toBeInTheDocument();
  });

  it("sends each decision as made: kept, and reworded with the person's own text; a guess nobody confirmed stays off the CV", async () => {
    const onAccept = review();
    await press("Keep my line");
    await press("Next suggestion");
    await press("Edit the line");
    const box = screen.getByRole("textbox");
    await userEvent.clear(box);
    await userEvent.type(box, "Made weekly KPI reports for sales");
    await press("Save edit");
    await press("Next suggestion");
    await press("Save and continue");
    expect(onAccept).toHaveBeenCalledWith({
      decisions: [{ itemId: "r1", keep: false }, { itemId: "b1", keep: true, text: "Made weekly KPI reports for sales" }, { itemId: "b2", keep: false }], inferred: [], flags: [],
    });
  });

  it("an untouched suggestion is left out, so it is used; a guess is used once the person says it is true", async () => {
    const onAccept = review();
    await press("Next suggestion");
    await press("Next suggestion");
    await press("Yes, it's true. Use it");
    await press("Save and continue");
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "b2", keep: true }], inferred: [], flags: [] });
  });

  it("freezes the suggestion while the role is being saved", () => {
    review({ busy: true, proposals: [proposals[1]!] });
    for (const button of within(card()).getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("Skip this role keeps every line as it is on the CV", async () => {
    const onAccept = review();
    await userEvent.click(screen.getByRole("button", { name: "Skip this role" }));
    expect(onAccept).toHaveBeenCalledWith({
      decisions: [{ itemId: "r1", keep: false }, { itemId: "b1", keep: false }, { itemId: "b2", keep: false }], inferred: [], flags: [],
    });
  });

  it("offers Change my answers only when given, and says how many claims were left out", async () => {
    const onAnswers = vi.fn();
    review({ onAnswers, removed: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Change my answers" }));
    expect(onAnswers).toHaveBeenCalled();
    expect(screen.getByText("We left out 1 claim your CV doesn't back up.")).toBeInTheDocument();
  });

  it("a role with nothing to change says so and goes on", async () => {
    const onAccept = review({ proposals: [] });
    expect(screen.getByText("Nothing to change in this role ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept all for this role" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip this role" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [], inferred: [], flags: [] });
  });
});

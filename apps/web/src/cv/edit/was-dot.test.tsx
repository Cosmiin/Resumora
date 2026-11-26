import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent } from "@resumora/shared";
import { EditablePage } from "./EditablePage.tsx";

const role = (texts: string[]) => ({
  id: "r1", company: "Emedi", title: "Business Analyst", location: "", startDate: "2021-03", endDate: "", current: true, description: "", notes: [],
  bullets: texts.map((text, i) => ({ id: `b${i + 1}`, text })),
});
const original: CvContent = { ...emptyCv("en"), experience: [role(["Made weekly reports", "Checked data"])] };
const tailored: CvContent = { ...emptyCv("en"), experience: [role(["Built weekly KPI reports", "Checked data"])] };

function page(over: Partial<React.ComponentProps<typeof EditablePage>> = {}) {
  const dispatch = vi.fn();
  render(<EditablePage cv={tailored} dispatch={dispatch} opened={new Set()} onOpen={vi.fn()} tailored original={original} {...over} />);
  return dispatch;
}

describe("the tailored CV marks each changed line with a dot", () => {
  it("puts a dot only on a line tailoring changed", () => {
    page();
    expect(screen.getAllByRole("button", { name: "Changed for this job: see the old wording" })).toHaveLength(1);
  });

  it("the dot shows the old wording and brings it back", async () => {
    const dispatch = page();
    const dot = screen.getByRole("button", { name: "Changed for this job: see the old wording" });
    expect(screen.queryByText("Made weekly reports")).toBeNull();
    await userEvent.click(dot);
    expect(dot).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Made weekly reports")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Use original wording" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setBullet", owner: { list: "experience", itemId: "r1" }, bulletId: "b1", text: "Made weekly reports" });
  });

  it("shows no dot on the Base CV", () => {
    page({ tailored: false, original: undefined });
    expect(screen.queryByRole("button", { name: "Changed for this job: see the old wording" })).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type Proposal } from "@resumora/shared";
import { SectionReview } from "./SectionReview.tsx";

const cv = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, summary: "Payroll lead for 40 staff." } };
const summary: Proposal = {
  itemId: "summary", field: "summary", inferred: false, flags: [],
  text: "Payroll lead for 40 staff who works across borders and coaches new staff.",
  guesses: [
    { text: "works across borders", reason: "from your roles in Hamburg and Bucharest" },
    { text: "coaches new staff", reason: "you trained the team" },
  ],
};

function review(proposals: Proposal[] = [summary]) {
  const onAccept = vi.fn();
  render(<SectionReview section="summary" proposals={proposals} flags={[]} confirmed={[]} busy={false} onAccept={onAccept} cv={cv} />);
  return onAccept;
}
const guess = (n: number) => screen.getAllByRole("listitem")[n]!;

describe("SummaryReview (SumA)", () => {
  it("shows the new summary as in the CV: new words in green, each guess marigold with its reason and Keep / Edit / Remove", () => {
    review();
    expect(document.querySelector(".tailor-doc p")?.textContent).toBe(summary.text);
    const marks = [...document.querySelectorAll("mark.tailor-guess")].map((mark) => mark.textContent);
    expect(marks).toEqual(["works across borders", "coaches new staff"]);
    expect(document.querySelector("mark.tailor-new")?.textContent).toContain("who");
    expect(screen.getByText("AI guess: from your roles in Hamburg and Bucharest. True?")).toBeInTheDocument();
    for (const name of ["Keep", "Edit", "Remove"]) expect(within(guess(0)).getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    expect(screen.queryByText(/Please check/)).toBeNull();
  });

  it("Remove drops exactly that guess; the other, unanswered, is sent as neither (kept, unreviewed)", async () => {
    const user = userEvent.setup();
    const onAccept = review();
    await user.click(within(guess(0)).getByRole("button", { name: /^Remove/ }));
    expect(document.querySelector("del.tailor-guess")?.textContent).toBe("works across borders");
    await user.click(screen.getByRole("button", { name: "Use this summary" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "summary", keep: true }], inferred: [{ itemId: "summary#0", keep: false }], flags: [] });
  });

  it("Edit replaces the guess with the typed text", async () => {
    const user = userEvent.setup();
    const onAccept = review();
    await user.click(within(guess(1)).getByRole("button", { name: /^Edit/ }));
    const box = within(guess(1)).getByRole("textbox");
    await user.clear(box);
    await user.type(box, "trains new staff");
    await user.click(within(guess(1)).getByRole("button", { name: "Save" }));
    expect([...document.querySelectorAll("mark.tailor-guess")].map((mark) => mark.textContent)).toEqual(["works across borders", "trains new staff"]);
    await user.click(within(guess(0)).getByRole("button", { name: /^Keep/ }));
    await user.click(screen.getByRole("button", { name: "Use this summary" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "summary", keep: true }],
      inferred: [{ itemId: "summary#0", keep: true }, { itemId: "summary#1", keep: true, text: "trains new staff" }], flags: [] });
  });

  it("\"Use my original summary\" sends keep: false", async () => {
    const user = userEvent.setup();
    const onAccept = review();
    await user.click(screen.getByRole("button", { name: "Use my original summary" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "summary", keep: false }], inferred: [], flags: [] });
  });

  it("with no summary change it says so and continues", async () => {
    const user = userEvent.setup();
    const onAccept = review([]);
    expect(screen.getByText("Summary: nothing to change ✓")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [], inferred: [], flags: [] });
  });
});

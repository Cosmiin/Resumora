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
    expect(screen.getByRole("heading", { name: "About me" }).closest(".page-sheet")).toBeInTheDocument();
    const old = document.querySelector(".page-sheet .page-del");
    const inserted = document.querySelector(".page-sheet .page-ins");
    expect(old).toHaveTextContent(cv.basics.summary);
    expect(inserted?.textContent).toBe(summary.text);
    expect(old?.nextElementSibling).toBe(inserted);
    expect(screen.getByRole("heading", { name: "Your new summary" }).closest(".page-note.tailor-card")).toBeInTheDocument();
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

  it("a summary guessed as a whole (no exact phrases) is marked with its reason and sent as neither: kept, unreviewed", async () => {
    const user = userEvent.setup();
    const onAccept = review([{ itemId: "summary", field: "summary", inferred: true, flags: [], text: "Payroll lead abroad.", reason: "Your roles abroad." }]);
    expect(document.querySelector("mark.tailor-guess")?.textContent).toBe("Payroll lead abroad.");
    expect(screen.getByText("AI guess: Your roles abroad. True?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use this summary" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [], inferred: [], flags: [] });
  });

  it("\"Use my original summary\" sends keep: false", async () => {
    const user = userEvent.setup();
    const onAccept = review();
    await user.click(screen.getByRole("button", { name: "Use my original summary" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "summary", keep: false }], inferred: [], flags: [] });
  });

  it("shows an unchanged proposal plain, ignoring surrounding spaces", () => {
    review([{ ...summary, text: `  ${cv.basics.summary}  `, guesses: [] }]);
    expect(document.querySelector(".page-sheet .tailor-doc p")).toHaveTextContent(cv.basics.summary);
    expect(document.querySelector(".page-del, .page-ins")).toBeNull();
  });

  it("Remove updates a guess in an unchanged summary without marking the summary deleted or inserted", async () => {
    const user = userEvent.setup();
    review([{ ...summary, text: cv.basics.summary, guesses: [{ text: "40 staff", reason: "From your role" }] }]);
    const page = document.querySelector(".page-sheet")!;
    expect(page.querySelector("mark.tailor-guess")).toHaveTextContent("40 staff");
    expect(page.querySelector(".page-del, .page-ins")).toBeNull();
    await user.click(within(guess(0)).getByRole("button", { name: /^Remove/ }));
    expect(page.querySelector("del.tailor-guess")).toHaveTextContent("40 staff");
    expect(page.querySelector("mark.tailor-guess")).toBeNull();
    expect(page.querySelector(".page-del, .page-ins")).toBeNull();
  });

  it("with no summary change it says so and continues", async () => {
    const user = userEvent.setup();
    const onAccept = review([]);
    expect(document.querySelector(".page-sheet .tailor-doc p")?.textContent).toBe(cv.basics.summary);
    expect(document.querySelector(".page-del, .page-ins")).toBeNull();
    expect(screen.getByText("Summary: nothing to change ✓")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [], inferred: [], flags: [] });
  });
});

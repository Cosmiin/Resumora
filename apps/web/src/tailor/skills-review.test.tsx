import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type Proposal } from "@resumora/shared";
import { SectionReview } from "./SectionReview.tsx";
import { SkillsReview } from "./SkillsReview.tsx";

const cv = { ...emptyCv("en"), technicalSkills: Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `Old ${i}` })) };
const reworded = (i: number): Proposal => ({ itemId: `s${i}`, field: "name", text: `New ${i}`, inferred: false, flags: [] });
const added = (name: string, reason: string): Proposal => ({ itemId: "new-skill", field: "name", text: name, inferred: true, flags: [], reason });
// 10 renamed skills, then 2 new ones: 12 changes.
const twelve = [...Array.from({ length: 10 }, (_, i) => reworded(i)),
  added("BPMN", "Used in: Business Analyst · Emedi"), added("SQL", "Used in: Analyst · Beta")];

function review(proposals = twelve) {
  const onAccept = vi.fn();
  render(<SkillsReview proposals={proposals} cv={cv} busy={false} onAccept={onAccept} />);
  return onAccept;
}

describe("SkillsReview (SkillsA2)", () => {
  it("12 changes give 3 batches of 5, 5 and 2", async () => {
    const user = userEvent.setup();
    review();
    expect(screen.getByText("Batch 1 of 3")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    const note = within(document.querySelector<HTMLElement>(".tailor-card")!);
    expect(note.getByText("Old 0")).toBeInTheDocument();
    expect(note.getByText("New 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save skills" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next 5" }));
    expect(screen.getByText("Batch 2 of 3")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Next 5" }));
    expect(screen.getByText("Batch 3 of 3")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Used in: Business Analyst · Emedi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next 5" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save skills" })).toBeInTheDocument();
  });

  it("Undo in batch 1 survives going to batch 2 and back", async () => {
    const user = userEvent.setup();
    review();
    await user.click(screen.getByRole("button", { name: "Undo New 1" }));
    expect(screen.getByRole("button", { name: "Undo New 1" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Next 5" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Batch 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo New 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Undo New 2" })).toHaveAttribute("aria-pressed", "false");
  });

  it("accept sends every decision once; guesses only when decided", async () => {
    const user = userEvent.setup();
    const onAccept = review();
    await user.click(screen.getByRole("button", { name: "Undo New 1" }));
    await user.click(screen.getByRole("button", { name: "Next 5" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Next 5" }));
    await user.click(screen.getByRole("button", { name: "Next 5" }));
    await user.click(screen.getByRole("button", { name: "Remove SQL" }));
    await user.click(screen.getByRole("button", { name: "Save skills" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith({
      decisions: Array.from({ length: 10 }, (_, i) => ({ itemId: `s${i}`, keep: i !== 1 })),
      inferred: [{ itemId: "new-skill:SQL", keep: false }], flags: [],
    });
  });

  it("a guess can be kept, and Undo can be taken back", async () => {
    const user = userEvent.setup();
    const onAccept = review([reworded(0), added("BPMN", "Used in: Business Analyst · Emedi")]);
    expect(screen.getByText("Batch 1 of 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep BPMN" }));
    await user.click(screen.getByRole("button", { name: "Undo New 0" }));
    await user.click(screen.getByRole("button", { name: "Undo New 0" }));
    await user.click(screen.getByRole("button", { name: "Save skills" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "s0", keep: true }], inferred: [{ itemId: "new-skill:BPMN", keep: true }], flags: [] });
  });

  it("shows current skills in order, marks this batch and updates Undo and Remove on the page", async () => {
    const user = userEvent.setup();
    const current = { ...emptyCv("en"), technicalSkills: [{ id: "js", name: "a bit of JavaScript" }],
      professionalSkills: [{ id: "team", name: "Teamwork" }] };
    render(<SkillsReview cv={current} busy={false} onAccept={vi.fn()} proposals={[
      { ...reworded(0), itemId: "js", text: "JavaScript (code steps)" }, added("Webhooks", "Used in your roles"),
    ]} />);
    const page = document.querySelector<HTMLElement>(".page-sheet")!;
    expect(within(page).getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(within(page).getByText("a bit of JavaScript")).toHaveClass("page-del");
    expect(within(page).getByText("JavaScript (code steps)")).toHaveClass("page-ins");
    expect(within(page).getByText("Webhooks")).toHaveClass("page-ins");
    expect(page.querySelector("p")?.textContent).toBe("a bit of JavaScript JavaScript (code steps), Teamwork, Webhooks");
    await user.click(screen.getByRole("button", { name: "Undo JavaScript (code steps)" }));
    expect(page.querySelector(".page-del")).toBeNull();
    expect(page).toHaveTextContent("a bit of JavaScript, Teamwork, Webhooks");
    expect(within(page).queryByText("JavaScript (code steps)")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Remove Webhooks" }));
    expect(page.querySelector("p")?.textContent).toBe("a bit of JavaScript, Teamwork");
    expect(page.querySelector(".page-ins")).toBeNull();
  });

  it("shows an unchanged skill plain, ignoring surrounding spaces", () => {
    review([{ ...reworded(0), text: "  Old 0  " }]);
    const page = document.querySelector(".page-sheet")!;
    expect(page).toHaveTextContent("Old 0, Old 1");
    expect(page.querySelector(".page-del, .page-ins")).toBeNull();
  });

  it("without a CV shows only this batch's kept proposal names", async () => {
    const user = userEvent.setup();
    render(<SkillsReview proposals={twelve} busy={false} onAccept={vi.fn()} />);
    const page = document.querySelector(".page-sheet")!;
    expect(page.querySelector("p")?.textContent).toBe("New 0, New 1, New 2, New 3, New 4");
    expect(page.querySelectorAll(".page-ins")).toHaveLength(5);
    expect(page.querySelector(".page-del")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next 5" }));
    expect(page.querySelector("p")?.textContent).toBe("New 5, New 6, New 7, New 8, New 9");
  });

  it("the Skills step of SectionReview uses the batches", () => {
    render(<SectionReview section="skills" proposals={[reworded(0)]} flags={[]} confirmed={[]} busy={false} onAccept={vi.fn()} cv={cv} removed={1} />);
    expect(screen.getByText("Batch 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("We left out 1 claim your CV doesn't back up.")).toBeInTheDocument();
  });
});

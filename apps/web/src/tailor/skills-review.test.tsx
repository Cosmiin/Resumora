import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("Old 0")).toBeInTheDocument();
    expect(screen.getByText("New 0")).toBeInTheDocument();
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

  it("the Skills step of SectionReview uses the batches", () => {
    render(<SectionReview section="skills" proposals={[reworded(0)]} flags={[]} confirmed={[]} busy={false} onAccept={vi.fn()} cv={cv} removed={1} />);
    expect(screen.getByText("Batch 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("We left out 1 claim your CV doesn't back up.")).toBeInTheDocument();
  });
});

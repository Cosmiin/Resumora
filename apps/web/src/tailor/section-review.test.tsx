import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CATEGORY } from "@resumora/shared";
import { flagFor, SectionReview } from "./SectionReview.tsx";

describe("SectionReview", () => {
  it("shows a new section order with the editor's section names, not raw keys", () => {
    render(<SectionReview section="layout" flags={[]} confirmed={[]} busy={false} onAccept={vi.fn()}
      proposals={[{ itemId: "layout", field: "order", text: "summary,experience,skills", inferred: false, flags: [] }]} />);
    const names = [CATEGORY.summary.label.en, CATEGORY.experience.label.en, CATEGORY.skills.label.en].join(" → ");
    expect(screen.getByText(names)).toBeInTheDocument();
    expect(screen.queryByText("summary,experience,skills")).toBeNull();
  });

  it("finds a flag question by its item key, whatever its wording", () => {
    const proposal = { itemId: "b1", field: "text", text: "Cut errors by 30%", inferred: false, flags: [{ rule: "number" as const, detail: "x" }] };
    const question = { id: "q1", section: "experience" as const, roleId: "r1", kind: "flag" as const, options: ["Keep it", "Use original wording"],
      reason: "number", itemId: "b1", text: 'Please check the bullet in Dev at Acme: "Cut errors by 30%".' };
    expect(flagFor(proposal, [question])).toBe(question);
    expect(flagFor({ ...proposal, itemId: "b2" }, [question])).toBeUndefined();
  });
});

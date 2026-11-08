import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CATEGORY } from "@resumora/shared";
import { SectionReview } from "./SectionReview.tsx";

describe("SectionReview", () => {
  it("shows a new section order with the editor's section names, not raw keys", () => {
    render(<SectionReview section="layout" flags={[]} confirmed={[]} busy={false} onAccept={vi.fn()}
      proposals={[{ itemId: "layout", field: "order", text: "summary,experience,skills", inferred: false, flags: [] }]} />);
    const names = [CATEGORY.summary.label.en, CATEGORY.experience.label.en, CATEGORY.skills.label.en].join(" → ");
    expect(screen.getByText(names)).toBeInTheDocument();
    expect(screen.queryByText("summary,experience,skills")).toBeNull();
  });
});

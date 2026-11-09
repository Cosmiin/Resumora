import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type Proposal } from "@resumora/shared";
import { SectionReview } from "./SectionReview.tsx";

// E6 Task 10b: courses, publications, interests (and awards) in Final touches: reworded lines highlighted,
// most relevant first, and "Hide for this job?" applied for you (untick to keep).
const cv = {
  ...emptyCv("en"),
  courses: [
    { id: "c1", name: "Excel for finance", provider: "Coursera", date: "2024", bullets: [{ id: "c1-l1", text: "Pivot tables for payroll" }] },
    { id: "c2", name: "Payroll tax law", provider: "CECCAR", date: "2023" },
  ],
  interests: [{ id: "i1", name: "Knitting" }, { id: "i2", name: "Spreadsheets" }],
  awards: [{ id: "a1", name: "Chess cup", issuer: "", date: "", description: "" }],
};
const p = (itemId: string, field: string, text: string): Proposal => ({ itemId, field, text, inferred: false, flags: [] });

describe("lighter sections in Final touches", () => {
  it("shows the courses most relevant first, with the reworded line highlighted; Use the new version keeps every change", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(<SectionReview section="courses" proposals={[p("order", "order", "c2,c1"), p("c1-l1", "text", "Pivot tables for payroll accuracy")]}
      flags={[]} confirmed={[]} busy={false} onAccept={onAccept} cv={cv} />);
    expect(screen.getByRole("heading", { name: "Courses & training" })).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Courses & training" })).getAllByRole("listitem").filter((li) => li.dataset.item);
    expect(items.map((li) => li.dataset.item)).toEqual(["c2", "c1"]);
    expect(document.querySelector("mark.tailor-new")?.textContent).toBe("accuracy");
    expect(screen.getByText("Most relevant first")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use the new version" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "order", keep: true }, { itemId: "c1-l1", keep: true }], inferred: [], flags: [] });
  });

  it("offers an unrelated interest for hiding, ticked to start; unticking keeps it on the CV", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(<SectionReview section="interests" proposals={[p("hide:i1", "hidden", "Not linked to payroll")]}
      flags={[]} confirmed={[]} busy={false} onAccept={onAccept} cv={cv} />);
    const box = screen.getByRole("checkbox", { name: "Hide Knitting for this job" });
    expect(box).toBeChecked();
    expect(screen.getByText("Not linked to payroll")).toBeInTheDocument();
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Use the new version" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "hide:i1", keep: false }], inferred: [], flags: [] });
  });

  it("Keep the original undoes the order, the rewording and the hiding", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(<SectionReview section="courses" proposals={[p("order", "order", "c2,c1"), p("hide:c1", "hidden", "Not about payroll"), p("c1-l1", "text", "Pivot tables")]}
      flags={[]} confirmed={[]} busy={false} onAccept={onAccept} cv={cv} />);
    await user.click(screen.getByRole("button", { name: "Keep the original" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [
      { itemId: "order", keep: false }, { itemId: "hide:c1", keep: false }, { itemId: "c1-l1", keep: false },
    ], inferred: [], flags: [] });
  });

  it("leaves out a blank interest (browser check)", () => {
    render(<SectionReview section="interests" proposals={[p("hide:i1", "hidden", "Not linked to payroll")]}
      flags={[]} confirmed={[]} busy={false} onAccept={vi.fn()} cv={{ ...cv, interests: [{ id: "i0", name: " " }, ...cv.interests] }} />);
    const items = within(screen.getByRole("list", { name: "Interests" })).getAllByRole("listitem");
    expect(items.map((li) => li.dataset.item)).toEqual(["i1", "i2"]);
  });

  it("Awards get the same hide row in their existing screen", () => {
    render(<SectionReview section="achievements" proposals={[p("hide:a1", "hidden", "Not about payroll")]}
      flags={[]} confirmed={[]} busy={false} onAccept={vi.fn()} cv={cv} />);
    expect(screen.getByRole("heading", { name: "Achievements" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Hide Chess cup for this job" })).toBeChecked();
  });
});

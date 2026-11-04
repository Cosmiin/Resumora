import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent } from "@resumora/shared";
import { sampleCv } from "../../test/sample-cv.ts";
import { CvDocument } from "./CvDocument.tsx";
import type { BlockRef } from "./blocks.ts";

describe("CvDocument", () => {
  it("draws every filled section", () => {
    render(<CvDocument content={sampleCv()} />);
    for (const text of [
      "Ana Maria Popescu",
      "Product Manager · Team Lead",
      "Senior Product Manager",
      "Product Analyst",
      "Babes-Bolyai University",
      "SQL",
      "Roadmapping",
      "Romanian",
      "Certified Scrum Product Owner",
      "Open-source invoice templates",
      "Volunteering",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("read-only page has no buttons and hides empty sections", () => {
    const cv = emptyCv();
    cv.basics.fullName = "Ana";
    render(<CvDocument content={cv} />);
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Experience" })).not.toBeInTheDocument();
  });

  it("clicking a role selects it", async () => {
    const cv = sampleCv();
    const onSelect = vi.fn();
    const { rerender } = render(<CvDocument content={cv} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Senior Product Manager" }));
    const ref: BlockRef = { section: "experience", itemId: cv.experience[0]!.id };
    expect(onSelect).toHaveBeenCalledWith(ref);
    rerender(<CvDocument content={cv} onSelect={onSelect} selected={ref} />);
    expect(screen.getByRole("button", { name: "Edit Senior Product Manager" })).toHaveAttribute("aria-pressed", "true");
  });

  it("an empty CV offers places to start", async () => {
    const onSelect = vi.fn();
    render(<CvDocument content={emptyCv()} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Add your name" }));
    expect(onSelect).toHaveBeenLastCalledWith({ section: "basics" });
    await userEvent.click(screen.getByRole("button", { name: "Add a short summary" }));
    expect(onSelect).toHaveBeenLastCalledWith({ section: "summary" });
  });

  it("skills to sort only show when asked", () => {
    const { rerender } = render(<CvDocument content={sampleCv()} />);
    expect(screen.queryByText("Management")).not.toBeInTheDocument();
    rerender(<CvDocument content={sampleCv()} showUnsorted />);
    expect(screen.getByText("Management")).toBeInTheDocument();
  });

  it("a long CV draws every role", () => {
    const base = sampleCv().experience[0]!;
    const experience: CvContent["experience"] = Array.from({ length: 15 }, (_, i) => ({
      ...base,
      id: `r${i}`,
      title: `Role ${i + 1}`,
    }));
    render(<CvDocument content={sampleCv({ experience })} />);
    for (let i = 1; i <= 15; i++) expect(screen.getByText(`Role ${i}`)).toBeInTheDocument();
  });

  it("Romanian dates and diacritics", () => {
    const base = sampleCv().experience[0]!;
    const title = "Inginer Software Senior – Endava, Iași";
    const experience = [{ ...base, title, startDate: "2021-03", endDate: "", current: true }];
    render(<CvDocument content={sampleCv({ locale: "ro", experience })} />);
    expect(screen.getByText(/mar\. 2021 – prezent/)).toBeInTheDocument();
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});

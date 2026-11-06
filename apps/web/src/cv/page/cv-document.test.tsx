import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { emptyCv, type CvContent } from "@resumora/shared";
import { sampleCv } from "../../test/sample-cv.ts";
import { CvDocument } from "./CvDocument.tsx";
import { RoleItem } from "../edit/sections/RoleItem.tsx";
import type { RoleScoreState } from "../enrich/useRoleScores.ts";

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

  it("sections follow layout order", () => {
    const base = sampleCv();
    const layout = { ...base.layout, order: ["education" as const, ...base.layout.order.filter((k) => k !== "education")] };
    render(<CvDocument content={sampleCv({ layout })} />);
    const edu = screen.getByRole("heading", { name: "Education" });
    const exp = screen.getByRole("heading", { name: "Experience" });
    expect(edu.compareDocumentPosition(exp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hidden sections are not rendered", () => {
    const base = sampleCv();
    render(<CvDocument content={sampleCv({ layout: { ...base.layout, hidden: ["education"] } })} />);
    expect(screen.queryByRole("heading", { name: "Education" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Experience" })).toBeInTheDocument();
  });

  it("an own heading replaces the standard one", () => {
    const base = sampleCv();
    render(<CvDocument content={sampleCv({ layout: { ...base.layout, titles: { experience: "Work history" } } })} />);
    expect(screen.getByRole("heading", { name: "Work history" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Experience" })).not.toBeInTheDocument();
  });

  it("a Romanian CV uses Romanian headings", () => {
    render(<CvDocument content={sampleCv({ locale: "ro" })} />);
    expect(screen.getByRole("heading", { name: "Experiență profesională" })).toBeInTheDocument();
  });

  it("key achievements and interests render", () => {
    render(
      <CvDocument
        content={sampleCv({
          achievements: [{ id: "a1", text: "Doubled revenue in a year." }],
          interests: [{ id: "i1", name: "Chess" }],
          awards: [{ id: "w1", name: "Best Newcomer", issuer: "Contoso", date: "2019-06", description: "" }],
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Key achievements" })).toBeInTheDocument();
    expect(screen.getByText("Doubled revenue in a year.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Interests" })).toBeInTheDocument();
    expect(screen.getByText("Chess")).toBeInTheDocument();
    expect(screen.getByText("Best Newcomer")).toBeInTheDocument();
  });
});

describe("CvDocument notes", () => {
  it("never renders a note", () => {
    const cv = sampleCv();
    cv.experience[0]!.notes = [
      { id: "n1", question: "SECRET-QUESTION", answer: "SECRET-NOTE", via: ["type"], askedAt: "2026-01-01T00:00:00.000Z" },
    ];
    const { container } = render(<CvDocument content={cv} />);
    expect(container.textContent).not.toContain("SECRET-NOTE");
    expect(container.textContent).not.toContain("SECRET-QUESTION");
  });
});


describe("CV role score", () => {
  function renderRole() {
    const role = sampleCv().experience[0]!;
    const score: RoleScoreState = {
      state: "ready",
      result: {
        roleId: role.id, policy: "score/2", fingerprint: "current", score: 84,
        bullets: [], nextStep: null, questions: [],
      },
    };
    return render(<RoleItem role={role} list="experience" locale="en" dispatch={() => {}} score={score} />);
  }

  it("places the score directly after the title inside the role heading row", () => {
    renderRole();
    const title = screen.getByRole("textbox", { name: "Role title" });
    const heading = title.closest(".cv-item-head")!;
    const pill = within(heading as HTMLElement).getByRole("button", { name: "Score 84 of 100, Clear. Open tips" });
    expect(title.nextElementSibling).toBe(pill);
    expect(pill.parentElement).toBe(heading);
  });

  it("marks the score pill as hidden when printed", () => {
    const { container } = renderRole();
    expect(container.querySelector("[data-score-for]")).toHaveClass("no-print");
  });

  it("leaves no score pill in the old role gutter", () => {
    const { container } = renderRole();
    expect(container.querySelector(".cv-role > .score-pill")).toBeNull();
  });
});

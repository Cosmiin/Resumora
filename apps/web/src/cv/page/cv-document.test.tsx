import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { emptyCv, type CvContent } from "@resumora/shared";
import { sampleCv } from "../../test/sample-cv.ts";
import { CvDocument } from "./CvDocument.tsx";
import { RoleItem } from "../edit/sections/RoleItem.tsx";
import type { RoleScoreState } from "../enrich/useRoleScores.ts";

const photos = vi.hoisted(() => ({ sign: vi.fn(), from: vi.fn() }));
vi.mock("../../lib/supabase.ts", () => ({ supabase: { storage: { from: photos.from } } }));

beforeEach(() => {
  photos.from.mockReset().mockReturnValue({ createSignedUrl: photos.sign });
  photos.sign.mockReset().mockResolvedValue({ data: { signedUrl: "https://example.test/photo" }, error: null });
});

describe("CV document photos", () => {
  const withPhoto = () => {
    const cv = emptyCv();
    cv.basics.photo = { path: "user-a/photo.jpg", x: 25, y: 75, zoom: 2 };
    return cv;
  };

  it.each(["classic", "modern"] as const)("shows a signed photo and its crop for %s", async (template) => {
    const { rerender } = render(<CvDocument content={withPhoto()} template={template} />);
    const image = await screen.findByRole("img", { name: "CV photo" });
    expect(image).toHaveAttribute("src", "https://example.test/photo");
    expect(image).toHaveStyle({ objectPosition: "25% 75%", transform: "scale(2)" });
    expect(image.closest("header")).not.toBeNull();
    expect(photos.from).toHaveBeenCalledWith("cv-photos");
    expect(photos.sign).toHaveBeenCalledWith("user-a/photo.jpg", 3600);
    rerender(<CvDocument content={withPhoto()} template="compact" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("does not request photos when the template disables them or the CV has none", () => {
    const { rerender } = render(<CvDocument content={withPhoto()} template="compact" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(photos.sign).not.toHaveBeenCalled();
    rerender(<CvDocument content={emptyCv()} template="modern" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(photos.sign).not.toHaveBeenCalled();
  });

  it.each(["error", "rejection"])("renders no photo when signing returns an %s", async (failure) => {
    if (failure === "error") photos.sign.mockResolvedValue({ data: null, error: { message: "missing" } });
    else photos.sign.mockRejectedValue(new Error("offline"));
    render(<CvDocument content={withPhoto()} template="modern" />);
    await waitFor(() => expect(photos.sign).toHaveBeenCalled());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("hides an image that fails to load", async () => {
    render(<CvDocument content={withPhoto()} template="modern" />);
    fireEvent.error(await screen.findByRole("img"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

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
        bullets: [], nextStep: null, questions: [], roleQuestions: [], thin: false,
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

  it("names the skill groups in the CV's language, not the interface's", () => {
    render(<CvDocument content={{ ...sampleCv(), locale: "ro" }} />);
    expect(screen.getByText("Tehnice")).toBeInTheDocument();
    expect(screen.getByText("Profesionale")).toBeInTheDocument();
    expect(screen.queryByText("Technical")).toBeNull();
  });
});

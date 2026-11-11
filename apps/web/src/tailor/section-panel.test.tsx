import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { emptyCv, type TailorQuestion } from "@resumora/shared";

vi.mock("../cv/enrich/useVoice.ts", () => ({
  useVoice: () => ({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0, interrupted: false,
    start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() }),
}));
import { QuestionCard } from "./QuestionCard.tsx";

const cv = {
  ...emptyCv("en"),
  basics: { ...emptyCv("en").basics, summary: "Analyst who automates HR work." },
  technicalSkills: [{ id: "s1", name: "SQL" }, { id: "s2", name: "Make" }],
  professionalSkills: [{ id: "s3", name: "Process mapping" }],
};
const question = (over: Partial<TailorQuestion>): TailorQuestion => ({
  id: "q1", section: "skills", roleId: null, text: "Do you know RAG?", kind: "skill", options: ["Yes", "No"], reason: "The ad asks for it", ...over,
});
const show = (q: TailorQuestion, withCv = true) => render(<QuestionCard question={q} progress="Question 1 of 2" index={0} total={2}
  onNext={vi.fn()} onSkip={vi.fn()} cv={withCv ? cv : undefined} />);

describe("what a question outside the roles will change", () => {
  it("a skills question shows the CV's skills beside it, with the skill in question as a lit place", () => {
    show(question({ skill: "RAG" }));
    const panel = screen.getByRole("complementary", { name: "Skills" });
    expect(within(panel).getByText("Your skills, as they are on your CV now")).toBeInTheDocument();
    for (const name of ["SQL", "Make", "Process mapping"]) expect(within(panel).getByText(name)).toBeInTheDocument();
    expect(within(panel).getByText("RAG ?")).toHaveClass("is-new");
    expect(within(panel).getByText("↑ Your answer decides whether this is added to your skills")).toBeInTheDocument();
    expect(panel.closest(".fm-grid")).toHaveClass("has-sheet");
  });

  it("a summary question shows the CV's summary, lit", () => {
    show(question({ section: "summary", kind: "options", text: "What draws you to HR systems?" }));
    const panel = screen.getByRole("complementary", { name: "Summary" });
    expect(within(panel).getByText("Analyst who automates HR work.")).toHaveClass("tailor-sec-lit");
    expect(within(panel).getByText("↑ Your answer shapes what I suggest for your summary")).toBeInTheDocument();
  });

  it("shows no panel without the CV", () => {
    show(question({ skill: "RAG" }), false);
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

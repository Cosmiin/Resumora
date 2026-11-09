import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Proposal, type TailorQuestion } from "@resumora/shared";

vi.mock("../cv/enrich/useVoice.ts", () => ({
  useVoice: () => ({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
    interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() }),
}));
import { QuestionCard } from "./QuestionCard.tsx";
import { SectionReview } from "./SectionReview.tsx";

const cv: CvContent = {
  ...emptyCv("en"),
  experience: [
    { id: "r1", company: "Emedi", title: "Business Analyst", location: "", startDate: "2021-03", endDate: "", current: true,
      description: "Owns reporting for sales.", bullets: [{ id: "b1", text: "Made weekly reports" }, { id: "b2", text: "Ran workshops" }], notes: [] },
    { id: "r2", company: "Acme", title: "Analyst", location: "", startDate: "2018-01", endDate: "2021-02", current: false,
      description: "", bullets: [{ id: "b3", text: "Cleaned data" }], notes: [] },
  ],
  technicalSkills: [{ id: "s1", name: "Excel reporting" }],
};
const change = (itemId: string, text: string, over: Partial<Proposal> = {}): Proposal =>
  ({ itemId, field: itemId.startsWith("r") ? "description" : "text", text, inferred: false, flags: [], ...over });

describe("F3: a question shows the role it is about", () => {
  const question: TailorQuestion = { id: "q1", section: "experience", roleId: "r1", text: "Did you automate any reporting?",
    kind: "options", options: ["Yes", "No"], reason: "Gap" };

  it("shows the role's title, company, dates, description and bullets beside the question", () => {
    render(<QuestionCard question={question} n={1} total={2} onAnswer={vi.fn()} role={cv.experience[0]} locale="en" />);
    const panel = screen.getByRole("complementary", { name: "The role this is about" });
    expect(within(panel).getByText("Business Analyst")).toBeInTheDocument();
    expect(within(panel).getByText(/Emedi · Mar 2021 – Present/)).toBeInTheDocument();
    expect(within(panel).getByText("Owns reporting for sales.")).toBeInTheDocument();
    expect(within(panel).getByText("Made weekly reports")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Did you automate any reporting?" })).toBeInTheDocument();
  });

  it("shows no role panel for a question without a role", () => {
    render(<QuestionCard question={{ ...question, roleId: null }} n={1} total={2} onAnswer={vi.fn()} locale="en" />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

describe("F4: Experience review goes one role per page, role first, before and after", () => {
  const proposals = [change("b3", "Cleaned and validated data"), change("b1", "Automated weekly KPI reports"), change("r1", "Leads sales reporting.")];

  it("pages through roles in CV order and accepts every role's decisions on the last page", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(<SectionReview section="experience" proposals={proposals} flags={[]} confirmed={[]} busy={false} onAccept={onAccept} cv={cv} />);

    expect(screen.getByText("Role 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Business Analyst" })).toBeInTheDocument();
    expect(screen.getByText("Made weekly reports")).toBeInTheDocument();
    expect(screen.getByText("Automated weekly KPI reports")).toBeInTheDocument();
    expect(screen.getByText("Owns reporting for sales.")).toBeInTheDocument();
    expect(screen.queryByText("Cleaned and validated data")).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept section" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Revert Automated weekly KPI reports" }));

    await user.click(screen.getByRole("button", { name: "Next role" }));
    expect(screen.getByText("Role 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Analyst" })).toBeInTheDocument();
    expect(screen.getByText("Cleaned data")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous role" }));
    expect(screen.getByText("Role 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next role" }));

    await user.click(screen.getByRole("button", { name: "Accept section" }));
    expect(onAccept).toHaveBeenCalledWith({
      decisions: [{ itemId: "b3", keep: true }, { itemId: "b1", keep: false }, { itemId: "r1", keep: true }], inferred: [], flags: [],
    });
  });

  it("keeps the plain list when the CV could not be loaded", () => {
    render(<SectionReview section="experience" proposals={proposals} flags={[]} confirmed={[]} busy={false} onAccept={vi.fn()} cv={null} />);
    expect(screen.queryByText(/Role 1 of/)).toBeNull();
    expect(screen.getByRole("button", { name: "Accept section" })).toBeInTheDocument();
  });
});

describe("F5: Skills review explains the step and shows why each new skill was suggested", () => {
  it("shows the explanation, reworded skills old → new, and suggested new skills with their reason", () => {
    render(<SectionReview section="skills" flags={[]} confirmed={[]} busy={false} onAccept={vi.fn()} cv={cv} proposals={[
      { itemId: "s1", field: "name", text: "Power BI", inferred: false, flags: [] },
      { itemId: "new-skill", field: "name", text: "Process mapping", inferred: true, flags: [], reason: "Shown in: Business Analyst · Emedi" },
    ]} />);
    expect(screen.getByText(/reword your skills to match the job's words/)).toBeInTheDocument();
    const reworded = screen.getByRole("region", { name: "Reworded" });
    expect(within(reworded).getByText("Excel reporting")).toBeInTheDocument();
    expect(within(reworded).getByText("Power BI")).toBeInTheDocument();
    const added = screen.getByRole("region", { name: "Suggested new" });
    expect(within(added).getByText("Process mapping")).toBeInTheDocument();
    expect(within(added).getByText("Shown in: Business Analyst · Emedi")).toBeInTheDocument();
  });
});

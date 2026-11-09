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

describe("ExpQA / SkillsA1: the question screen", () => {
  const question: TailorQuestion = { id: "q1", section: "experience", roleId: "r1", text: "Did you automate any reporting?",
    kind: "options", options: ["Yes", "No"], reason: "Gap" };
  const skill: TailorQuestion = { id: "q2", section: "skills", roleId: null, text: "Do you know SQL?", kind: "skill",
    options: ["Yes", "A little", "No"], reason: "Gap", skill: "SQL" };
  const card = (over: Partial<React.ComponentProps<typeof QuestionCard>> = {}) =>
    render(<QuestionCard question={question} progress="Role 1 of 2 · Question 1 of 2" onNext={vi.fn()} onSkip={vi.fn()}
      role={cv.experience[0]} locale="en" {...over} />);

  it("shows the role's title, company, dates, description and bullets beside the question", () => {
    card();
    const panel = screen.getByRole("complementary", { name: "The role this is about" });
    expect(within(panel).getByText("Business Analyst")).toBeInTheDocument();
    expect(within(panel).getByText(/Emedi · Mar 2021 – Present/)).toBeInTheDocument();
    expect(within(panel).getByText("Owns reporting for sales.")).toBeInTheDocument();
    expect(within(panel).getByText("Made weekly reports")).toBeInTheDocument();
    expect(within(panel).getByText("About the whole role")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Did you automate any reporting?" })).toBeInTheDocument();
    expect(screen.getByText("Role 1 of 2 · Question 1 of 2")).toBeInTheDocument();
  });

  it("highlights the bullet a question points at", () => {
    card({ question: { ...question, bulletId: "b2" } });
    const panel = screen.getByRole("complementary", { name: "The role this is about" });
    expect(within(panel).getByText("Ran workshops").closest("li")).toHaveAttribute("aria-current", "true");
    expect(within(panel).getByText("Made weekly reports").closest("li")).not.toHaveAttribute("aria-current");
    expect(within(panel).queryByText("About the whole role")).toBeNull();
  });

  it("keeps the question on screen when a choice is tapped; Next sends it", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    card({ onNext });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Did you automate any reporting?" })).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledWith({ value: "Yes", via: "option" });
  });

  it("shows an earlier answer selected, and offers Back and Skip", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onSkip = vi.fn();
    card({ initial: { value: "No", via: "option" }, onBack, onSkip });
    expect(screen.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("never shows a role panel for a Skills question, and asks which role a confirmed skill was used in", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    card({ question: skill, role: undefined, roles: cv.experience, onNext, progress: "Question 1 of 1" });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByText("In which role did you use it?")).toBeNull();
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(screen.queryByText("In which role did you use it?")).toBeNull();
    await user.click(screen.getByRole("button", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "A little" }));
    const roles = screen.getByRole("group", { name: "In which role did you use it?" });
    await user.click(within(roles).getByRole("button", { name: /Business Analyst/ }));
    await user.click(within(roles).getByRole("button", { name: /^Analyst/ }));
    expect(within(roles).getByRole("button", { name: /^Analyst/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledWith({ value: "A little", via: "option", roleIds: ["r1", "r2"] });
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

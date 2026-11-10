import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { emptyCv, type CvContent, type Proposal, type TailorQuestion, type TailorRun } from "@resumora/shared";

vi.mock("../cv/enrich/useVoice.ts", () => ({
  useVoice: () => ({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
    interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() }),
}));
import { QuestionCard } from "./QuestionCard.tsx";
import { SectionReview } from "./SectionReview.tsx";

vi.mock("./tailor-api.ts", () => ({ getRun: vi.fn(), askQuestions: vi.fn(), getScores: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
vi.mock("../jobs/jobs-api.ts", () => ({ getJob: vi.fn() }));
import { getCv } from "../cv/cv-api.ts";
import { getJob } from "../jobs/jobs-api.ts";
import { askQuestions, getRun, getScores } from "./tailor-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";

const cv: CvContent = {
  ...emptyCv("en"),
  experience: [
    { id: "r1", company: "Emedi", title: "Business Analyst", location: "", startDate: "2021-03", endDate: "", current: true,
      description: "Owns reporting for sales.", bullets: [{ id: "b1", text: "Made weekly reports" }, { id: "b2", text: "Ran workshops" }, { id: "b4", text: "Checked forecasts" }], notes: [] },
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
    expect(within(panel).getByRole("heading", { name: "Business Analyst" }).parentElement).toHaveTextContent("Business Analyst — Emedi");
    expect(within(panel).getByText("Mar 2021 – Present")).toBeInTheDocument();
    expect(within(panel).getByText("Owns reporting for sales.").tagName).toBe("EM");
    expect(panel.querySelector(".page-sheet")).toBeInTheDocument();
    expect(panel.querySelector(".page-bar")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: question.text })).toHaveClass("page-note");
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
    expect(within(panel).getByText("Ran workshops").closest("li")).toHaveClass("page-mark");
    for (const text of ["Made weekly reports", "Checked forecasts"]) {
      const bullet = within(panel).getByText(text).closest("li");
      expect(bullet).not.toHaveAttribute("aria-current");
      expect(bullet).not.toHaveClass("page-mark");
    }
    expect(panel.querySelector(".page-bar")).toBeNull();
    expect(within(panel).queryByText("About the whole role")).toBeNull();
  });

  it("marks the whole role when the bullet does not match", () => {
    card({ question: { ...question, bulletId: "missing" } });
    const panel = screen.getByRole("complementary");
    expect(panel.querySelector(".page-bar")).toBeInTheDocument();
    expect(within(panel).getByText("About the whole role")).toHaveClass("fm-tag");
    expect(panel.querySelector(".page-mark")).toBeNull();
  });

  it.each(["experience", "skills"] as const)("shows what the job asks for on a %s question", (section) => {
    card({ question: section === "skills" ? skill : question, asks: "REST APIs and webhooks" });
    expect(screen.getByText("The job asks for")).toBeInTheDocument();
    expect(screen.getByText("REST APIs and webhooks")).toBeInTheDocument();
    if (section === "skills") {
      expect(screen.queryByRole("complementary")).toBeNull();
      expect(screen.getByRole("region", { name: skill.text }).closest(".tailor-split")).toBeNull();
    }
  });

  it.each([undefined, null])("omits the job requirement box when asks is %s", (asks) => {
    card({ asks });
    expect(screen.queryByText("The job asks for")).toBeNull();
    expect(screen.getByRole("region", { name: question.text }).querySelector(".tailor-asks")).toBeNull();
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

describe.each(["experience", "skills"] as const)("the job requirement on a %s flow question", (section) => {
  const at = "2026-11-10T10:00:00Z";
  const run: TailorRun = {
    id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections: ["experience", "skills"],
    status: "running", currentSection: section, currentRoleId: section === "experience" ? "r1" : null, roleOrder: ["r1", "r2"],
    questions: null, answers: null, proposals: null, errorCode: null, createdAt: at, updatedAt: at,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getCv).mockResolvedValue({ content: cv, version: 1, updatedAt: at });
    vi.mocked(getJob).mockResolvedValue({ extracted: { requirements: [{ text: "REST APIs and webhooks" }] } } as never);
    vi.mocked(getScores).mockResolvedValue({ base: null, tailored: null });
    vi.mocked(getRun).mockResolvedValue(run);
  });

  it.each([
    ["k:SQL", "SQL"], ["r0", "REST APIs and webhooks"], [undefined, null], ["r99", null],
  ] as const)("resolves gap %s", async (gap, asks) => {
    const question: TailorQuestion = { id: "q1", section, roleId: run.currentRoleId ?? null, text: "Did you use SQL?",
      kind: section === "skills" ? "skill" : "options", options: ["Yes", "No"], reason: "Gap", gap };
    vi.mocked(askQuestions).mockResolvedValue([question]);
    render(<RouterProvider router={createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }],
      { initialEntries: ["/jobs/one/tailor"] })} />);
    await screen.findByRole("heading", { name: question.text });
    const card = screen.getByRole("region", { name: question.text });
    if (asks) {
      expect(within(card).getByText("The job asks for")).toBeInTheDocument();
      expect(within(card).getByText(asks)).toBeInTheDocument();
    } else expect(within(card).queryByText("The job asks for")).toBeNull();
    if (section === "skills") expect(card.closest(".tailor-split")).toBeNull();
  });
});

describe("F4: without the CV, the Experience review is a plain list", () => {
  const proposals = [change("b3", "Cleaned and validated data"), change("b1", "Automated weekly KPI reports"), change("r1", "Leads sales reporting.")];

  it("keeps the plain list when the CV could not be loaded", () => {
    render(<SectionReview section="experience" proposals={proposals} flags={[]} confirmed={[]} busy={false} onAccept={vi.fn()} cv={null} />);
    expect(screen.queryByText(/Role 1 of/)).toBeNull();
    expect(screen.getByRole("button", { name: "Accept section" })).toBeInTheDocument();
  });
});


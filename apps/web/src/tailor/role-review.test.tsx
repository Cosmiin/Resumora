import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { emptyCv, TAILOR_SECTIONS, type MatchScore, type Proposal, type TailorRun } from "@resumora/shared";
import { RoleReview } from "./RoleReview.tsx";

vi.mock("./tailor-api.ts", () => ({
  startTailoring: vi.fn(), getRun: vi.fn(), askQuestions: vi.fn(), sendAnswers: vi.fn(), runSection: vi.fn(), acceptSection: vi.fn(),
  getScores: vi.fn(), getToneExamples: vi.fn(), redoRole: vi.fn(), acceptRole: vi.fn(), getSteering: vi.fn(), changeSteering: vi.fn(),
}));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
import { getCv } from "../cv/cv-api.ts";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { acceptRole, acceptSection, askQuestions, getRun, getScores, redoRole, runSection, sendAnswers } from "./tailor-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";

const role = {
  id: "r1", company: "Emedi", title: "Business Analyst", location: "", startDate: "2021-03", endDate: "", current: true,
  description: "Owns reporting for sales.", notes: [],
  bullets: [{ id: "b1", text: "Made weekly reports" }, { id: "b2", text: "Checked data" }, { id: "b3", text: "Ran workshops" }],
};
const proposals: Proposal[] = [
  { itemId: "r1", field: "description", text: "Owns reporting and KPI dashboards for sales.", inferred: false, flags: [] },
  { itemId: "b1", field: "text", text: "Made weekly KPI reports", inferred: false, flags: [] },
  { itemId: "b2", field: "text", text: "Checked data quality with sales leads", inferred: true, flags: [], reason: "From your answer: worked with sales leads" },
];

function review(over: Partial<React.ComponentProps<typeof RoleReview>> = {}) {
  const onAccept = vi.fn();
  render(<RoleReview role={role} proposals={proposals} locale="en" busy={false} onAccept={onAccept} {...over} />);
  return onAccept;
}

describe("RoleReview (RevC)", () => {
  it("shows the role as in the CV with the new words highlighted and the guess marked with its reason", () => {
    review();
    expect(screen.getByRole("heading", { level: 3, name: "Business Analyst" })).toBeInTheDocument();
    expect(screen.getByText("and KPI dashboards", { selector: "mark" })).toBeInTheDocument();
    expect(screen.getByText("KPI", { selector: "mark" })).toBeInTheDocument();
    expect(screen.getByText("Ran workshops")).toBeInTheDocument();
    const guess = screen.getByText("AI guess");
    expect(guess).toHaveAccessibleDescription("From your answer: worked with sales leads");
    expect(screen.getByRole("button", { name: "New" })).toHaveAttribute("aria-pressed", "true");
  });

  it("the switch shows the Base wording for every changed item", async () => {
    const user = userEvent.setup();
    review();
    await user.click(screen.getByRole("button", { name: "Original" }));
    expect(screen.getByRole("button", { name: "Original" })).toHaveAttribute("aria-pressed", "true");
    for (const text of ["Owns reporting for sales.", "Made weekly reports", "Checked data", "Ran workshops"]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/KPI/)).toBeNull();
    expect(screen.queryByText("AI guess")).toBeNull();
    await user.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByText("KPI", { selector: "mark" })).toBeInTheDocument();
  });

  it("Keep the original sends every item with keep: false", async () => {
    const onAccept = review();
    await userEvent.setup().click(screen.getByRole("button", { name: "Keep the original" }));
    expect(onAccept).toHaveBeenCalledWith({
      decisions: [{ itemId: "r1", keep: false }, { itemId: "b1", keep: false }], inferred: [{ itemId: "b2", keep: false }], flags: [],
    });
  });

  it("Use the new version keeps every change and leaves the guess unreviewed", async () => {
    const onAccept = review();
    await userEvent.setup().click(screen.getByRole("button", { name: "Use the new version" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "r1", keep: true }, { itemId: "b1", keep: true }], inferred: [], flags: [] });
  });

  it("offers My answers only when given, and says how many claims were left out", async () => {
    const onAnswers = vi.fn();
    review({ onAnswers, removed: 1 });
    await userEvent.setup().click(screen.getByRole("button", { name: "My answers" }));
    expect(onAnswers).toHaveBeenCalled();
    expect(screen.getByText("We left out 1 claim your CV doesn't back up.")).toBeInTheDocument();
  });

  it("a role with nothing to change says so and goes on", async () => {
    const onAccept = review({ proposals: [] });
    expect(screen.getByText("Nothing to change in this role ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Original" })).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Continue" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [], inferred: [], flags: [] });
  });
});

const at = "2026-11-09T10:00:00Z";
const run = (over: Partial<TailorRun> = {}): TailorRun => ({
  id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections: [...TAILOR_SECTIONS],
  status: "waiting_user", currentSection: "experience", errorCode: null, roleOrder: ["r1", "r2"], currentRoleId: "r1", createdAt: at, updatedAt: at,
  questions: [{ id: "q1", section: "experience", roleId: "r1", text: "How often?", kind: "options", options: ["Weekly"], reason: "Gap" }],
  answers: [{ questionId: "q1", value: "Weekly", via: "option" }], proposals: null, ...over,
});
const score = (total: number): MatchScore => ({ policy: "match/1", total, band: "fair", capped: false, labels: [],
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });

describe("the Experience review in the flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
      interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
    vi.mocked(getScores).mockResolvedValue({ base: score(62), tailored: null });
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv("en"), experience: [role] }, version: 1, updatedAt: at });
    vi.mocked(getRun).mockResolvedValue(run());
    vi.mocked(askQuestions).mockResolvedValue([]);
    vi.mocked(sendAnswers).mockResolvedValue(undefined);
    vi.mocked(runSection).mockResolvedValue({ proposals: [proposals[1]!], questions: [] });
  });

  it("shows the current role's review; My answers updates this role and the accept still moves the run on", async () => {
    const user = userEvent.setup();
    vi.mocked(redoRole).mockResolvedValue({ proposals: [{ ...proposals[1]!, text: "Made daily KPI reports" }], removed: 0 });
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ status: "done", currentSection: null }), score: score(70) });
    const router = createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }, { path: "/jobs/:id/cv", element: <p>CV page</p> }],
      { initialEntries: ["/jobs/one/tailor"] });
    render(<RouterProvider router={router} />);

    await user.click(await screen.findByRole("button", { name: "My answers" }));
    const box = await screen.findByRole("textbox");
    expect(box).toHaveValue("Weekly");
    await user.clear(box);
    await user.type(box, "Daily");
    await user.click(screen.getByRole("button", { name: "Update this role" }));
    expect(redoRole).toHaveBeenCalledWith("run1", "r1", [{ questionId: "q1", value: "Daily", via: "typed" }]);

    const card = await screen.findByRole("region", { name: "Business Analyst" });
    expect(within(card).getByText("daily KPI", { selector: "mark" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use the new version" }));
    expect(acceptSection).toHaveBeenCalledWith("run1", "experience", { decisions: [{ itemId: "b1", keep: true }], inferred: [], flags: [], roleId: "r1" });
    expect(acceptRole).not.toHaveBeenCalled();
  });
});

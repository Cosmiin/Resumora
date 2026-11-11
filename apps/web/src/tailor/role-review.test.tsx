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
vi.mock("../jobs/jobs-api.ts", () => ({ getJob: () => Promise.reject(new Error("offline")), scoreJob: () => Promise.resolve({ base: null, tailored: null }) }));
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

const card = () => screen.getByRole("article");
const press = (name: string) => userEvent.setup().click(screen.getByRole("button", { name }));

describe("RoleReview: a role's suggestions, one at a time", () => {
  it("shows the first suggestion alone, with where it stands among them; a suggestion starts chosen; lines with none are only counted", () => {
    review({ position: "Role 1 of 2", keywords: { has: 2, total: 5 } });
    expect(screen.getByRole("heading", { level: 1, name: "Business Analyst, Emedi" })).toBeInTheDocument();
    expect(screen.getByText("Role 1 of 2 · Mar 2021 – Present")).toBeInTheDocument();
    expect(screen.getByText("Suggestion 1 of 3")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(card()).toHaveTextContent("Owns reporting and KPI dashboards for sales.");
    expect(card()).toHaveTextContent("Now: Owns reporting for sales.");
    expect(screen.getByRole("button", { name: "Use this" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("One part of this line is my guess")).toBeNull();
    expect(screen.getByText("1 other line already fits the job and stays as it is.")).toBeInTheDocument();
    expect(screen.queryByText("Ran workshops")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save and continue" })).toBeNull();
  });

  it("Next and Previous walk through the suggestions; a guess waits for an answer; the last one offers Save", async () => {
    review();
    await press("Next suggestion");
    expect(screen.getByText("Suggestion 2 of 3")).toBeInTheDocument();
    expect(card()).toHaveTextContent("Made weekly KPI reports");
    await press("Next suggestion");
    expect(card()).toHaveTextContent("Checked data quality with sales leads");
    expect(screen.getByText("One part of this line is my guess")).toBeInTheDocument();
    expect(screen.getByText("From your answer: worked with sales leads")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, it's true. Use it" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Keep my line" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Next suggestion" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save and continue" })).toBeInTheDocument();
    await press("Previous");
    expect(screen.getByText("Suggestion 2 of 3")).toBeInTheDocument();
  });

  it("sends each decision as made: kept, and reworded with the person's own text; a guess nobody confirmed stays off the CV", async () => {
    const onAccept = review();
    await press("Keep my line");
    await press("Next suggestion");
    await press("Edit the line");
    const box = screen.getByRole("textbox");
    await userEvent.clear(box);
    await userEvent.type(box, "Made weekly KPI reports for sales");
    await press("Save edit");
    await press("Next suggestion");
    await press("Save and continue");
    expect(onAccept).toHaveBeenCalledWith({
      decisions: [{ itemId: "r1", keep: false }, { itemId: "b1", keep: true, text: "Made weekly KPI reports for sales" }, { itemId: "b2", keep: false }], inferred: [], flags: [],
    });
  });

  it("an untouched suggestion is left out, so it is used; a guess is used once the person says it is true", async () => {
    const onAccept = review();
    await press("Next suggestion");
    await press("Next suggestion");
    await press("Yes, it's true. Use it");
    await press("Save and continue");
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "b2", keep: true }], inferred: [], flags: [] });
  });

  it("freezes the suggestion while the role is being saved", () => {
    review({ busy: true, proposals: [proposals[1]!] });
    for (const button of within(card()).getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("Skip this role keeps every line as it is on the CV", async () => {
    const onAccept = review();
    await userEvent.click(screen.getByRole("button", { name: "Skip this role" }));
    expect(onAccept).toHaveBeenCalledWith({
      decisions: [{ itemId: "r1", keep: false }, { itemId: "b1", keep: false }, { itemId: "b2", keep: false }], inferred: [], flags: [],
    });
  });

  it("offers Change my answers only when given, and says how many claims were left out", async () => {
    const onAnswers = vi.fn();
    review({ onAnswers, removed: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Change my answers" }));
    expect(onAnswers).toHaveBeenCalled();
    expect(screen.getByText("We left out 1 claim your CV doesn't back up.")).toBeInTheDocument();
  });

  it("a role with nothing to change says so and goes on", async () => {
    const onAccept = review({ proposals: [] });
    expect(screen.getByText("Nothing to change in this role ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept all for this role" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip this role" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
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

  it("shows the current role's review; Change my answers updates this role and the accept still moves the run on", async () => {
    const user = userEvent.setup();
    vi.mocked(redoRole).mockResolvedValue({ proposals: [{ ...proposals[1]!, text: "Made daily KPI reports" }], removed: 0 });
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ status: "done", currentSection: null }), score: score(70) });
    const router = createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }, { path: "/jobs/:id/cv", element: <p>CV page</p> }],
      { initialEntries: ["/jobs/one/tailor"] });
    render(<RouterProvider router={router} />);

    await user.click(await screen.findByRole("button", { name: "Change my answers" }));
    const box = await screen.findByRole("textbox");
    expect(box).toHaveValue("Weekly");
    await user.clear(box);
    await user.type(box, "Daily");
    await user.click(screen.getByRole("button", { name: "Update this role" }));
    expect(redoRole).toHaveBeenCalledWith("run1", "r1", [{ questionId: "q1", value: "Daily", via: "typed" }]);

    const card = await screen.findByRole("region", { name: "Business Analyst, Emedi" });
    expect(card.querySelector(".ui-diff-new")).toHaveTextContent("Made daily KPI reports");
    expect(within(card).getByText("Role 1 of 1 · Mar 2021 – Present")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Use this" }));
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(acceptSection).toHaveBeenCalledWith("run1", "experience", { decisions: [{ itemId: "b1", keep: true }], inferred: [], flags: [], roleId: "r1" });
    expect(acceptRole).not.toHaveBeenCalled();
  });
});

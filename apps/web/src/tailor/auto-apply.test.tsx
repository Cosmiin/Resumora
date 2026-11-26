import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { emptyCv, TAILOR_SECTIONS, type MatchScore, type Proposal, type TailorRun } from "@resumora/shared";
import { RoleReview } from "./RoleReview.tsx";

vi.mock("./tailor-api.ts", () => ({
  askAcross: vi.fn(async () => []), startTailoring: vi.fn(), getRun: vi.fn(), askQuestions: vi.fn(), sendAnswers: vi.fn(), runSection: vi.fn(), acceptSection: vi.fn(),
  getScores: vi.fn(), getToneExamples: vi.fn(), redoRole: vi.fn(), acceptRole: vi.fn(), getSteering: vi.fn(), changeSteering: vi.fn(),
}));
vi.mock("../jobs/jobs-api.ts", () => ({ getJob: () => Promise.reject(new Error("offline")), scoreJob: () => Promise.resolve({ base: null, tailored: null }) }));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
vi.mock("./DoneScreen.tsx", () => ({ DoneScreen: () => <p>Result screen</p> }));
import { getCv } from "../cv/cv-api.ts";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { acceptSection, askQuestions, getRun, getScores, runSection, sendAnswers } from "./tailor-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";

const at = "2026-11-26T10:00:00Z";
const role = (id: string, title: string) => ({
  id, company: "Emedi", title, location: "", startDate: "2021-03", endDate: "", current: true, description: "", notes: [],
  bullets: [{ id: `${id}-b1`, text: "Made weekly reports" }, { id: `${id}-b2`, text: "Checked data" }],
});
const r1 = role("r1", "Business Analyst");
const r2 = role("r2", "Data Analyst");
const reword: Proposal = { itemId: "r1-b1", field: "text", text: "Built weekly reports", inferred: false, flags: [] };
const guess: Proposal = { itemId: "r1-b2", field: "text", text: "Checked data quality with sales leads", inferred: true, flags: [], reason: "From your answer" };

const run = (over: Partial<TailorRun> = {}): TailorRun => ({
  id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections: [...TAILOR_SECTIONS],
  status: "waiting_user", currentSection: "experience", errorCode: null, roleOrder: ["r1", "r2"], currentRoleId: "r1", createdAt: at, updatedAt: at,
  questions: [], answers: [], proposals: null, ...over,
});
const score = (total: number): MatchScore => ({ policy: "match/1", total, band: "fair", capped: false, labels: [],
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });

function open() {
  const router = createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] });
  render(<RouterProvider router={router} />);
}

describe("tailoring applies plain rewordings by itself", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
      interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
    vi.mocked(getScores).mockResolvedValue({ base: score(62), tailored: null });
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv("en"), experience: [r1, r2] }, version: 1, updatedAt: at });
    vi.mocked(getRun).mockResolvedValue(run());
    vi.mocked(sendAnswers).mockResolvedValue(undefined);
  });

  it("a role with only rewordings is saved with no review and no summary, and the next role's questions come straight up", async () => {
    vi.mocked(askQuestions).mockImplementation(async (_id, _section, roleId) => roleId === "r2"
      ? [{ id: "q2", section: "experience", roleId: "r2", text: "Which tools did you use?", kind: "options", options: ["SQL"], reason: "Gap" }] : []);
    vi.mocked(runSection).mockResolvedValue({ proposals: [reword], questions: [], removed: 0 });
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ currentRoleId: "r2", status: "running" }), score: score(70) });
    open();
    expect(await screen.findByText("Which tools did you use?")).toBeInTheDocument();
    expect(acceptSection).toHaveBeenCalledWith("run1", "experience", { decisions: [], inferred: [], flags: [], roleId: "r1" });
    expect(screen.queryByText("Business Analyst is done")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save and continue" })).toBeNull();
  });

  it("a role with nothing to change goes straight on too", async () => {
    vi.mocked(askQuestions).mockResolvedValue([]);
    vi.mocked(runSection).mockResolvedValue({ proposals: [], questions: [], removed: 0 });
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ status: "done", currentSection: null }), score: score(62) });
    open();
    expect(await screen.findByText("Result screen")).toBeInTheDocument();
    expect(acceptSection).toHaveBeenCalledWith("run1", "experience", { decisions: [], inferred: [], flags: [], roleId: "r1" });
  });

  it("a role with a guess is saved too, with no screen: the guess stays marked on the CV for its review", async () => {
    vi.mocked(askQuestions).mockImplementation(async (_id, _section, roleId) => roleId === "r2"
      ? [{ id: "q2", section: "experience", roleId: "r2", text: "Which tools did you use?", kind: "options", options: ["SQL"], reason: "Gap" }] : []);
    vi.mocked(runSection).mockResolvedValue({ proposals: [reword, guess], questions: [], removed: 0 });
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ currentRoleId: "r2", status: "running" }), score: score(70) });
    open();
    expect(await screen.findByText("Which tools did you use?")).toBeInTheDocument();
    expect(acceptSection).toHaveBeenCalledWith("run1", "experience", { decisions: [], inferred: [], flags: [], roleId: "r1" });
    expect(screen.queryByText("Checked data quality with sales leads")).toBeNull();
    expect(screen.queryByText("Business Analyst is done")).toBeNull();
  });
});

describe("a skills step that only changes case or spacing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getScores).mockResolvedValue({ base: score(62), tailored: null });
    const skills = [{ id: "s1", name: "webhooks", level: null }, { id: "s2", name: "SQL", level: null }];
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv("en"), experience: [r1], technicalSkills: skills } as never, version: 1, updatedAt: at });
    vi.mocked(getRun).mockResolvedValue(run({ currentSection: "skills", currentRoleId: null, status: "waiting_user" }));
  });

  it("is saved with no screen and goes straight on", async () => {
    vi.mocked(runSection).mockResolvedValue({ proposals: [
      { itemId: "s1", field: "name", text: "Webhooks", inferred: false, flags: [] },
      { itemId: "s2", field: "name", text: "SQL ", inferred: false, flags: [] },
    ], questions: [], removed: 0 });
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ status: "done", currentSection: null }), score: score(62) });
    open();
    expect(await screen.findByText("Result screen")).toBeInTheDocument();
    expect(acceptSection).toHaveBeenCalledWith("run1", "skills", { decisions: [], inferred: [], flags: [] });
    expect(screen.queryByRole("button", { name: "Save skills" })).toBeNull();
  });

  it("shows only the change that matters", async () => {
    vi.mocked(runSection).mockResolvedValue({ proposals: [
      { itemId: "s1", field: "name", text: "Webhooks", inferred: false, flags: [] },
      { itemId: "new-skill", field: "name", text: "Zapier", inferred: false, flags: [] },
    ], questions: [], removed: 0 });
    open();
    expect(await screen.findByText("Zapier")).toBeInTheDocument();
    expect(screen.queryByText("Webhooks")).toBeNull();
  });
});

describe("RoleReview with guesses only", () => {
  it("walks only the guesses, and Skip still keeps every line as it is on the CV", async () => {
    const onAccept = vi.fn();
    render(<RoleReview role={r1} proposals={[reword, guess]} locale="en" busy={false} onAccept={onAccept} guessesOnly />);
    expect(screen.getByText("Suggestion 1 of 1")).toBeInTheDocument();
    expect(screen.queryByText("Built weekly reports")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Skip this role" }));
    expect(onAccept).toHaveBeenCalledWith({ decisions: [{ itemId: "r1-b1", keep: false }, { itemId: "r1-b2", keep: false }], inferred: [], flags: [] });
  });
});

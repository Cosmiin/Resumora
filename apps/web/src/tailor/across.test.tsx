import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { emptyCv, TAILOR_SECTIONS, type MatchScore, type TailorQuestion, type TailorRun } from "@resumora/shared";

vi.mock("./tailor-api.ts", () => ({
  startTailoring: vi.fn(), getRun: vi.fn(), askQuestions: vi.fn(), askAcross: vi.fn(), sendAnswers: vi.fn(), runSection: vi.fn(), acceptSection: vi.fn(),
  getScores: vi.fn(), getToneExamples: vi.fn(), redoRole: vi.fn(), acceptRole: vi.fn(), getSteering: vi.fn(), changeSteering: vi.fn(),
}));
vi.mock("../jobs/jobs-api.ts", () => ({ getJob: () => Promise.reject(new Error("offline")), scoreJob: () => Promise.resolve({ base: null, tailored: null }) }));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
import { getCv } from "../cv/cv-api.ts";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { askAcross, askQuestions, getRun, getScores, runSection, sendAnswers } from "./tailor-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";

const at = "2026-11-26T10:00:00Z";
const role = (id: string, title: string) => ({
  id, company: "Emedi", title, location: "", startDate: "2021-03", endDate: "", current: true, description: "", notes: [],
  bullets: [{ id: `${id}-b1`, text: "Made weekly reports" }],
});
const run = (over: Partial<TailorRun> = {}): TailorRun => ({
  id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections: [...TAILOR_SECTIONS],
  status: "running", currentSection: "experience", errorCode: null, roleOrder: ["r1", "r2"], currentRoleId: "r1", createdAt: at, updatedAt: at,
  questions: [], answers: [], proposals: null, ...over,
});
const score = (total: number): MatchScore => ({ policy: "match/1", total, band: "fair", capped: false, labels: [],
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });
const kissflow: TailorQuestion = { id: "qa", section: "experience", roleId: null, text: "Did you use KissFlow?", kind: "skill", options: [],
  reason: "The ad asks for KissFlow.", gap: "k:kissflow", skill: "KissFlow", scope: "all" };

function open() {
  const router = createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] });
  render(<RouterProvider router={router} />);
}

describe("a question for every role at once", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
      interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
    vi.mocked(getScores).mockResolvedValue({ base: score(62), tailored: null });
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv("en"), experience: [role("r1", "Business Analyst"), role("r2", "Data Analyst")] }, version: 1, updatedAt: at });
    vi.mocked(getRun).mockResolvedValue(run());
    vi.mocked(sendAnswers).mockResolvedValue(undefined);
    vi.mocked(askAcross).mockResolvedValue([kissflow]);
    vi.mocked(askQuestions).mockResolvedValue([]);
    vi.mocked(runSection).mockReturnValue(new Promise(() => {}));
  });

  it("comes before the first role: tick the roles, then the first role's own questions are asked", async () => {
    const user = userEvent.setup();
    open();
    expect(await screen.findByRole("heading", { name: "Did you use KissFlow?" })).toBeInTheDocument();
    expect(screen.getByText("All your roles · Question 1 of 1")).toBeInTheDocument();
    const finish = screen.getByRole("button", { name: "Finish the questions" });
    expect(finish).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^Data Analyst/ }));
    await user.click(finish);
    expect(sendAnswers).toHaveBeenCalledWith("run1", [{ questionId: "qa", value: "Yes", via: "option", use: "used", roleIds: ["r2"] }]);
    await waitFor(() => expect(askQuestions).toHaveBeenCalledWith("run1", "experience", "r1"));
    expect(askAcross).toHaveBeenCalledTimes(1);
  });

  it("something similar: one click, with no tool to name and no roles to tick", async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole("button", { name: "No, but I used something similar" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText("What did you use?")).toBeNull();
    // The roles are listed once, never a second time under the answer.
    expect(screen.getAllByRole("button", { name: /^Business Analyst/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Finish the questions" }));
    expect(sendAnswers).toHaveBeenCalledWith("run1", [{ questionId: "qa", value: "No", via: "option", use: "similar" }]);
  });

  it("something similar gives way to a role ticked afterwards", async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole("button", { name: "No, but I used something similar" }));
    await user.click(screen.getByRole("button", { name: /^Business Analyst/ }));
    await user.click(screen.getByRole("button", { name: "Finish the questions" }));
    expect(sendAnswers).toHaveBeenCalledWith("run1", [{ questionId: "qa", value: "Yes", via: "option", use: "used", roleIds: ["r1"] }]);
  });

  it("neither: one click answers it for every role", async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole("button", { name: "No, and nothing similar" }));
    await user.click(screen.getByRole("button", { name: "Finish the questions" }));
    expect(sendAnswers).toHaveBeenCalledWith("run1", [{ questionId: "qa", value: "No", via: "option", use: "none" }]);
  });

  it("is not asked again once the run holds such questions", async () => {
    vi.mocked(getRun).mockResolvedValue(run({ questions: [kissflow] }));
    open();
    await waitFor(() => expect(askQuestions).toHaveBeenCalledWith("run1", "experience", "r1"));
    expect(askAcross).not.toHaveBeenCalled();
  });
});

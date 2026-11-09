import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { TAILOR_SECTIONS, type MatchScore, type TailorQuestion, type TailorRun } from "@resumora/shared";

vi.mock("./tailor-api.ts", () => ({
  startTailoring: vi.fn(), getRun: vi.fn(), askQuestions: vi.fn(), sendAnswers: vi.fn(),
  runSection: vi.fn(), acceptSection: vi.fn(), getScores: vi.fn(), getToneExamples: vi.fn(),
}));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
import { emptyCv } from "@resumora/shared";
import { getCv } from "../cv/cv-api.ts";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { ApiClientError } from "../lib/api.ts";
import { acceptSection, askQuestions, getRun, getScores, getToneExamples, runSection, sendAnswers, startTailoring } from "./tailor-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";

const at = "2026-11-08T10:00:00Z";
const makeRun = (over: Partial<TailorRun> = {}): TailorRun => ({
  id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections: [...TAILOR_SECTIONS],
  status: "running", currentSection: "experience", questions: null, answers: null, proposals: null, errorCode: null,
  createdAt: at, updatedAt: at, ...over,
});
const score = (total: number): MatchScore => ({ policy: "match/1", total, band: "fair", capped: false, labels: [],
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });
const question = (id: string, over: Partial<TailorQuestion> = {}): TailorQuestion => ({
  id, section: "experience", roleId: null, text: `Question ${id}?`, kind: "options", options: ["Yes, daily", "No"], reason: "Gap", ...over,
});

function renderFlow() {
  const router = createMemoryRouter([
    { path: "/jobs/:id/tailor", element: <TailorFlow /> },
    { path: "/jobs/:id/cv", element: <p>Tailored CV page</p> },
    { path: "/jobs", element: <p>Jobs page</p> },
  ], { initialEntries: ["/jobs/one/tailor"] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
    interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
  vi.mocked(getScores).mockResolvedValue({ base: score(62), tailored: null });
  vi.mocked(startTailoring).mockResolvedValue({ run: makeRun() });
  vi.mocked(sendAnswers).mockResolvedValue(undefined);
  vi.mocked(askQuestions).mockResolvedValue([]);
  vi.mocked(runSection).mockResolvedValue({ proposals: [], questions: [] });
  vi.mocked(getCv).mockRejectedValue(new Error("offline"));
  vi.mocked(getToneExamples).mockRejectedValue(new Error("offline"));
});

describe("tailoring flow", () => {
  it("shows the role a question is about, from the Base CV (F3)", async () => {
    const cv = { ...emptyCv("en"), experience: [{ id: "r1", company: "Emedi", title: "Business Analyst", location: "", startDate: "2021-03",
      endDate: "", current: true, description: "Owns reporting.", bullets: [{ id: "b1", text: "Made weekly reports" }], notes: [] }] };
    vi.mocked(getCv).mockResolvedValue({ content: cv, version: 1, updatedAt: at });
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun());
    vi.mocked(askQuestions).mockResolvedValue([question("q1", { roleId: "r1" })]);
    renderFlow();
    const panel = await screen.findByRole("complementary", { name: "The role this is about" });
    expect(panel).toHaveTextContent("Business Analyst");
    expect(panel).toHaveTextContent("Made weekly reports");
    expect(screen.getByRole("heading", { name: "Question q1?" })).toBeInTheDocument();
  });

  it("steers, answers, reviews and accepts two sections, then opens the tailored CV", async () => {
    const user = userEvent.setup();
    vi.mocked(askQuestions).mockResolvedValueOnce([question("q1")]).mockResolvedValueOnce([]);
    vi.mocked(runSection)
      .mockResolvedValueOnce({ proposals: [{ itemId: "b1", field: "text", text: "Ran payroll accurately", inferred: false, flags: [] }], questions: [] })
      .mockResolvedValueOnce({
        proposals: [
          { itemId: "new-skill", field: "name", text: "Gusto", inferred: true, flags: [] },
          { itemId: "s1", field: "name", text: "Excel 365", inferred: false, flags: [{ rule: "number", detail: "365" }] },
        ],
        questions: [question("f1", { kind: "flag", section: "skills", text: "Please check: \"Excel 365\" (365)", options: ["Keep it", "Use original wording"] })],
      });
    vi.mocked(acceptSection)
      .mockResolvedValueOnce({ run: makeRun({ currentSection: "skills" }), score: score(71) })
      .mockResolvedValueOnce({ run: makeRun({ status: "done", currentSection: null }), score: score(78) });
    const router = renderFlow();

    await user.click(await screen.findByRole("button", { name: /^Confident/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByRole("textbox"), "Lead with payroll");
    await user.click(screen.getByRole("button", { name: "Start tailoring" }));
    expect(startTailoring).toHaveBeenCalledWith("one", { tone: "confident", draws: [], fit: null, focusRoleIds: [], instruction: "Lead with payroll" });

    await user.click(await screen.findByRole("button", { name: "Yes, daily" }));
    expect(sendAnswers).toHaveBeenCalledWith("run1", [{ questionId: "q1", value: "Yes, daily", via: "option" }]);
    expect(await screen.findByText("Ran payroll accurately")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Accept section" }));
    expect(acceptSection).toHaveBeenCalledWith("run1", "experience", { decisions: [{ itemId: "b1", keep: true }], inferred: [], flags: [] });

    await user.click(await screen.findByRole("button", { name: "Keep it" }));
    expect(await screen.findByText("Gusto")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove Gusto" }));
    await user.click(screen.getByRole("button", { name: "Accept section" }));
    expect(acceptSection).toHaveBeenLastCalledWith("run1", "skills", {
      decisions: [], inferred: [{ itemId: "new-skill:Gusto", keep: false }], flags: [{ questionId: "f1", confirmed: true }],
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/jobs/one/cv"));
    expect(router.state.location.search).toBe("?cv=cv1");
  });

  it("Skip all goes straight to the run", async () => {
    const user = userEvent.setup();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun());
    vi.mocked(askQuestions).mockResolvedValueOnce([question("q1"), question("q2")]);
    renderFlow();
    await user.click(await screen.findByRole("button", { name: "Skip all" }));
    expect(sendAnswers).toHaveBeenCalledWith("run1", [
      { questionId: "q1", value: null, via: "skip" }, { questionId: "q2", value: null, via: "skip" },
    ]);
    await waitFor(() => expect(runSection).toHaveBeenCalledWith("run1", "experience"));
    expect(screen.queryByText("Question q2?")).toBeNull();
  });

  it("updates the score in the step bar after an accept", async () => {
    const user = userEvent.setup();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun());
    vi.mocked(acceptSection).mockResolvedValue({ run: makeRun({ currentSection: "skills" }), score: score(71) });
    renderFlow();
    expect(await screen.findByText("Score 62")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: "Accept section" }));
    expect(await screen.findByText("Score 62→71")).toBeTruthy();
  });

  it("resumes at section 2 after a reload", async () => {
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun({ currentSection: "skills" }));
    renderFlow();
    await waitFor(() => expect(askQuestions).toHaveBeenCalledWith("run1", "skills"));
    expect(screen.getByRole("listitem", { current: "step" }).textContent).toContain("Skills");
    expect(screen.queryByRole("button", { name: /Start/ })).toBeNull();
    expect(startTailoring).not.toHaveBeenCalled();
  });

  it("keeps progress and offers a retry when a section fails", async () => {
    const user = userEvent.setup();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun());
    vi.mocked(runSection).mockRejectedValueOnce(new ApiClientError(502, "ai_failed", "x"));
    renderFlow();
    expect(await screen.findByText("Couldn't tailor Experience. Try again")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(runSection).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Couldn't tailor Experience. Try again")).toBeNull();
  });

  it("shows the deleted message for job_not_found", async () => {
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockRejectedValue(new ApiClientError(404, "job_not_found", "gone"));
    renderFlow();
    expect(await screen.findByText("This job was deleted")).toBeTruthy();
  });
});

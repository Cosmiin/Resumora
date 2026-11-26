import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { TAILOR_SECTIONS, type MatchScore, type TailorQuestion, type TailorRun } from "@resumora/shared";

vi.mock("./tailor-api.ts", () => ({
  askAcross: vi.fn(async () => []), startTailoring: vi.fn(), getRun: vi.fn(), askQuestions: vi.fn(), sendAnswers: vi.fn(),
  runSection: vi.fn(), acceptSection: vi.fn(), getScores: vi.fn(), getToneExamples: vi.fn(), getLanguages: vi.fn(),
}));
vi.mock("../jobs/jobs-api.ts", () => ({ getJob: vi.fn(), scoreJob: vi.fn() }));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
vi.mock("./tailored-api.ts", () => ({ getTailored: vi.fn() }));
import { getTailored } from "./tailored-api.ts";
import { emptyCv } from "@resumora/shared";
import { getCv } from "../cv/cv-api.ts";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { ApiClientError } from "../lib/api.ts";
import { getJob, scoreJob } from "../jobs/jobs-api.ts";
import { acceptSection, askAcross, askQuestions, getLanguages, getRun, getScores, getToneExamples, runSection, sendAnswers, startTailoring } from "./tailor-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";

const at = "2026-11-08T10:00:00Z";
const makeRun = (over: Partial<TailorRun> = {}): TailorRun => ({
  id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections: [...TAILOR_SECTIONS],
  status: "running", currentSection: "experience", questions: null, answers: null, proposals: null, errorCode: null,
  roleOrder: ["r1"], currentRoleId: "r1", createdAt: at, updatedAt: at, ...over,
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
    { path: "/jobs/:id", element: <p>Job page</p> },
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
  vi.mocked(startTailoring).mockResolvedValue({ run: makeRun(), language: "en" });
  vi.mocked(getLanguages).mockResolvedValue({ cv: "en", ad: "en", chosen: "en" });
  vi.mocked(getJob).mockRejectedValue(new Error("offline"));
  vi.mocked(scoreJob).mockResolvedValue({ base: null, tailored: null, tailoredCvId: null, stale: false, hasTailoredCv: false });
  vi.mocked(sendAnswers).mockResolvedValue(undefined);
  vi.mocked(askQuestions).mockResolvedValue([]);
  vi.mocked(runSection).mockResolvedValue({ proposals: [], questions: [] });
  vi.mocked(getCv).mockRejectedValue(new Error("offline"));
  vi.mocked(getToneExamples).mockRejectedValue(new Error("offline"));
  vi.mocked(getTailored).mockRejectedValue(new Error("offline"));
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

  it("starts straight away in the person's language, with the keywords and the language in the bar", async () => {
    const user = userEvent.setup();
    const label = (ref: string, status: "met" | "missing") => ({ ref, kind: "keyword" as const, status, evidence: null, inferred: false });
    vi.mocked(getScores).mockResolvedValue({ base: { ...score(62), labels: [label("k:SQL", "met"), label("k:dbt", "missing")] }, tailored: null });
    vi.mocked(askQuestions).mockResolvedValue([question("q1", { roleId: "r1" })]);
    vi.mocked(startTailoring).mockResolvedValueOnce({ run: makeRun(), language: "en" }).mockResolvedValueOnce({ run: makeRun({ id: "run2" }), language: "ro" });
    renderFlow();
    expect(await screen.findByRole("heading", { name: "Question q1?" })).toBeInTheDocument();
    expect(startTailoring).toHaveBeenCalledWith("one", {}, undefined);
    expect(getLanguages).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "What this ad looks for" })).toBeNull();
    expect(await screen.findByLabelText("Keywords from the ad on your CV")).toHaveTextContent("1/2");
    // Until the first step is saved, another language starts again in that language.
    const menu = screen.getByRole("combobox", { name: "CV language" });
    expect(menu).toHaveValue("en");
    await user.selectOptions(menu, "ro");
    expect(startTailoring).toHaveBeenLastCalledWith("one", {}, "ro");
    await waitFor(() => expect(askQuestions).toHaveBeenLastCalledWith("run2", "experience", "r1"));
    expect(localStorage.getItem("resumora.tailorRun.one")).toBe("run2");
    // The new run asks the all-roles questions again.
    expect(askAcross).toHaveBeenCalledWith("run1");
    expect(askAcross).toHaveBeenLastCalledWith("run2");
  });

  it("shows the language as a plain label once a step is saved", async () => {
    vi.mocked(startTailoring).mockResolvedValue({ run: makeRun({ roleOrder: ["r1", "r2"], currentRoleId: "r2" }), language: "ro" });
    vi.mocked(askQuestions).mockResolvedValue([question("q1", { roleId: "r2" })]);
    renderFlow();
    expect(await screen.findByText("CV in Romanian")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "CV language" })).toBeNull();
  });

  it("asks for the match with the base CV when the job has none yet", async () => {
    vi.mocked(getScores).mockResolvedValue({ base: null, tailored: null });
    renderFlow();
    await waitFor(() => expect(scoreJob).toHaveBeenCalledWith("one"));
  });

  it("Skip this role leaves the role as it is and moves on; Back to the job leaves the flow", async () => {
    const user = userEvent.setup();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun({ roleOrder: ["r1", "r2"] }));
    vi.mocked(askQuestions).mockResolvedValue([question("q1", { roleId: "r1" })]);
    vi.mocked(acceptSection).mockResolvedValue({ run: makeRun({ roleOrder: ["r1", "r2"], currentRoleId: "r2" }), score: score(62) });
    const router = renderFlow();
    await user.click(await screen.findByRole("button", { name: "Skip this role" }));
    expect(acceptSection).toHaveBeenCalledWith("run1", "experience", { decisions: [], inferred: [], flags: [], roleId: "r1" });
    expect(runSection).not.toHaveBeenCalled();
    await waitFor(() => expect(askQuestions).toHaveBeenLastCalledWith("run1", "experience", "r2"));
    await user.click(await screen.findByRole("button", { name: "Back to the job" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/jobs/one"));
  });

  it("answers, reviews and accepts two sections, then the finish opens the tailored CV", async () => {
    const user = userEvent.setup();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun());
    vi.mocked(askQuestions).mockResolvedValueOnce([question("q1")]).mockResolvedValueOnce([]);
    vi.mocked(runSection)
      .mockResolvedValueOnce({ proposals: [{ itemId: "b1", field: "text", text: "Ran payroll accurately", inferred: false, flags: [] }], questions: [] })
      .mockResolvedValueOnce({ proposals: [{ itemId: "new-skill", field: "name", text: "Gusto", inferred: true, flags: [], reason: "Shown in: Payroll · Beta" }], questions: [] });
    vi.mocked(acceptSection)
      .mockResolvedValueOnce({ run: makeRun({ currentSection: "skills" }), score: score(71) })
      .mockResolvedValueOnce({ run: makeRun({ status: "done", currentSection: null }), score: score(78) });
    const router = renderFlow();

    await waitFor(() => expect(askQuestions).toHaveBeenCalledWith("run1", "experience", "r1"));
    // The run happens in the room: no app navigation, the map of the stops instead.
    await user.click(await screen.findByRole("button", { name: "Yes, daily" }));
    expect(screen.queryByRole("link", { name: "My CV" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Tailoring steps" })).toBeInTheDocument();
    expect(screen.getByText("Why I ask: Gap")).toBeInTheDocument();
    expect(sendAnswers).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Finish the questions" }));
    expect(sendAnswers).toHaveBeenCalledWith("run1", [{ questionId: "q1", value: "Yes, daily", via: "option" }]);
    expect(runSection).toHaveBeenCalledWith("run1", "experience", "r1");
    // A plain rewording is used without a review, and Skills come straight up.
    await waitFor(() => expect(acceptSection).toHaveBeenCalledWith("run1", "experience", { decisions: [], inferred: [], flags: [], roleId: "r1" }));
    expect(screen.queryByText("Ran payroll accurately")).toBeNull();
    expect(await screen.findByText("Gusto")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove Gusto" }));
    await user.click(screen.getByRole("button", { name: "Save skills" }));
    expect(acceptSection).toHaveBeenLastCalledWith("run1", "skills", {
      decisions: [], inferred: [{ itemId: "new-skill:Gusto", keep: false }], flags: [],
    });
    expect(await screen.findByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Result");
    expect(screen.getByText("16 points better than your base CV.")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Open the CV" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/jobs/one/cv"));
    expect(router.state.location.search).toBe("?cv=cv1");
  });

  it("goes straight on after Skills, with a line on what they moved", async () => {
    const user = userEvent.setup();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun({ currentSection: "skills" }));
    vi.mocked(runSection).mockResolvedValueOnce({ proposals: [{ itemId: "new-skill", field: "name", text: "Gusto", inferred: true, flags: [], reason: "Shown in: Payroll" }], questions: [] });
    vi.mocked(acceptSection).mockResolvedValueOnce({ run: makeRun({ currentSection: "summary" }), score: score(70) });
    vi.mocked(askQuestions).mockResolvedValueOnce([]).mockResolvedValueOnce([question("s1", { section: "summary" })]);
    renderFlow();
    await user.click(await screen.findByRole("button", { name: "Save skills" }));
    expect(await screen.findByRole("heading", { name: "Question s1?" })).toBeInTheDocument();
    expect(screen.getByText("Skills done · match 62 → 70")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Next:/ })).toBeNull();
  });

  it("Back shows the earlier answer selected; the role's answers are sent together after its last question", async () => {
    const user = userEvent.setup();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun());
    vi.mocked(askQuestions).mockResolvedValueOnce([question("q1", { roleId: "r1" }), question("q2", { roleId: "r1" })]);
    renderFlow();
    await user.click(await screen.findByRole("button", { name: "Yes, daily" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Question q2?" })).toBeInTheDocument();
    expect(screen.getByText("Role 1 of 1 · Question 2 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Question q1?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, daily" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(sendAnswers).toHaveBeenCalledTimes(1);
    expect(sendAnswers).toHaveBeenCalledWith("run1", [
      { questionId: "q1", value: "Yes, daily", via: "option" }, { questionId: "q2", value: null, via: "skip" },
    ]);
    await waitFor(() => expect(runSection).toHaveBeenCalledWith("run1", "experience", "r1"));
  });

  it("goes through Experience role by role, then on to Skills", async () => {
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun({ roleOrder: ["r1", "r2"], currentRoleId: "r1" }));
    vi.mocked(acceptSection)
      .mockResolvedValueOnce({ run: makeRun({ roleOrder: ["r1", "r2"], currentRoleId: "r2", status: "running" }), score: score(66) })
      .mockResolvedValueOnce({ run: makeRun({ roleOrder: ["r1", "r2"], currentRoleId: null, currentSection: "skills" }), score: score(70) });
    renderFlow();
    // Nothing to confirm in either role: each is saved and the next comes straight up.
    await waitFor(() => expect(askQuestions).toHaveBeenCalledWith("run1", "experience", "r2"));
    await waitFor(() => expect(acceptSection).toHaveBeenLastCalledWith("run1", "experience", { decisions: [], inferred: [], flags: [], roleId: "r2" }));
    await waitFor(() => expect(askQuestions).toHaveBeenLastCalledWith("run1", "skills", undefined));
  });

  it("resumes at section 2 after a reload", async () => {
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun({ currentSection: "skills" }));
    renderFlow();
    await waitFor(() => expect(askQuestions).toHaveBeenCalledWith("run1", "skills", undefined));
    expect(await screen.findByRole("listitem", { current: "step" })).toHaveTextContent("Skills");
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

  it("starts again on its own when the run was made from a CV that was replaced since", async () => {
    localStorage.setItem("resumora.tailorRun.one", "old");
    vi.mocked(getRun).mockResolvedValue(makeRun({ id: "old" }));
    vi.mocked(askQuestions).mockRejectedValueOnce(new ApiClientError(409, "base_cv_changed", "replaced")).mockResolvedValue([question("q1", { roleId: "r1" })]);
    renderFlow();
    expect(await screen.findByRole("heading", { name: "Question q1?" })).toBeInTheDocument();
    expect(startTailoring).toHaveBeenCalledWith("one", {}, undefined);
    expect(localStorage.getItem("resumora.tailorRun.one")).toBe("run1");
  });
});

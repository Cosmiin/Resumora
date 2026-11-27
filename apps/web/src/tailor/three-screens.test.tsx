import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { emptyCv, type Answer, type MatchScore, type TailoredCv, type TailorQuestion, type TailorRun, type TailorSection } from "@resumora/shared";

vi.mock("./tailor-api.ts", () => ({
  startTailoring: vi.fn(), getRun: vi.fn(), getScores: vi.fn(), askGaps: vi.fn(), sendAnswers: vi.fn(), writeStep: vi.fn(), finishRun: vi.fn(),
  getSteering: vi.fn(), changeSteering: vi.fn(), getToneExamples: vi.fn(),
}));
vi.mock("../jobs/jobs-api.ts", () => ({ getJob: vi.fn(), scoreJob: vi.fn() }));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
vi.mock("./tailored-api.ts", () => ({ getTailored: vi.fn(), reviewItem: vi.fn() }));
import { getCv } from "../cv/cv-api.ts";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { getJob, scoreJob } from "../jobs/jobs-api.ts";
import { ApiClientError } from "../lib/api.ts";
import { askGaps, changeSteering, finishRun, getRun, getScores, getSteering, getToneExamples, sendAnswers, startTailoring, writeStep } from "./tailor-api.ts";
import { getTailored } from "./tailored-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";

const at = "2026-11-27T10:00:00Z";
const role = (id: string, title: string, company: string) => ({
  id, company, title, location: "", startDate: "2021-03", endDate: "", current: true, description: "", notes: [], bullets: [{ id: `${id}-b1`, text: "Made weekly reports" }],
});
const cv = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop", summary: "Analyst." },
  experience: [role("r1", "Business Analyst", "Emedi"), role("r2", "Intern", "Acme")], technicalSkills: [{ id: "s1", name: "Excel" }] };
const sections: TailorSection[] = ["experience", "skills", "summary", "layout"];
const makeRun = (over: Partial<TailorRun> = {}): TailorRun => ({
  id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections, status: "running", currentSection: "experience",
  questions: null, answers: null, proposals: null, errorCode: null, roleOrder: ["r1", "r2"], currentRoleId: "r1", createdAt: at, updatedAt: at, ...over,
});
const score = (total: number): MatchScore => ({ policy: "match/1", total, band: "fair", capped: false, labels: [],
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });
const gap = (id: string, skill: string): TailorQuestion => ({
  id, section: "experience", roleId: null, text: `Did you use ${skill}?`, kind: "skill", options: [], reason: `The ad asks for ${skill}.`, gap: `k:${skill}`, skill, scope: "all",
});
const kissflow = gap("q1", "KissFlow");
const zendesk = gap("q2", "Zendesk");
const used: Answer = { questionId: "q1", value: "Yes", via: "option", use: "used", roleIds: ["r1"] };
const skipped: Answer = { questionId: "q2", value: null, via: "skip" };
const done = (over: Partial<TailorRun> = {}) => makeRun({ status: "done", currentSection: null, currentRoleId: null, ...over });
const tailored = { id: "cv1", version: 2, language: "en", template: "modern", coverLetter: null, content: cv, baseSnapshot: cv, review: {} } as unknown as TailoredCv;
const steps = () => vi.mocked(writeStep).mock.calls.map(([id, section, roleId]) => `${id}:${roleId ?? section}`);

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
  vi.mocked(getJob).mockRejectedValue(new Error("offline"));
  vi.mocked(scoreJob).mockResolvedValue({ base: null, tailored: null, tailoredCvId: null, stale: false, hasTailoredCv: false });
  vi.mocked(getCv).mockResolvedValue({ content: cv, version: 1, updatedAt: at } as Awaited<ReturnType<typeof getCv>>);
  vi.mocked(getTailored).mockResolvedValue(tailored);
  vi.mocked(getToneExamples).mockRejectedValue(new Error("offline"));
  vi.mocked(askGaps).mockResolvedValue([kissflow, zendesk]);
  vi.mocked(sendAnswers).mockResolvedValue(undefined);
  vi.mocked(writeStep).mockResolvedValue({ changed: 1, removed: 0 });
  vi.mocked(finishRun).mockImplementation(async (id) => ({ run: done({ id }), score: score(81) }));
});

describe("tailoring in three screens", () => {
  it("asks every question on one screen, tailors every part in one wait, and ends on the final page", async () => {
    const user = userEvent.setup();
    // The last part waits until the test lets it through, so the wait can be looked at.
    let letLayout!: () => void;
    vi.mocked(writeStep).mockImplementation((_id, section) => (section === "layout"
      ? new Promise((resolve) => { letLayout = () => resolve({ changed: 1, removed: 0 }); }) : Promise.resolve({ changed: 1, removed: 0 })));
    renderFlow();

    expect(await screen.findByRole("heading", { name: "The job asks for 2 things your CV doesn't show" })).toBeInTheDocument();
    expect(startTailoring).toHaveBeenCalledWith("one", {}, undefined);
    expect(localStorage.getItem("resumora.tailorRun.one")).toBe("run1");
    // Until the answers are sent the CV's language can still be changed.
    expect(screen.getByRole("combobox", { name: "CV language" })).toHaveValue("en");
    await user.click(within(screen.getByRole("group", { name: "Did you use KissFlow?" })).getByRole("button", { name: /Business Analyst/ }));
    await user.click(screen.getByRole("button", { name: "Tailor my CV" }));

    expect(await screen.findByText("Tailoring your CV: 4 of 5 parts done")).toBeInTheDocument();
    expect(sendAnswers).toHaveBeenCalledWith("run1", [used, skipped]);
    expect(screen.queryByRole("combobox", { name: "CV language" })).toBeNull();
    expect(steps().slice(0, 4).sort()).toEqual(["run1:r1", "run1:r2", "run1:skills", "run1:summary"]);
    expect(steps()[4]).toBe("run1:layout");
    expect(finishRun).not.toHaveBeenCalled();

    // With every part written, the wait says the match is being worked out.
    let letFinish!: () => void;
    vi.mocked(finishRun).mockImplementation((id) => new Promise((resolve) => { letFinish = () => resolve({ run: done({ id }), score: score(81) }); }));
    letLayout();
    expect(await screen.findByText("Working out your new match…")).toBeInTheDocument();
    letFinish();
    expect(await screen.findByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    expect(finishRun).toHaveBeenCalledTimes(1);
    // The match in the bar: with the base CV, and with the tailored one.
    expect(screen.getByLabelText("Match")).toHaveTextContent("62");
    expect(screen.getByLabelText("Match")).toHaveTextContent("81");
    expect(await screen.findByRole("heading", { name: "What changed on your CV" })).toBeInTheDocument();
    expect(localStorage.getItem("resumora.tailorRun.one")).toBeNull();
    // None of the old screens: no map of steps, no question card, no review.
    expect(screen.queryByRole("navigation", { name: "Tailoring steps" })).toBeNull();
  });

  it("goes straight to the wait when the job asks for nothing the CV doesn't show", async () => {
    vi.mocked(askGaps).mockResolvedValue([]);
    renderFlow();
    expect(await screen.findByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    expect(sendAnswers).not.toHaveBeenCalled();
    expect(writeStep).toHaveBeenCalledTimes(5);
  });

  it("a run left during the wait runs the wait again, without asking what was answered", async () => {
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(makeRun({ questions: [kissflow, zendesk], answers: [used, skipped] }));
    renderFlow();
    expect(await screen.findByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    expect(startTailoring).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Tailor my CV" })).toBeNull();
    expect(sendAnswers).not.toHaveBeenCalled();
    expect(writeStep).toHaveBeenCalledTimes(5);
  });

  it("a run that only redoes sections with no role asks nothing", async () => {
    vi.mocked(startTailoring).mockResolvedValue({ run: makeRun({ sections: ["summary"], currentSection: "summary", roleOrder: [], currentRoleId: null, kind: "section" }), language: "en" });
    renderFlow();
    expect(await screen.findByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    expect(askGaps).not.toHaveBeenCalled();
    expect(steps()).toEqual(["run1:summary"]);
  });

  it("opens a run already done on the final page, writing nothing", async () => {
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(done());
    vi.mocked(getScores).mockResolvedValue({ base: score(62), tailored: score(79) });
    renderFlow();
    expect(await screen.findByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    expect(askGaps).not.toHaveBeenCalled();
    expect(writeStep).not.toHaveBeenCalled();
    expect(finishRun).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Match")).toHaveTextContent("79"));
  });

  it("names a part that couldn't be tailored on the final page", async () => {
    vi.mocked(askGaps).mockResolvedValue([]);
    vi.mocked(writeStep).mockImplementation(async (_id, section, roleId) => {
      if (section === "summary" || roleId === "r2") throw new ApiClientError(502, "ai_failed", "Couldn't tailor it.");
      return { changed: 1, removed: 0 };
    });
    renderFlow();
    expect(await screen.findByText("2 parts couldn't be tailored and stay as you wrote them: Intern · Acme, Summary.")).toBeInTheDocument();
    expect(finishRun).toHaveBeenCalledTimes(1);
  });

  it("says the job was deleted", async () => {
    vi.mocked(askGaps).mockResolvedValue([]);
    vi.mocked(writeStep).mockRejectedValue(new ApiClientError(404, "job_not_found", "gone"));
    renderFlow();
    expect(await screen.findByText("This job was deleted")).toBeInTheDocument();
    expect(finishRun).not.toHaveBeenCalled();
    expect(localStorage.getItem("resumora.tailorRun.one")).toBeNull();
  });

  it("starts again on its own when the CV the run was made from was replaced", async () => {
    localStorage.setItem("resumora.tailorRun.one", "old");
    vi.mocked(getRun).mockResolvedValue(makeRun({ id: "old" }));
    vi.mocked(askGaps).mockRejectedValueOnce(new ApiClientError(409, "base_cv_changed", "replaced")).mockResolvedValue([kissflow]);
    renderFlow();
    expect(await screen.findByRole("heading", { name: "The job asks for 1 thing your CV doesn't show" })).toBeInTheDocument();
    expect(startTailoring).toHaveBeenCalledWith("one", {}, undefined);
    expect(localStorage.getItem("resumora.tailorRun.one")).toBe("run1");
  });

  it("offers to try again when something fails, from where it stopped", async () => {
    const user = userEvent.setup();
    vi.mocked(askGaps).mockResolvedValue([]);
    vi.mocked(finishRun).mockRejectedValueOnce(new ApiClientError(409, "version_conflict", "saved elsewhere"));
    renderFlow();
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    expect(finishRun).toHaveBeenCalledTimes(2);
  });

  it("Change my answers opens the questions with the answers given, and sending them tailors again", async () => {
    const user = userEvent.setup();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(done({ questions: [kissflow, zendesk], answers: [used, skipped] }));
    vi.mocked(getSteering).mockResolvedValue({ tone: "formal" });
    vi.mocked(changeSteering).mockResolvedValue({ run: makeRun({ id: "run2", questions: [kissflow, zendesk], answers: [used, skipped] }) });
    renderFlow();
    await user.click(await screen.findByRole("button", { name: "Change my answers" }));

    const first = within(screen.getByRole("group", { name: "Did you use KissFlow?" }));
    expect(first.getByRole("button", { name: /Business Analyst/ })).toHaveAttribute("aria-pressed", "true");
    // The CV is not touched until the answers are sent.
    expect(changeSteering).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("group", { name: "Did you use Zendesk?" })).getByRole("button", { name: /Intern/ }));
    await user.click(screen.getByRole("button", { name: "Tailor my CV" }));

    expect(await screen.findByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    // Every part is written again from the person's own wording, in a new run that carries the questions over.
    expect(changeSteering).toHaveBeenCalledWith("run1", { tone: "formal" });
    expect(sendAnswers).toHaveBeenCalledWith("run2", [used, { questionId: "q2", value: "Yes", via: "option", use: "used", roleIds: ["r2"] }]);
    expect(steps().every((step) => step.startsWith("run2:"))).toBe(true);
    expect(finishRun).toHaveBeenCalledWith("run2");
  });

  it("has no Change my answers when nothing was asked", async () => {
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getRun).mockResolvedValue(done());
    renderFlow();
    expect(await screen.findByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change my answers" })).toBeNull();
  });

  it("Adjust opens the tone screen from the questions, and a new tone tailors again with the same answers", async () => {
    const user = userEvent.setup();
    vi.mocked(getSteering).mockResolvedValue({ tone: "formal" });
    vi.mocked(changeSteering).mockResolvedValue({ run: makeRun({ id: "run2", questions: [kissflow, zendesk], answers: [used, skipped] }) });
    renderFlow();
    await screen.findByRole("heading", { name: "The job asks for 2 things your CV doesn't show" });
    await user.click(screen.getByRole("button", { name: "Adjust" }));
    expect(await screen.findByRole("heading", { name: "How should your CV sound?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(within(screen.getByRole("alertdialog")).getAllByRole("button")[1]!);
    expect(await screen.findByRole("heading", { name: "Tailoring is done" })).toBeInTheDocument();
    expect(changeSteering).toHaveBeenCalledWith("run1", expect.objectContaining({ tone: "formal" }));
    expect(localStorage.getItem("resumora.tailorRun.one")).toBeNull();
    expect(steps().every((step) => step.startsWith("run2:"))).toBe(true);
  });

  it("Back to the job leaves the flow", async () => {
    const user = userEvent.setup();
    const router = renderFlow();
    await screen.findByRole("heading", { name: "The job asks for 2 things your CV doesn't show" });
    await user.click(screen.getByRole("button", { name: "Back to the job" }));
    expect(router.state.location.pathname).toBe("/jobs/one");
  });
});

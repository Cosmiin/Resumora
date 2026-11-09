import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { emptyCv, TAILOR_SECTIONS, type MatchScore, type TailorRun } from "@resumora/shared";

vi.mock("./tailor-api.ts", () => ({
  startTailoring: vi.fn(), getRun: vi.fn(), askQuestions: vi.fn(), sendAnswers: vi.fn(), runSection: vi.fn(), acceptSection: vi.fn(),
  getScores: vi.fn(), getToneExamples: vi.fn(), redoRole: vi.fn(), acceptRole: vi.fn(), changeSteering: vi.fn(), getSteering: vi.fn(),
}));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
import { getCv } from "../cv/cv-api.ts";
import { useVoice } from "../cv/enrich/useVoice.ts";
import {
  acceptRole, acceptSection, askQuestions, changeSteering, getRun, getScores, getSteering, getToneExamples, redoRole, runSection,
} from "./tailor-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";

const at = "2026-11-09T10:00:00Z";
const role = (id: string, title: string, bullet: string) => ({ id, company: "Emedi", title, location: "", startDate: "2021-03", endDate: "2022-01",
  current: false, description: "", bullets: [{ id: `${id}-b`, text: bullet }], notes: [] });
const cv = { ...emptyCv("en"), experience: [role("r1", "Business Analyst", "Made weekly reports"), role("r2", "Data Clerk", "Checked sheets")] };
// Experience is finished for both roles; the run is on Skills.
const run = (over: Partial<TailorRun> = {}): TailorRun => ({
  id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections: [...TAILOR_SECTIONS],
  status: "waiting_user", currentSection: "skills", errorCode: null, roleOrder: ["r1", "r2"], currentRoleId: null, createdAt: at, updatedAt: at,
  questions: [
    { id: "q1", section: "experience", roleId: "r1", text: "How often?", kind: "options", options: ["Weekly"], reason: "Gap" },
    { id: "q2", section: "experience", roleId: "r2", text: "How many sheets?", kind: "options", options: ["10"], reason: "Gap" },
  ],
  answers: [{ questionId: "q1", value: "Weekly", via: "option" }, { questionId: "q2", value: "10", via: "option" }],
  proposals: null, ...over,
});
const score = (total: number): MatchScore => ({ policy: "match/1", total, band: "fair", capped: false, labels: [],
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });

function renderFlow() {
  const router = createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] });
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem("resumora.tailorRun.one", "run1");
  vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
    interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
  vi.mocked(getScores).mockResolvedValue({ base: score(62), tailored: score(70) });
  vi.mocked(getCv).mockResolvedValue({ content: cv, version: 1, updatedAt: at });
  vi.mocked(getRun).mockResolvedValue(run());
  vi.mocked(askQuestions).mockResolvedValue([]);
  vi.mocked(runSection).mockResolvedValue({ proposals: [{ itemId: "s1", field: "name", text: "Advanced Excel", inferred: false, flags: [] }], questions: [] });
  vi.mocked(getToneExamples).mockRejectedValue(new Error("offline"));
  vi.mocked(getSteering).mockResolvedValue({ tone: "formal", fit: "mostly", instruction: "Keep it short" });
});

describe("going back (BackA)", () => {
  it("opens a finished role from the step bar, edits an answer in place and updates only that role", async () => {
    const user = userEvent.setup();
    vi.mocked(redoRole).mockResolvedValue({ proposals: [{ itemId: "r2-b", field: "text", text: "Checked 12 sheets a day", inferred: false, flags: [] }], removed: 0 });
    vi.mocked(acceptRole).mockResolvedValue({ run: run(), score: score(74) });
    renderFlow();
    expect(await screen.findByText("Advanced Excel")).toBeTruthy();

    const steps = screen.getByRole("navigation", { name: "Tailoring steps" });
    expect(within(steps).queryByRole("button", { name: "Summary" })).toBeNull();
    await user.click(within(steps).getByRole("button", { name: "Experience" }));
    const roles = screen.getByRole("list", { name: "Finished roles" });
    expect(within(roles).getByRole("button", { name: /Business Analyst/ })).toBeTruthy();
    await user.click(within(roles).getByRole("button", { name: /Data Clerk/ }));

    expect(screen.getByRole("heading", { name: "Your answers" })).toBeTruthy();
    expect(screen.queryByText("How often?")).toBeNull();
    const box = screen.getByRole("textbox");
    expect(box).toHaveValue("10");
    await user.clear(box);
    await user.type(box, "12 a day");
    await user.click(screen.getByRole("button", { name: "Update this role" }));
    expect(redoRole).toHaveBeenCalledWith("run1", "r2", [{ questionId: "q2", value: "12 a day", via: "typed" }]);

    expect(await screen.findByText("12", { selector: "mark" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Use the new version" }));
    expect(acceptRole).toHaveBeenCalledWith("run1", "r2", { decisions: [{ itemId: "r2-b", keep: true }], inferred: [], flags: [] });
    // Back where the person was: the Skills review, not redone.
    expect(await screen.findByText("Advanced Excel")).toBeTruthy();
    expect(runSection).toHaveBeenCalledTimes(1);
    expect(acceptSection).not.toHaveBeenCalled();
  });

  it("changing the steering shows a confirm box first, then redoes every step in a new run", async () => {
    const user = userEvent.setup();
    vi.mocked(changeSteering).mockResolvedValue({ run: run({ id: "run2", kind: "retailor", status: "running", currentSection: "experience", currentRoleId: "r1" }) });
    renderFlow();
    expect(await screen.findByText("Advanced Excel")).toBeTruthy();

    await user.click(within(screen.getByRole("navigation", { name: "Tailoring steps" })).getByRole("button", { name: "Tone and questions" }));
    await user.click(await screen.findByRole("button", { name: /^Confident/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const confirm = screen.getByRole("alertdialog", { name: "Redo every step?" });
    expect(changeSteering).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "Redo everything" }));
    // Starts from the stored steering: only the tone changed.
    expect(changeSteering).toHaveBeenCalledWith("run1", { tone: "confident", draws: [], fit: "mostly", focusRoleIds: [], instruction: "Keep it short" });
    await waitFor(() => expect(askQuestions).toHaveBeenCalledWith("run2", "experience", "r1"));
    expect(localStorage.getItem("resumora.tailorRun.one")).toBe("run2");
  });

  it("Cancel in the confirm box goes back to where the person was", async () => {
    const user = userEvent.setup();
    renderFlow();
    expect(await screen.findByText("Advanced Excel")).toBeTruthy();
    await user.click(within(screen.getByRole("navigation", { name: "Tailoring steps" })).getByRole("button", { name: "Tone and questions" }));
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Advanced Excel")).toBeTruthy();
    expect(changeSteering).not.toHaveBeenCalled();
  });
});

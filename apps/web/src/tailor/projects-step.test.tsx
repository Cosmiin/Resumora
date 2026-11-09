import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { emptyCv, TAILOR_SECTIONS, type MatchScore, type TailorQuestion, type TailorRun } from "@resumora/shared";
import { roleDone } from "./role-done.ts";

// E6 Task 9: the "Projects & volunteering" step reuses the Experience loop, item by item, with the kind's labels.
vi.mock("./tailor-api.ts", () => ({
  startTailoring: vi.fn(), getRun: vi.fn(), askQuestions: vi.fn(), sendAnswers: vi.fn(), runSection: vi.fn(), acceptSection: vi.fn(),
  getScores: vi.fn(), getToneExamples: vi.fn(), redoRole: vi.fn(), acceptRole: vi.fn(), getSteering: vi.fn(), changeSteering: vi.fn(),
}));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
vi.mock("../jobs/jobs-api.ts", () => ({ getJob: vi.fn() }));
import { getCv } from "../cv/cv-api.ts";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { getJob } from "../jobs/jobs-api.ts";
import { acceptSection, askQuestions, getRun, getScores, runSection, sendAnswers } from "./tailor-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";

const item = (id: string, title: string, company: string, bullet: string) => ({ id, company, title, location: "", startDate: "2021-03", endDate: "",
  current: false, description: "", bullets: [{ id: `${id}-b`, text: bullet }], notes: [] });
const analyst = item("r1", "Business Analyst", "Emedi", "Made weekly reports");
const checker = { ...item("p1", "Payroll checker", "Personal project", "Built an Excel checker"), url: "" };
const mentor = item("v1", "Mentor", "Junior Achievement", "Taught budgeting");
const at = "2026-11-09T10:00:00Z";
const score = (total: number): MatchScore => ({ policy: "match/1", total, band: "fair", capped: false, labels: [],
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });
const run = (over: Partial<TailorRun> = {}): TailorRun => ({
  id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections: [...TAILOR_SECTIONS],
  status: "running", currentSection: "projects", errorCode: null, roleOrder: ["r1", "p1", "v1"], currentRoleId: "p1", createdAt: at, updatedAt: at,
  questions: null, answers: null, proposals: null, ...over,
});
const question = (roleId: string): TailorQuestion => ({ id: `q-${roleId}`, section: "projects", roleId, text: "Which checks did it run?",
  kind: "options", options: ["Tax codes"], reason: "Gap" });

function open() {
  render(<RouterProvider router={createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] })} />);
}

describe("Projects & volunteering step", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
      interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
    vi.mocked(getScores).mockResolvedValue({ base: score(82), tailored: null });
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv("en"), experience: [analyst], projects: [checker], volunteering: [mentor] }, version: 1, updatedAt: at });
    vi.mocked(getJob).mockResolvedValue({ extracted: { company: "DSV", requirements: [] } } as never);
    vi.mocked(getRun).mockResolvedValue(run());
    vi.mocked(sendAnswers).mockResolvedValue();
  });

  it("asks about the project beside it, reviews it as on the CV, then goes on to the volunteering role", async () => {
    const user = userEvent.setup();
    vi.mocked(askQuestions).mockImplementation(async (_id, _section, roleId) => [question(roleId!)]);
    vi.mocked(runSection).mockResolvedValue({ proposals: [{ itemId: "p1-b", field: "text", text: "Built an Excel payroll checker", inferred: false, flags: [] }], questions: [] });
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ currentRoleId: "v1" }), score: score(84) });
    open();

    expect(await screen.findByText("Project 1 of 1 · Question 1 of 1")).toBeInTheDocument();
    expect(askQuestions).toHaveBeenLastCalledWith("run1", "projects", "p1");
    expect(screen.getByText("You're tailoring this project")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payroll checker" })).toBeInTheDocument();
    expect(screen.getByText("Projects & volunteering")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByRole("button", { name: "Use the new version" })).toBeInTheDocument();
    expect(runSection).toHaveBeenLastCalledWith("run1", "projects", "p1");
    await user.click(screen.getByRole("button", { name: "Use the new version" }));
    expect(acceptSection).toHaveBeenLastCalledWith("run1", "projects", expect.objectContaining({ roleId: "p1" }));
    expect(await screen.findByText("Up from 82. Nice work! 🎉")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next volunteering role: Mentor" }));
    expect(await screen.findByText("Volunteering 1 of 1 · Question 1 of 1")).toBeInTheDocument();
    expect(askQuestions).toHaveBeenLastCalledWith("run1", "projects", "v1");
    expect(screen.getByText("You're tailoring this volunteering role")).toBeInTheDocument();
  });
});

describe("a project with nothing to change (browser check)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(getScores).mockResolvedValue({ base: score(82), tailored: null });
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv("en"), experience: [analyst], projects: [checker], volunteering: [mentor] }, version: 1, updatedAt: at });
    vi.mocked(getJob).mockResolvedValue({ extracted: { company: "DSV", requirements: [] } } as never);
    vi.mocked(getRun).mockResolvedValue(run({ status: "waiting_user" }));
    vi.mocked(runSection).mockResolvedValue({ proposals: [], questions: [] });
  });

  it("says so in project words", async () => {
    open();
    expect(await screen.findByText("Nothing to change in this project ✓")).toBeInTheDocument();
  });
});

describe("roleDone for projects and volunteering", () => {
  const items = [analyst, checker, mentor];

  it("names the step after the last role, and the kind for projects", () => {
    expect(roleDone({ names: [], company: "DSV", changed: true, from: 82, to: 82, next: run({ currentRoleId: "p1" }), roles: items, kind: "role" }).button)
      .toBe("On to Projects & volunteering");
    const nothing = roleDone({ names: [], company: null, changed: false, from: 82, to: 82, next: run({ currentSection: "skills", currentRoleId: null }), roles: items, kind: "project" });
    expect(nothing.title).toBe("Nothing to change in this project ✓");
    expect(nothing.button).toBe("On to Skills");
    expect(roleDone({ names: ["BPMN"], company: "DSV", changed: true, from: 82, to: 84, next: run({ currentRoleId: "v1" }), roles: items, kind: "project" }).line)
      .toBe("This project now shows BPMN, something DSV asks for.");
  });
});

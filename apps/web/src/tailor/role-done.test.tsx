import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { emptyCv, TAILOR_SECTIONS, type JobExtraction, type MatchLabel, type MatchScore, type TailorRun } from "@resumora/shared";
import { newlyMet, roleDone } from "./role-done.ts";

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
import { acceptSection, askQuestions, getRun, getScores, runSection } from "./tailor-api.ts";
import { TailorFlow } from "./TailorFlow.tsx";

const role = (id: string, title: string, bullet: string) => ({ id, company: "Emedi", title, location: "", startDate: "2021-03", endDate: "",
  current: false, description: "", bullets: [{ id: `${id}-b`, text: bullet }], notes: [] });
const analyst = role("r1", "Business Analyst", "Made weekly reports");
const job = {
  title: "Business Analyst", company: "DSV", requirements: [
    { text: "BPMN", kind: "must", category: "skill" }, { text: "Stakeholder work", kind: "must", category: "skill" },
    { text: "SQL", kind: "must", category: "skill" },
  ],
} as unknown as JobExtraction;
const label = (ref: string, status: MatchLabel["status"], evidence: string | null = null): MatchLabel =>
  ({ ref, kind: ref.startsWith("k:") ? "keyword" : "requirement", status, evidence, inferred: false });
const score = (total: number | null, labels: MatchLabel[] = []): MatchScore => ({ policy: "match/1", total, band: "fair", capped: false, labels,
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });

describe("newlyMet", () => {
  const texts = ["Business Analyst", "Mapped processes in BPMN with stakeholders"];

  it("names only labels that went to met and whose evidence is in this role, at most 2", () => {
    const before = score(60, [label("r0", "missing"), label("r1", "partial"), label("r2", "met", "SQL"), label("k:Excel", "missing")]);
    const after = score(70, [
      label("r0", "met", "mapped processes in BPMN"), label("r1", "met", "with stakeholders"),
      label("r2", "met", "SQL"), label("k:Excel", "met", "Excel at Beta Corp"),
    ]);
    expect(newlyMet(before, after, texts, job)).toEqual(["BPMN", "Stakeholder work"]);
  });

  it("names a keyword by its term and skips labels without evidence", () => {
    const after = score(70, [label("k:BPMN", "met", "BPMN"), label("r2", "met", null)]);
    expect(newlyMet(score(60, [label("k:BPMN", "partial")]), after, texts, job)).toEqual(["BPMN"]);
  });
});

describe("roleDone", () => {
  const next = (over: Partial<TailorRun>) => ({ currentSection: "experience", currentRoleId: "r2", ...over }) as TailorRun;
  const roles = [analyst, role("r2", "Data Clerk", "Checked sheets")];

  it("says what this role now shows and names the next role", () => {
    const done = roleDone({ names: ["BPMN", "Stakeholder work"], company: "DSV", changed: true, from: 82, to: 86, next: next({}), roles });
    expect(done.line).toBe("This role now shows BPMN and Stakeholder work, two things DSV asks for.");
    expect(done.title).toBe("Up from 82. Nice work! 🎉");
    expect(done.button).toBe("Next role: Data Clerk");
  });

  it("goes to Skills after the last role, and says when a role changed nothing", () => {
    const done = roleDone({ names: [], company: null, changed: false, from: 82, to: 82, next: next({ currentSection: "skills", currentRoleId: null }), roles });
    expect(done.title).toBe("Nothing to change in this role ✓");
    expect(done.line).toBeNull();
    expect(done.button).toBe("On to Skills");
  });
});

describe("the role done moment in the flow", () => {
  const at = "2026-11-09T10:00:00Z";
  const run = (over: Partial<TailorRun> = {}): TailorRun => ({
    id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections: [...TAILOR_SECTIONS],
    status: "waiting_user", currentSection: "experience", errorCode: null, roleOrder: ["r1"], currentRoleId: "r1", createdAt: at, updatedAt: at,
    questions: null, answers: null, proposals: null, ...over,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem("resumora.tailorRun.one", "run1");
    vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
      interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
    vi.mocked(getScores).mockResolvedValue({ base: score(82, [label("r0", "missing")]), tailored: null });
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv("en"), experience: [analyst] }, version: 1, updatedAt: at });
    vi.mocked(getJob).mockResolvedValue({ extracted: job } as never);
    vi.mocked(getRun).mockResolvedValue(run());
    vi.mocked(askQuestions).mockResolvedValue([]);
    vi.mocked(runSection).mockResolvedValue({ proposals: [{ itemId: "r1-b", field: "text", text: "Mapped processes in BPMN", inferred: false, flags: [] }], questions: [] });
  });

  it("after the last role shows the score and what the role now shows, then goes on to Skills", async () => {
    const user = userEvent.setup();
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ status: "running", currentSection: "skills", currentRoleId: null }),
      score: score(86, [label("r0", "met", "processes in BPMN")]) });
    render(<RouterProvider router={createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] })} />);

    await user.click(await screen.findByRole("button", { name: "Use the new version" }));
    expect(await screen.findByText("This role now shows BPMN, something DSV asks for.")).toBeInTheDocument();
    expect(screen.getByText("Up from 82. Nice work! 🎉")).toBeInTheDocument();
    expect(askQuestions).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "On to Skills" }));
    expect(askQuestions).toHaveBeenLastCalledWith("run1", "skills", undefined);
  });

  it("stamps role 1 of 2 with its kept wording and continues to the next role", async () => {
    const user = userEvent.setup();
    const roles = [analyst, role("r2", "Data Clerk", "Checked sheets")];
    vi.mocked(getScores).mockResolvedValue({ base: score(41), tailored: null });
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv("en"), experience: roles }, version: 1, updatedAt: at });
    vi.mocked(getRun).mockResolvedValue(run({ roleOrder: ["r1", "r2"] }));
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ status: "running", roleOrder: ["r1", "r2"], currentRoleId: "r2" }), score: score(58) });
    vi.mocked(askQuestions).mockResolvedValue([{ id: "q2", section: "experience", roleId: "r2", kind: "options", text: "Which sheets did you check?", options: ["Payroll"], reason: "Gap" }]);
    vi.mocked(runSection).mockResolvedValue({ proposals: [
      { itemId: "r1-b", field: "text", text: "Mapped processes in BPMN", inferred: false, flags: [] },
      { itemId: "r1", field: "description", text: "Worked with stakeholders", inferred: true, flags: [] },
    ], questions: [] });
    render(<RouterProvider router={createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] })} />);

    await user.click(await screen.findByRole("button", { name: "Use the new version" }));
    expect(await screen.findByText("Role 1 tailored")).toBeInTheDocument();
    expect(screen.getByText("41 → 58")).toBeInTheDocument();
    const page = screen.getByRole("complementary", { name: "The role this is about" });
    expect(within(page).getByText("Mapped processes in BPMN")).toBeInTheDocument();
    expect(within(page).getByText("Worked with stakeholders")).toBeInTheDocument();
    expect(within(page).queryByText("Made weekly reports")).not.toBeInTheDocument();
    expect(page.querySelector('[aria-current="true"], del, .page-del')).toBeNull();
    expect(page.closest(".tailor-mode")).toHaveClass("is-wide");
    expect(page.closest(".tailor-mode")).toHaveAttribute("data-section", "bullets");

    await user.click(screen.getByRole("button", { name: "Next role: Data Clerk" }));
    expect(await screen.findByText("Role 2 of 2 · Question 1 of 1")).toBeInTheDocument();
    expect(askQuestions).toHaveBeenLastCalledWith("run1", "experience", "r2");
  });

  it.each([[41, 41], [null, 41], [41, null]])("shows the stamp for scores %s to %s", async (from, to) => {
    const user = userEvent.setup();
    vi.mocked(getScores).mockResolvedValue({ base: from === null ? null : score(from), tailored: null });
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ currentSection: "skills", currentRoleId: null }), score: score(to) });
    render(<RouterProvider router={createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] })} />);

    await user.click(await screen.findByRole("button", { name: "Use the new version" }));
    const stamp = (await screen.findByText("Role 1 tailored")).parentElement!;
    if (from === null || to === null) expect(within(stamp).queryByText(/→/)).not.toBeInTheDocument();
    else expect(within(stamp).getByText("41 → 41")).toBeInTheDocument();
  });

  it.each([
    ["p1", "Project 1 tailored"], ["v1", "Volunteering 1 tailored"],
  ])("stamps %s using its position among items of the same kind", async (id, stamp) => {
    const user = userEvent.setup();
    const project = { ...role("p1", "Payroll checker", "Built a checker"), url: "" };
    const volunteering = role("v1", "Mentor", "Taught budgeting");
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv("en"), experience: [analyst], projects: [project], volunteering: [volunteering] }, version: 1, updatedAt: at });
    vi.mocked(getRun).mockResolvedValue(run({ currentSection: "projects", currentRoleId: id, roleOrder: ["r1", "v1", "p1"] }));
    vi.mocked(runSection).mockResolvedValue({ proposals: [{ itemId: `${id}-b`, field: "text", text: "Mapped processes in BPMN", inferred: false, flags: [] }], questions: [] });
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ currentSection: "skills", currentRoleId: null }), score: score(86) });
    render(<RouterProvider router={createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] })} />);

    await user.click(await screen.findByRole("button", { name: "Use the new version" }));
    expect(await screen.findByText(stamp)).toBeInTheDocument();
    expect(within(screen.getByRole("complementary")).getByText("Mapped processes in BPMN")).toBeInTheDocument();
  });

  it("shows the Base wording when the proposed change was reverted", async () => {
    const user = userEvent.setup();
    vi.mocked(acceptSection).mockResolvedValue({ run: run({ currentSection: "skills", currentRoleId: null }), score: score(82) });
    render(<RouterProvider router={createMemoryRouter([{ path: "/jobs/:id/tailor", element: <TailorFlow /> }], { initialEntries: ["/jobs/one/tailor"] })} />);

    await user.click(await screen.findByRole("button", { name: "Keep the original" }));
    expect(await screen.findByText("Role 1 tailored")).toBeInTheDocument();
    const page = screen.getByRole("complementary");
    expect(within(page).getByText("Made weekly reports")).toBeInTheDocument();
    expect(within(page).queryByText("Mapped processes in BPMN")).not.toBeInTheDocument();
  });

});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { emptyCv, fingerprint, notesHash, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import type { RoleScoreState } from "./useRoleScores.ts";

// Task 5 (E6): the path start (1A) and the stops for projects and volunteering.

vi.mock("./FocusMode.tsx", async (orig) => {
  const real = await orig<typeof import("./FocusMode.tsx")>();
  return {
    ...real,
    FocusMode: (props: Parameters<typeof real.FocusMode>[0]) => (props.target.roleId.startsWith("real-") ? real.FocusMode(props) : (
      <div data-testid="focus">
        {props.topBar}
        <p>Session for {props.target.roleId}</p>
        <button type="button" onClick={() => props.next?.onNext()}>{props.next?.label}</button>
        <button type="button" onClick={props.onClose}>✕ Close</button>
      </div>
    )),
  };
});
const api = vi.hoisted(() => ({
  suggestAchievements: vi.fn(), getSkillSuggestions: vi.fn(), getScores: vi.fn(), scoreRole: vi.fn(),
  improveBullet: vi.fn(), brainDump: vi.fn(), roleFacts: vi.fn(), roleDescription: vi.fn(), createVoiceSession: vi.fn(),
}));
vi.mock("./enrich-api.ts", () => api);

import { EnrichPath } from "./EnrichPath.tsx";
import { FocusMode } from "./FocusMode.tsx";
import { useRoleScores } from "./useRoleScores.ts";
import { Overview } from "../panel/Overview.tsx";
import { cvReducer } from "../edit/cvReducer.ts";

beforeEach(() => {
  vi.resetAllMocks();
  api.suggestAchievements.mockReturnValue(new Promise(() => {}));
  api.getSkillSuggestions.mockReturnValue(new Promise(() => {}));
  api.getScores.mockResolvedValue([]);
  api.roleFacts.mockResolvedValue({ facts: [], fromNotes: "x" });
  api.scoreRole.mockRejectedValue(new Error("unavailable"));
  api.roleDescription.mockResolvedValue({ text: "", keywords: [] });
});

const item = (id: string, title: string, company = `${title} Co`): Experience => ({
  id, company, title, location: "", startDate: "2020-01", endDate: "", current: true,
  description: "", bullets: [{ id: `${id}-b`, text: "Did things." }], notes: [],
});
const project = (id: string, title: string) => ({ ...item(id, title, "Personal project"), url: "" });
const ready = (score: number): RoleScoreState => ({
  state: "ready",
  result: { roleId: "x", policy: "score/4", fingerprint: "x", score, bullets: [], nextStep: null, questions: [], roleQuestions: [], thin: false } satisfies RoleResult,
});

const full: CvContent = {
  ...emptyCv(),
  experience: [item("a", "Analyst"), item("b", "Buyer")],
  projects: [project("p1", "Route planner"), project("p2", "Chess bot")],
  volunteering: [item("v1", "Food bank helper")],
  courses: [
    { id: "c1", name: "Excel", provider: "Udemy", date: "2022" },
    { id: "c2", name: "SQL", provider: "Coursera", date: "2023" },
    { id: "c3", name: "Git", provider: "", date: "", bullets: [{ id: "c3-l", text: "Branching and rebasing." }] },
  ],
  awards: [{ id: "w1", name: "Employee of the month", issuer: "Acme", date: "2021", description: "" }],
  interests: [{ id: "i1", name: "Chess" }, { id: "i2", name: "Hiking" }, { id: "i3", name: "Cooking" }],
};
const scores = new Map<string, RoleScoreState>([
  ["a", ready(90)], ["b", ready(61)], ["p1", ready(85)], ["p2", ready(40)], ["v1", ready(55)],
]);

function Path({ cv = full, s = scores, onClose = () => {} }: { cv?: CvContent; s?: Map<string, RoleScoreState>; onClose?(): void }) {
  return <MemoryRouter><EnrichPath cv={cv} dispatch={() => {}} scores={s} waitForSave={() => Promise.resolve()} onClose={onClose} /></MemoryRouter>;
}

describe("path start (1A)", () => {
  it("groups roles, then projects and volunteering, listing only items below 80, and a quick-pass row", () => {
    render(<Path />);
    expect(screen.getByRole("heading", { name: "Let's make your CV stronger, one step at a time" })).toBeInTheDocument();
    expect(screen.getByText("About 3 minutes per role · 1 per section")).toBeInTheDocument();
    const roles = screen.getByRole("list", { name: "Your roles" });
    expect(within(roles).getAllByRole("listitem").map((li) => li.textContent)).toEqual([expect.stringContaining("Buyer")]);
    const other = screen.getByRole("list", { name: "Projects and volunteering" });
    const rows = within(other).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Chess bot");
    expect(rows[0]).toContain("40");
    expect(rows[1]).toContain("Food bank helper");
    // Only lighter items with no lines yet are counted (Q3): the Git course has lines.
    expect(screen.getByText("Courses & training · 2 · Awards and honors · 1 · Interests · 3")).toBeInTheDocument();
  });

  it("shows no projects group when the CV has no projects or volunteering", () => {
    render(<Path cv={{ ...full, projects: [], volunteering: [] }} />);
    expect(screen.queryByRole("list", { name: "Projects and volunteering" })).toBeNull();
    expect(screen.queryByText("Projects and volunteering")).toBeNull();
  });

  it("finishing the last role opens the first project, then volunteering, with their own top bar", async () => {
    render(<Path />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer →" }));
    expect(screen.getByText("Session for b")).toBeInTheDocument();
    expect(screen.getByText("Role 1 of 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByText("Session for p2")).toBeInTheDocument();
    expect(screen.getByText("Project 1 of 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByText("Session for v1")).toBeInTheDocument();
    expect(screen.getByText("Volunteering 1 of 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(screen.queryByTestId("focus")).toBeNull();
    // Then the lighter items with no lines yet (Task 7).
    expect(screen.getByText("Courses & training · 1 of 2")).toBeInTheDocument();
  });

  it("✕ and reopen start at the first item still below 80, roles or not", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<Path onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer →" }));
    await userEvent.click(screen.getByRole("button", { name: "✕ Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    render(<Path s={new Map(scores).set("b", ready(84))} />);
    expect(screen.queryByRole("list", { name: "Your roles" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Start with Chess bot →" }));
    expect(screen.getByText("Session for p2")).toBeInTheDocument();
  });
});

describe("focus mode on a project", () => {
  it("says Your project and project score", () => {
    const p = { ...project("real-p", "Route planner"), bullets: [{ id: "rb", text: "Built a planner." }] };
    const cv: CvContent = { ...emptyCv(), projects: [p] };
    const result: RoleResult = { roleId: "real-p", policy: "score/4", fingerprint: fingerprint(p, "en"), score: 50, bullets: [], nextStep: null, questions: [], roleQuestions: [], thin: false };
    render(<FocusMode target={{ roleId: "real-p", mode: "improve" }} cv={cv} dispatch={() => {}} scores={new Map([["real-p", { state: "ready", result }]])}
      waitForSave={() => Promise.resolve()} onClose={() => {}} />);
    expect(screen.getByText("Your project")).toBeInTheDocument();
    expect(screen.getByText("project score")).toBeInTheDocument();
    expect(screen.getByText("Route planner")).toBeInTheDocument();
  });
});

describe("scores and the panel cover projects and volunteering", () => {
  afterEach(() => vi.useRealTimers());

  it("useRoleScores gives an entry for every scored item", async () => {
    const view = renderHook(() => useRoleScores({ cv: full, status: "saved" }));
    await act(async () => {});
    expect([...view.result.current.scores.keys()]).toEqual(["a", "b", "p1", "p2", "v1"]);
  });

  it("the overview lists roles, then projects and volunteering, under their own headings", async () => {
    const onFocusField = vi.fn();
    render(<Overview cv={full} dispatch={() => {}} onFocusField={onFocusField} opened={new Set()} onOpen={() => {}} scores={scores} />);
    expect(screen.getByText("Your roles")).toBeInTheDocument();
    expect(screen.getByText("Projects and volunteering")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Chess bot/ }));
    expect(onFocusField).toHaveBeenCalledWith("projects-p2-title");
    await userEvent.click(screen.getByRole("button", { name: /^Food bank helper/ }));
    expect(onFocusField).toHaveBeenCalledWith("volunteering-v1-title");
  });
});

describe("the reducer's role actions work on projects and volunteering", () => {
  const cv: CvContent = { ...emptyCv(), projects: [project("p", "Planner")], volunteering: [{ ...item("v", "Helper"), description: "Helper Co" }] };

  it("replaceBullet and addBullets", () => {
    let next = cvReducer(cv, { type: "replaceBullet", roleId: "p", bulletId: "p-b", text: "Built a route planner." });
    next = cvReducer(next, { type: "addBullets", roleId: "v", texts: ["Sorted 200 parcels a week."] });
    expect(next.projects[0]!.bullets.map((b) => b.text)).toEqual(["Built a route planner."]);
    expect(next.volunteering[0]!.bullets.map((b) => b.text)).toEqual(["Did things.", "Sorted 200 parcels a week."]);
  });

  it("setNote and setFacts", () => {
    const note = { id: "n1", question: "What was it for?", answer: "Delivery drivers", via: ["type" as const], askedAt: "2026-11-09T10:00:00Z" };
    const next = cvReducer(cv, { type: "setNote", roleId: "p", note });
    expect(next.projects[0]!.notes).toEqual([note]);
    const facts = { items: ["Delivery drivers"], fromNotes: "", updatedAt: "2026-11-09T10:00:00Z" };
    const withFacts = cvReducer({ ...cv, volunteering: [{ ...cv.volunteering[0]!, notes: [] }] }, { type: "setFacts", roleId: "v", facts: { ...facts, fromNotes: notesHash([]) } });
    expect(withFacts.volunteering[0]!.facts?.items).toEqual(["Delivery drivers"]);
  });

  it("clearCopiedDescriptions empties copied descriptions in volunteering too", () => {
    const next = cvReducer(cv, { type: "clearCopiedDescriptions" });
    expect(next.volunteering[0]!.description).toBe("");
  });
});

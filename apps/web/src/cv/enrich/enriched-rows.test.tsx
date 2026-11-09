import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { emptyCv, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import type { RoleScoreState } from "./useRoleScores.ts";

// Task 8 (E6, 4A): "Your CV is enriched" has one row per item: roles, projects and volunteering, then "Also".

vi.mock("./FocusMode.tsx", async (orig) => {
  const real = await orig<typeof import("./FocusMode.tsx")>();
  return {
    ...real,
    FocusMode: ({ target, next }: { target: { roleId: string }; next?: { label: string; onNext(): void } }) => (
      <div data-testid="focus">
        <p>Session for {target.roleId}</p>
        <button type="button" onClick={() => next?.onNext()}>{next?.label}</button>
      </div>
    ),
  };
});
const api = vi.hoisted(() => ({ suggestAchievements: vi.fn(), getSkillSuggestions: vi.fn(), itemLines: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { EnrichPath } from "./EnrichPath.tsx";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";

const item = (id: string, title: string, company = `${title} Co`): Experience => ({
  id, company, title, location: "", startDate: "2020-01", endDate: "", current: true,
  description: "", bullets: [{ id: `${id}-b`, text: "Did things." }], notes: [],
});
const ready = (score: number): RoleScoreState => ({
  state: "ready",
  result: { roleId: "x", policy: "score/4", fingerprint: "x", score, bullets: [], nextStep: null, questions: [], roleQuestions: [], thin: false } satisfies RoleResult,
});
const base: CvContent = {
  ...emptyCv(),
  experience: [item("a", "Analyst"), item("b", "Buyer")],
  projects: [{ ...item("p", "Route planner", "Personal project"), url: "" }],
  courses: [{ id: "c1", name: "Excel", provider: "Udemy", date: "" }, { id: "c2", name: "SQL", provider: "", date: "" }],
  interests: [{ id: "i1", name: "Chess" }],
};
const start = new Map([["a", ready(90)], ["b", ready(61)], ["p", ready(50)]]);

let dispatched: CvAction[] = [];
function Host({ scores, cv = base }: { scores: Map<string, RoleScoreState>; cv?: CvContent }) {
  const [state, apply] = useReducer(cvReducer, cv);
  const dispatch = (a: CvAction) => {
    dispatched.push(a);
    apply(a);
  };
  return <MemoryRouter><EnrichPath cv={state} dispatch={dispatch} scores={scores} waitForSave={() => Promise.resolve()} onClose={() => {}} /></MemoryRouter>;
}

beforeEach(() => {
  vi.resetAllMocks();
  dispatched = [];
  api.suggestAchievements.mockResolvedValue({ suggestions: [{ text: "Cut supplier costs by 10%", roleId: "b" }] });
  api.getSkillSuggestions.mockResolvedValue({ suggestions: [{ name: "SAP", group: "technicalSkills", evidence: "SAP" }], sort: [] });
  api.itemLines.mockResolvedValue({ lines: ["Pivot tables.", "Dashboards.", "Macros."] });
});

/** Roles and the project, two lines on the first course, skip the rest, one Key achievement. */
async function walk(after: Map<string, RoleScoreState>) {
  const view = render(<Host scores={start} />);
  await userEvent.click(screen.getByRole("button", { name: "Start with Buyer →" }));
  view.rerender(<Host scores={after} />);
  await userEvent.click(screen.getByRole("button", { name: "Next →" }));
  await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
  await userEvent.type(screen.getByRole("textbox"), "Pivot tables and dashboards");
  await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
  const boxes = await screen.findAllByRole("checkbox");
  await userEvent.click(boxes[0]!);
  await userEvent.click(boxes[1]!);
  await userEvent.click(screen.getByRole("button", { name: "Add 2 lines" }));
  await userEvent.click(screen.getByRole("button", { name: "Skip" }));
  await userEvent.click(screen.getByRole("button", { name: "Skip" }));
  await userEvent.click(await screen.findByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Add 1 achievement" }));
}

describe("Your CV is enriched (4A)", () => {
  it("rows in order: roles, projects and volunteering, then Also (sections with lines added) and Key achievements", async () => {
    await walk(new Map([["a", ready(90)], ["b", ready(82)], ["p", ready(86)]]));
    expect(await screen.findByRole("heading", { name: "Your CV is enriched" })).toBeInTheDocument();
    // Q1: the project counts toward the average when the CV has one: (90 + 61 + 50) / 3 → (90 + 82 + 86) / 3.
    expect(screen.getByText("Average score 67 → 86")).toBeInTheDocument();
    expect(screen.getByText("Projects and volunteering")).toBeInTheDocument();
    expect(screen.getByText("Also")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual([
      "Analyst · Analyst Co90", "Buyer · Buyer Co61 → 82",
      "Route planner · Personal project50 → 86",
      "Courses & training · 2 lines added", "Key achievements · 1 added", "Skills · 1 added",
    ]);
    // Interests had nothing added: no row.
    expect(screen.queryByText(/Interests/)).toBeNull();
    expect(dispatched.some((a) => a.type === "markEnriched")).toBe(true);
  });

  it("below 80 over every scored item: Almost there names the lowest item of any kind, and not saved as enriched", async () => {
    await walk(new Map([["a", ready(90)], ["b", ready(82)], ["p", ready(60)]]));
    expect(await screen.findByRole("heading", { name: "Almost there" })).toBeInTheDocument();
    expect(screen.getByText("Route planner is at 60. One more pass would get you over 80.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Improve Route planner" })).toBeInTheDocument();
    expect(dispatched.some((a) => a.type === "markEnriched")).toBe(false);
  });

  it("waits for a project still being scored before deciding", async () => {
    await walk(new Map([["a", ready(90)], ["b", ready(82)], ["p", { state: "scoring" }]]));
    expect(await screen.findByText("Checking your scores…")).toBeInTheDocument();
    expect(dispatched.some((a) => a.type === "markEnriched")).toBe(false);
  });
});

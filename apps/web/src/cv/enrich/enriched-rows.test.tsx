import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { emptyCv, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import type { RoleScoreState } from "./useRoleScores.ts";

// The result screen has one row per item (roles, projects and volunteering), then what else the path added.

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
  await userEvent.click(screen.getByRole("checkbox", { name: /Route planner/ }));
  await userEvent.click(screen.getByRole("button", { name: "Start with Buyer" }));
  view.rerender(<Host scores={after} />);
  await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.type(screen.getByRole("textbox"), "Pivot tables and dashboards");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  const boxes = await screen.findAllByRole("checkbox");
  await userEvent.click(boxes[0]!);
  await userEvent.click(boxes[1]!);
  await userEvent.click(screen.getByRole("button", { name: "Add 2 lines" }));
  await userEvent.click(screen.getByRole("button", { name: "Skip" }));
  await userEvent.click(screen.getByRole("button", { name: "Skip" }));
  await userEvent.click(await screen.findByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Add 1 achievement" }));
}

describe("the result of the path", () => {
  it("rows in order: roles, projects and volunteering, then sections with lines added and Key achievements", async () => {
    await walk(new Map([["a", ready(90)], ["b", ready(82)], ["p", ready(86)]]));
    expect(await screen.findByRole("heading", { name: "Your CV got stronger" })).toBeInTheDocument();
    // Q1: the project counts toward the average when the CV has one: the latest role counts 3 times, the next twice: (270 + 122 + 50) / 6 → (270 + 164 + 86) / 6.
    expect(screen.getByText("From 74 to 87 out of 100.")).toBeInTheDocument();
    const rows = [...document.querySelectorAll(".fm-reasons li")].map((li) => li.textContent);
    expect(rows).toEqual([
      "0Analyst, Analyst Co already reads clearly, so it had no questions.at 90",
      "+21Buyer, Buyer Cofrom 61 to 82",
      "+36Route planner, Personal projectfrom 50 to 86",
      "+Courses & training: 2 lines added", "+Key achievements: 1 added", "+Skills: 1 added",
    ]);
    // Interests had nothing added: no row.
    expect(screen.queryByText(/Interests/)).toBeNull();
    expect(dispatched.some((a) => a.type === "markEnriched")).toBe(true);
  });

  it("below 80 over every scored item: names the lowest item of any kind, and not saved as enriched", async () => {
    await walk(new Map([["a", ready(90)], ["b", ready(82)], ["p", ready(30)]]));
    expect(await screen.findByRole("heading", { name: "Your CV got stronger" })).toBeInTheDocument();
    expect(screen.getByText("Route planner is at 30. One more pass would lift it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Answer more questions" })).toBeInTheDocument();
    expect(dispatched.some((a) => a.type === "markEnriched")).toBe(false);
  });

  it("waits for a project still being scored before deciding", async () => {
    await walk(new Map([["a", ready(90)], ["b", ready(82)], ["p", { state: "scoring" }]]));
    expect(await screen.findByText("Checking your scores…")).toBeInTheDocument();
    expect(dispatched.some((a) => a.type === "markEnriched")).toBe(false);
  });
});

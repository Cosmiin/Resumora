import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import type { RoleScoreState } from "./useRoleScores.ts";

// Each role's focus session is replaced by a stub: these tests are about the path around it.
vi.mock("./FocusMode.tsx", () => ({
  FocusMode: ({ target, next, onClose, topBar }: {
    target: { roleId: string }; next?: { label: string; onNext(): void }; onClose(): void; topBar?: React.ReactNode;
  }) => (
    <div data-testid="focus">
      {topBar}
      <p>Session for {target.roleId}</p>
      <button type="button" onClick={() => next?.onNext()}>{next?.label}</button>
      <button type="button" onClick={onClose}>✕ Close</button>
    </div>
  ),
}));
const api = vi.hoisted(() => ({ suggestAchievements: vi.fn(), getSkillSuggestions: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);
import { EnrichPath } from "./EnrichPath.tsx";

beforeEach(() => {
  vi.resetAllMocks();
  api.suggestAchievements.mockReturnValue(new Promise(() => {}));
  api.getSkillSuggestions.mockReturnValue(new Promise(() => {}));
});

const role = (id: string, title: string): Experience => ({
  id, company: `${title} Co`, title, location: "", startDate: "2020-01", endDate: "", current: true,
  description: "", bullets: [{ id: `${id}-b`, text: "Did things." }], notes: [],
});
const ready = (score: number): RoleScoreState => ({
  state: "ready",
  result: { roleId: "x", policy: "score/4", fingerprint: "x", score, bullets: [], nextStep: null, questions: [], roleQuestions: [], thin: false } satisfies RoleResult,
});
const cv: CvContent = { ...emptyCv(), experience: [role("a", "Analyst"), role("b", "Buyer"), role("c", "Clerk"), role("d", "Driver")] };

function Host({ scores, onClose = () => {}, dispatch = () => {} }: { scores: Map<string, RoleScoreState>; onClose?(): void; dispatch?(a: unknown): void }) {
  return <EnrichPath cv={cv} dispatch={dispatch} scores={scores} waitForSave={() => Promise.resolve()} onClose={onClose} />;
}

describe("the guided path (1A)", () => {
  const scores = new Map<string, RoleScoreState>([["a", ready(90)], ["b", ready(61)], ["c", { state: "scoring" }], ["d", ready(80)]]);

  it("lists only roles below 80 (still scoring counts), in CV order, and starts with the first role's title", () => {
    render(<Host scores={scores} />);
    expect(screen.getByRole("heading", { name: "Let's make your CV stronger, one role at a time" })).toBeInTheDocument();
    expect(screen.getByText("About 3 minutes per role")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Buyer");
    expect(rows[0]).toContain("61");
    expect(rows[1]).toContain("Clerk");
    expect(screen.getByRole("button", { name: "Start with Buyer →" })).toBeInTheDocument();
  });

  it("goes role by role, then on to Key achievements", async () => {
    render(<Host scores={scores} />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer →" }));
    expect(screen.getByText("Session for b")).toBeInTheDocument();
    expect(screen.getByText("Role 1 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next role →" }));
    expect(screen.getByText("Session for c")).toBeInTheDocument();
    expect(screen.getByText("Role 2 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(screen.queryByTestId("focus")).toBeNull();
    expect(screen.getAllByText("Key achievements").length).toBeGreaterThan(0);
  });

  it("✕ closes the path; opening it again starts at the first role still below 80", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<Host scores={scores} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer →" }));
    await userEvent.click(screen.getByRole("button", { name: "✕ Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    render(<Host scores={new Map(scores).set("b", ready(84))} />);
    expect(screen.getByRole("button", { name: "Start with Clerk →" })).toBeInTheDocument();
  });

  it("with no role below 80, Continue goes to Key achievements", async () => {
    render(<Host scores={new Map([["a", ready(90)], ["b", ready(85)], ["c", ready(80)], ["d", ready(99)]])} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(screen.getAllByText("Key achievements").length).toBeGreaterThan(0);
  });

  it("Not now closes the start screen", async () => {
    const onClose = vi.fn();
    render(<Host scores={scores} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps its stops when a visited role's score changes mid-path", async () => {
    function Live() {
      const [live, setLive] = useState(scores);
      return (
        <>
          <button type="button" onClick={() => setLive(new Map(live).set("b", ready(88)))}>rescore</button>
          <EnrichPath cv={cv} dispatch={() => {}} scores={live} waitForSave={() => Promise.resolve()} onClose={() => {}} />
        </>
      );
    }
    render(<Live />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer →" }));
    await userEvent.click(screen.getByRole("button", { name: "rescore" }));
    expect(screen.getByText("Role 1 of 2")).toBeInTheDocument();
  });
});

describe("Key achievements (4A)", () => {
  const allDone = new Map([["a", ready(90)], ["b", ready(85)], ["c", ready(80)], ["d", ready(99)]]);
  const suggestions = [
    { text: "Cut supplier costs by 10%", roleId: "b" },
    { text: "Cleared a 3-month backlog", roleId: "c" },
    { text: "Planned routes for 20 drivers", roleId: "d" },
  ];
  async function open(dispatch = vi.fn()) {
    render(<Host scores={allDone} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    await screen.findByRole("heading", { name: "Which of these are true and you're proud of?" });
    return dispatch;
  }

  it("shows the suggestions as cards, none ticked, each naming its role", async () => {
    api.suggestAchievements.mockResolvedValue({ suggestions });
    await open();
    expect(screen.getByText("Almost done")).toBeInTheDocument();
    expect(screen.getByText("They open your CV, right under the summary.")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(screen.getByText("From Buyer · Buyer Co")).toBeInTheDocument();
    expect(screen.getByText("From Driver · Driver Co")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 0 achievements" })).toBeDisabled();
  });

  it("Add 2 achievements adds exactly those two in one action", async () => {
    api.suggestAchievements.mockResolvedValue({ suggestions });
    const dispatch = await open();
    await userEvent.click(screen.getByRole("checkbox", { name: /Cut supplier costs/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Planned routes/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add 2 achievements" }));
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "addAchievements", texts: ["Cut supplier costs by 10%", "Planned routes for 20 drivers"] });
    expect(screen.queryByRole("heading", { name: "Which of these are true and you're proud of?" })).toBeNull();
  });

  it("None of these adds nothing and moves on", async () => {
    api.suggestAchievements.mockResolvedValue({ suggestions });
    const dispatch = await open();
    await userEvent.click(screen.getByRole("button", { name: "None of these" }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Which of these are true and you're proud of?" })).toBeNull();
  });

  it.each(["empty", "failed"])("an %s answer skips the step", async (how) => {
    if (how === "empty") api.suggestAchievements.mockResolvedValue({ suggestions: [] });
    else api.suggestAchievements.mockRejectedValue(new Error("down"));
    render(<Host scores={allDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(await screen.findByText("Skills")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Which of these are true and you're proud of?" })).toBeNull();
  });
});

describe("skills added automatically (5A)", () => {
  const allDone = new Map([["a", ready(90)], ["b", ready(85)], ["c", ready(80)], ["d", ready(99)]]);
  async function toTheEnd(dispatch = vi.fn()) {
    api.suggestAchievements.mockResolvedValue({ suggestions: [] });
    render(<Host scores={allDone} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    return dispatch;
  }
  it("adds every suggestion in one action when the end is reached, lists them, and Undo removes exactly those", async () => {
    api.getSkillSuggestions.mockResolvedValue({ suggestions: [
      { name: "SAP", group: "technicalSkills", evidence: "SAP" }, { name: "Negotiation", group: "professionalSkills", evidence: "negotiated" },
    ], sort: [] });
    const dispatch = await toTheEnd();
    expect(await screen.findByText("Added 2 skills from your roles: SAP, Negotiation")).toBeInTheDocument();
    const adds = dispatch.mock.calls.filter(([a]) => a.type === "addSkills");
    expect(adds).toHaveLength(1);
    const added = adds[0]![0].skills as { id: string; name: string; group: string }[];
    expect(added.map((s) => [s.name, s.group])).toEqual([["SAP", "technicalSkills"], ["Negotiation", "professionalSkills"]]);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "removeSkills", ids: added.map((s) => s.id) });
    expect(screen.getByText("Skills removed")).toBeInTheDocument();
  });
  it.each(["empty", "failed"])("an %s answer adds nothing and shows no bar", async (how) => {
    if (how === "empty") api.getSkillSuggestions.mockResolvedValue({ suggestions: [], sort: [] });
    else api.getSkillSuggestions.mockRejectedValue(new Error("down"));
    const dispatch = await toTheEnd();
    expect(await screen.findByRole("button", { name: "Back to my CV" })).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByText(/from your roles/)).toBeNull();
  });
});

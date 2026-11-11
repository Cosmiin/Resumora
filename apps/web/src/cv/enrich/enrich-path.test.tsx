import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { emptyCv, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import type { RoleScoreState } from "./useRoleScores.ts";

// Each role's run of questions is replaced by a stub: these tests are about the path around it.
vi.mock("./RoleRun.tsx", () => ({
  RoleRun: ({ target, next, onClose, context, focus }: {
    target: { roleId: string }; next?: { label: string; onNext(): void }; onClose(): void; context?: string; focus?: string;
  }) => (
    <div data-testid="focus">
      <p>{context}</p>
      {focus && <p>Focus: {focus}</p>}
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
  return <MemoryRouter><EnrichPath cv={cv} dispatch={dispatch} scores={scores} waitForSave={() => Promise.resolve()} onClose={onClose} /></MemoryRouter>;
}

describe("the guided path (1A)", () => {
  const scores = new Map<string, RoleScoreState>([["a", ready(90)], ["b", ready(61)], ["c", ready(55)], ["d", ready(80)]]);

  it("lists every role in CV order with its score, ticks the recent ones below 80, and starts with the first ticked", () => {
    render(<Host scores={scores} />);
    expect(screen.getByRole("heading", { name: "What should we focus on?" })).toBeInTheDocument();
    const rows = screen.getAllByRole("checkbox");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAccessibleName(/Analyst, Analyst Co.*Score: 90 of 100/);
    expect(rows[1]).toHaveAccessibleName(/Buyer, Buyer Co.*Score: 61 of 100/);
    expect(rows[2]).toHaveAccessibleName(/Clerk, Clerk Co.*Score: 55 of 100/);
    expect(rows[3]).toHaveAccessibleName(/Driver, Driver Co.*Score: 80 of 100/);
    expect(rows.map((r) => (r as HTMLInputElement).checked)).toEqual([false, true, true, false]);
    expect(screen.getByText("2 of 4 chosen. The others stay on your CV as they are.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start with Buyer" })).toBeInTheDocument();
  });

  it("a tick never moves while scores arrive: each is placed once the roles above it have a score", () => {
    const checked = () => screen.getAllByRole("checkbox").map((r) => (r as HTMLInputElement).checked);
    const wait: RoleScoreState = { state: "scoring" };
    const view = render(<Host scores={new Map([["a", wait], ["b", wait], ["c", wait], ["d", wait]])} />);
    expect(screen.getAllByRole("checkbox")[2]).toHaveAccessibleName(/Clerk, Clerk Co.*Checking this role…/);
    expect(checked()).toEqual([false, false, false, false]);
    // Nothing to start with yet: the button waits rather than skipping every role.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    // A later role scored first is not ticked ahead of the ones above it.
    view.rerender(<Host scores={new Map([["a", wait], ["b", wait], ["c", ready(55)], ["d", wait]])} />);
    expect(checked()).toEqual([false, false, false, false]);
    view.rerender(<Host scores={new Map([["a", ready(90)], ["b", wait], ["c", ready(55)], ["d", wait]])} />);
    expect(checked()).toEqual([false, false, false, false]);
    view.rerender(<Host scores={new Map([["a", ready(90)], ["b", ready(61)], ["c", ready(55)], ["d", wait]])} />);
    expect(checked()).toEqual([false, true, true, false]);
    expect(screen.getByRole("button", { name: "Start with Buyer" })).toBeEnabled();
    view.rerender(<Host scores={new Map([["a", ready(90)], ["b", ready(61)], ["c", ready(55)], ["d", ready(40)]])} />);
    expect(checked()).toEqual([false, true, true, false]);
  });

  it("goes role by role, then on to Key achievements", async () => {
    render(<Host scores={scores} />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer" }));
    expect(screen.getByText("Session for b")).toBeInTheDocument();
    expect(screen.getByText("Role 1 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next role" }));
    expect(screen.getByText("Session for c")).toBeInTheDocument();
    expect(screen.getByText("Role 2 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByTestId("focus")).toBeNull();
    expect(screen.getAllByText("Key achievements").length).toBeGreaterThan(0);
  });

  it("✕ closes the path; opening it again starts at the first role still below 80", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<Host scores={scores} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer" }));
    await userEvent.click(screen.getByRole("button", { name: "✕ Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    render(<Host scores={new Map(scores).set("b", ready(84))} />);
    expect(screen.getByRole("button", { name: "Start with Clerk" })).toBeInTheDocument();
  });

  it("with no role below 80, Continue goes to Key achievements", async () => {
    render(<Host scores={new Map([["a", ready(90)], ["b", ready(85)], ["c", ready(80)], ["d", ready(99)]])} />);
    // Strong roles stay listed, unticked; the person may still tick one.
    const rows = screen.getAllByRole("checkbox");
    expect(rows).toHaveLength(4);
    expect(rows.some((r) => (r as HTMLInputElement).checked)).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getAllByText("Key achievements").length).toBeGreaterThan(0);
  });

  it("Not now closes the start screen", async () => {
    const onClose = vi.fn();
    render(<Host scores={scores} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
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
    render(<MemoryRouter><Live /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Skills")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Which of these are true and you're proud of?" })).toBeNull();
  });
});

describe("skills added automatically (5A)", () => {
  const allDone = new Map([["a", ready(90)], ["b", ready(85)], ["c", ready(80)], ["d", ready(99)]]);
  async function toTheEnd(dispatch = vi.fn()) {
    api.suggestAchievements.mockResolvedValue({ suggestions: [] });
    render(<Host scores={allDone} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
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
    expect(await screen.findByRole("button", { name: "See my CV" })).toBeInTheDocument();
    expect(dispatch.mock.calls.filter(([a]) => a.type === "addSkills" || a.type === "removeSkills")).toEqual([]);
    expect(screen.queryByText(/from your roles/)).toBeNull();
  });
});

describe("the end of the path (6B)", () => {
  const start = new Map<string, RoleScoreState>([["a", ready(90)], ["b", ready(61)], ["c", ready(70)], ["d", ready(80)]]);
  async function finish(after: Map<string, RoleScoreState>, dispatch = vi.fn()) {
    api.suggestAchievements.mockResolvedValue({ suggestions: [{ text: "Cut supplier costs by 10%", roleId: "b" }] });
    api.getSkillSuggestions.mockResolvedValue({ suggestions: [{ name: "SAP", group: "technicalSkills", evidence: "SAP" }], sort: [] });
    const view = render(<Host scores={start} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer" }));
    await userEvent.click(screen.getByRole("button", { name: "Next role" }));
    view.rerender(<Host scores={new Map([...after].map(([k, v]) => [k, k === "c" ? { state: "scoring" as const, result: v.result } : v]))} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Add 1 achievement" }));
    expect(await screen.findByText("Checking your scores…")).toBeInTheDocument();
    expect(dispatch.mock.calls.some(([a]) => a.type === "markEnriched")).toBe(false);
    view.rerender(<Host scores={after} dispatch={dispatch} />);
    return dispatch;
  }

  it("average 85: saves the CV as enriched and shows the report card", async () => {
    const dispatch = await finish(new Map([["a", ready(90)], ["b", ready(82)], ["c", ready(84)], ["d", ready(80)]]));
    expect(await screen.findByRole("heading", { name: "Your CV got stronger" })).toBeInTheDocument();
    expect(dispatch).toHaveBeenCalledWith({ type: "markEnriched", at: expect.any(String) });
    expect(screen.getByText("From 77 to 85 out of 100.")).toBeInTheDocument();
    const rows = [...document.querySelectorAll(".fm-reasons li")].map((li) => li.textContent);
    expect(rows).toEqual([
      "0Analyst, Analyst Co already reads clearly, so it had no questions.at 90",
      "+21Buyer, Buyer Cofrom 61 to 82",
      "+14Clerk, Clerk Cofrom 70 to 84",
      "0Driver, Driver Co already reads clearly, so it had no questions.at 80",
      "+Key achievements: 1 added", "+Skills: 1 added"]);
    expect(screen.getByText("Your CV is ready to be tailored to a job.")).toBeInTheDocument();
    expect(screen.getByText("Added 1 skill from your roles: SAP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find a job" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See my CV" })).toBeInTheDocument();
  });

  it("average 79: not saved as enriched, names the lowest role; Answer more questions opens it and comes back", async () => {
    const dispatch = await finish(new Map([["a", ready(90)], ["b", ready(66)], ["c", ready(68)], ["d", ready(80)]]));
    expect(await screen.findByRole("heading", { name: "Your CV got stronger" })).toBeInTheDocument();
    expect(dispatch.mock.calls.some(([a]) => a.type === "markEnriched")).toBe(false);
    expect(screen.getByText("From 77 to 79 out of 100.")).toBeInTheDocument();
    expect(screen.getByText("Buyer is at 66. One more pass would lift it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Find a job" })).toBeNull();
    expect(screen.getByText("Added 1 skill from your roles: SAP")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Answer more questions" }));
    expect(screen.getByText("Session for b")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Your CV got stronger" })).toBeInTheDocument();
  });
});

describe("whole-branch review fixes", () => {
  it("keeps every role listed while scores arrive, and a role the person ticked stays ticked", async () => {
    const loading = new Map<string, RoleScoreState>([["a", { state: "scoring" }], ["b", { state: "scoring" }], ["c", { state: "scoring" }], ["d", { state: "scoring" }]]);
    const view = render(<Host scores={loading} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    await userEvent.click(screen.getByRole("checkbox", { name: /Driver/ }));
    view.rerender(<Host scores={new Map([["a", ready(90)], ["b", ready(61)], ["c", ready(85)], ["d", ready(80)]])} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.getByRole("checkbox", { name: /Driver/ })).toBeChecked();
    // Buyer (61) is ticked for them; Driver is their own tick.
    expect(screen.getByText("2 of 4 chosen. The others stay on your CV as they are.")).toBeInTheDocument();
  });

  it("opened before the stored scores arrive (from /cv?enrich=1), it still leaves roles at 80 or more unticked", async () => {
    const loading = new Map<string, RoleScoreState>([["a", { state: "scoring" }], ["b", { state: "scoring" }], ["c", { state: "scoring" }], ["d", { state: "scoring" }]]);
    const view = render(<Host scores={loading} />);
    view.rerender(<Host scores={new Map([["a", ready(90)], ["b", ready(61)], ["c", ready(85)], ["d", ready(80)]])} />);
    expect(screen.getAllByRole("checkbox").map((b) => (b as HTMLInputElement).checked)).toEqual([false, true, false, false]);
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer" }));
    expect(screen.getByText("Role 1 of 1")).toBeInTheDocument();
  });

  it("Find a job waits for the save before leaving the CV", async () => {
    api.suggestAchievements.mockResolvedValue({ suggestions: [] });
    api.getSkillSuggestions.mockResolvedValue({ suggestions: [], sort: [] });
    let saved!: () => void;
    const waitForSave = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(new Promise<void>((done) => { saved = done; }));
    const onClose = vi.fn();
    const allDone = new Map([["a", ready(90)], ["b", ready(85)], ["c", ready(80)], ["d", ready(99)]]);
    render(<MemoryRouter><EnrichPath cv={cv} dispatch={() => {}} scores={allDone} waitForSave={waitForSave} onClose={onClose} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Find a job" }));
    expect(onClose).not.toHaveBeenCalled();
    saved();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("the focus step", () => {
  const scores = new Map<string, RoleScoreState>([["a", ready(40)], ["b", ready(61)], ["c", ready(70)], ["d", ready(80)]]);

  it("ticks the two most recent roles; the path visits only the ticked ones", async () => {
    render(<Host scores={scores} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, true, false, false]);
    expect(screen.getByText("2 of 4 chosen. The others stay on your CV as they are.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Analyst/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Clerk/ }));
    await userEvent.click(screen.getByRole("button", { name: "Start with Buyer" }));
    expect(screen.getByText("Session for b")).toBeInTheDocument();
    expect(screen.getByText("Role 1 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next role" }));
    expect(screen.getByText("Session for c")).toBeInTheDocument();
  });

  it("with nothing ticked, Continue goes past the roles", async () => {
    render(<Host scores={scores} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Analyst/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Buyer/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByTestId("focus")).toBeNull();
    expect(screen.getAllByText("Key achievements").length).toBeGreaterThan(0);
  });

  it("hands what the person wants their CV to bring out to every role's questions", async () => {
    render(<Host scores={scores} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Is there anything you want your CV to bring out?" }), "  Move into automation  ");
    await userEvent.click(screen.getByRole("button", { name: "Start with Analyst" }));
    expect(screen.getByText("Focus: Move into automation")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next role" }));
    expect(screen.getByText("Focus: Move into automation")).toBeInTheDocument();
  });

  it("the result says which roles were offered and not chosen", async () => {
    api.suggestAchievements.mockResolvedValue({ suggestions: [] });
    api.getSkillSuggestions.mockResolvedValue({ suggestions: [], sort: [] });
    render(<Host scores={scores} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Buyer/ }));
    await userEvent.click(screen.getByRole("button", { name: "Start with Analyst" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Here is where your CV stands" });
    const rows = [...document.querySelectorAll(".fm-reasons li")].map((li) => li.textContent);
    expect(rows).toEqual([
      "0Analyst, Analyst Co: no change this time.at 40",
      "0Buyer, Buyer Co is unchanged; you chose not to focus on it.at 61",
      "0Clerk, Clerk Co is unchanged; you chose not to focus on it.at 70",
      "0Driver, Driver Co already reads clearly, so it had no questions.at 80",
    ]);
  });
});

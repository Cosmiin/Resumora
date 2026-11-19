import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, fingerprint, type Change, type Coverage, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import type { RoleScoreState } from "./useRoleScores.ts";
import { EndStep } from "./EndStep.tsx";

const role = (id: string, title: string): Experience => ({
  id, company: "Acme", title, location: "", startDate: "2020-01", endDate: "", current: true, description: "",
  bullets: [{ id: `${id}b1`, text: "Did reports." }], notes: [],
});
const coverage: Coverage = {
  score: 100,
  marks: { company: "shown", purpose: "shown", actions: "shown", tools: "shown", results: "shown", scale: "shown", leadership: "na", seniority: "applies", people: "shown", domain: "na" },
  shape: { amount: false, repeats: true, order: true },
} as Coverage;
const result = (r: Experience, score: number): RoleResult => ({
  roleId: r.id, policy: "score/9", fingerprint: fingerprint(r, "en"), score, nextStep: null, thin: false, bullets: [],
  questions: [], roleQuestions: [], coverage,
} as RoleResult);

const r1 = role("r1", "Analyst");
const r2 = role("r2", "Clerk");
const cv: CvContent = { ...emptyCv("en"), experience: [r1, r2] };
const scores = new Map<string, RoleScoreState>([["r1", { state: "ready", result: result(r1, 85) }], ["r2", { state: "ready", result: result(r2, 70) }]]);
const weak: Change = { id: "c9", kind: "new", text: "Helped the team." };

function renderEnd(over: Partial<Parameters<typeof EndStep>[0]> = {}) {
  const props = {
    cv, scores, before: 64, held: [{ roleId: "r1", change: weak }], failed: false,
    onAdd: vi.fn(), onDone: vi.fn(), rolesBefore: new Map([["r1", 70], ["r2", 70]]), ...over,
  };
  render(<EndStep {...props} />);
  return props;
}

describe("EndStep", () => {
  it("shows the CV's score before and after, each role's, and its checklist ticks", () => {
    renderEnd();
    // (85*3 + 70*2) / 5 = 79
    expect(screen.getByRole("heading", { name: "Your CV: 64 → 79" })).toBeInTheDocument();
    const analyst = screen.getByRole("group", { name: /Analyst/ });
    expect(within(analyst).getByText("70 → 85")).toBeInTheDocument();
    expect(within(analyst).getByText("Seniority and reporting line")).toBeInTheDocument();
    expect(within(analyst).queryByText("Leadership")).toBeNull();
    expect(within(screen.getByRole("group", { name: /Clerk/ })).getByText("70")).toBeInTheDocument();
  });

  it("shows a held change with its line, and Add anyway adds it", async () => {
    const props = renderEnd();
    expect(screen.getByText("Not added: it would lower Analyst's score a little")).toBeInTheDocument();
    expect(screen.getByText("Helped the team.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add anyway" }));
    expect(props.onAdd).toHaveBeenCalledWith("r1", weak);
  });

  it("Edit it first adds the edited line", async () => {
    const props = renderEnd();
    await userEvent.click(screen.getByRole("button", { name: "Edit it first" }));
    const box = screen.getByRole("textbox", { name: "Your line" });
    expect(box).toHaveValue("Helped the team.");
    await userEvent.clear(box);
    await userEvent.type(box, "Trained 3 new clerks.");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(props.onAdd).toHaveBeenCalledWith("r1", { ...weak, text: "Trained 3 new clerks." });
  });

  it("says when some changes could not be made", () => {
    renderEnd({ failed: true, held: [] });
    expect(screen.getByRole("alert")).toHaveTextContent("Some changes could not be prepared.");
    expect(screen.queryByText(/Not added/)).toBeNull();
  });

  it("Done closes; more questions only when offered", async () => {
    const onMore = vi.fn();
    const props = renderEnd({ onMore, more: 8 });
    await userEvent.click(screen.getByRole("button", { name: "8 more questions" }));
    expect(onMore).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(props.onDone).toHaveBeenCalled();
  });
});

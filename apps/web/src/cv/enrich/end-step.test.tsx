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
const ask = { changeId: "c9", text: "What did you do for the team?", options: ["Trained … new clerks", "Ran the weekly rota"], amounts: ["1–3", "4–10"] };

function renderEnd(over: Partial<Parameters<typeof EndStep>[0]> = {}) {
  const props = {
    cv, scores, before: 64, held: [{ roleId: "r1", change: weak }], failed: false,
    onAdd: vi.fn(), onDone: vi.fn(), rolesBefore: new Map([["r1", 70], ["r2", 70]]), ...over,
  };
  render(<EndStep {...props} />);
  return props;
}

describe("EndStep", () => {
  it("shows the CV's score before and after with its gain, and each role's new score with its change, no checklist", () => {
    renderEnd();
    // (85*3 + 70*2) / 5 = 79
    expect(screen.getByRole("heading", { name: "Your CV: 64 → 79" })).toBeInTheDocument();
    expect(screen.getByText("+15", { selector: ".rr-gain" })).toBeInTheDocument();
    const analyst = screen.getByRole("group", { name: /Analyst/ });
    expect(within(analyst).getByText("85")).toBeInTheDocument();
    expect(within(analyst).getByText("+15")).toBeInTheDocument();
    expect(within(analyst).getByText(/^Acme · /)).toBeInTheDocument();
    expect(within(analyst).queryByText("Seniority and reporting line")).toBeNull();
    const clerk = screen.getByRole("group", { name: /Clerk/ });
    expect(within(clerk).getByText("70")).toBeInTheDocument();
    expect(clerk.querySelector(".sr-change")).toBeNull();
  });

  it("shows no gain next to the CV's score when it did not move", () => {
    renderEnd({ before: 79 });
    expect(screen.getByRole("heading", { name: "Your CV: 79" })).toBeInTheDocument();
    expect(document.querySelector(".rr-gain")).toBeNull();
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

  describe("a held line with a question (score/12)", () => {
    it("shows the question and its options; Add with this fact sends the answer", async () => {
      const onAddWithFact = vi.fn().mockResolvedValue(undefined);
      renderEnd({ held: [{ roleId: "r1", change: weak, ask }], onAddWithFact });
      expect(screen.getByText("Analyst: one fact away")).toBeInTheDocument();
      expect(screen.getByText("Helped the team.")).toBeInTheDocument();
      expect(screen.getByText("What did you do for the team?")).toBeInTheDocument();
      const add = screen.getByRole("button", { name: "Add with this fact" });
      expect(add).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Trained … new clerks" }));
      expect(add).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Ran the weekly rota" }));
      await userEvent.click(add);
      expect(onAddWithFact).toHaveBeenCalledWith("r1", weak, ask, "Ran the weekly rota", ["pick"]);
    });

    it("keeps the card with an error when adding fails, and Add as it is still works", async () => {
      const onAddWithFact = vi.fn().mockRejectedValue(new Error("boom"));
      const props = renderEnd({ held: [{ roleId: "r1", change: weak, ask }], onAddWithFact });
      await userEvent.click(screen.getByRole("button", { name: "Ran the weekly rota" }));
      await userEvent.click(screen.getByRole("button", { name: "Add with this fact" }));
      expect(await screen.findByText("Couldn't add it. Try again.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Add as it is" }));
      expect(props.onAdd).toHaveBeenCalledWith("r1", weak);
    });
  });
});

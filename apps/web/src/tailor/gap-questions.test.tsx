import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Answer, TailorQuestion } from "@resumora/shared";
import { GapQuestions } from "./GapQuestions.tsx";

const role = (id: string, title: string, company = "Emedi") => ({
  id, company, title, location: "", startDate: "2021-03", endDate: "", current: true, description: "", notes: [],
  bullets: [{ id: `${id}-b1`, text: "Made weekly reports" }],
});
const roles = [role("r1", "Business Analyst"), role("r2", "Data Analyst"), role("r3", "Intern"), role("r4", "Cashier"), role("r5", "Courier")];
const question = (id: string, skill: string, over: Partial<TailorQuestion> = {}): TailorQuestion => ({
  id, section: "experience", roleId: null, text: `Did you use ${skill}?`, kind: "skill", options: [], reason: `The ad asks for ${skill}.`,
  gap: `k:${skill}`, skill, scope: "all", ...over,
});
const kissflow = question("q1", "KissFlow");
const queues = question("q2", "queue health", { text: "Did you monitor ticket queues?", suggestedRoleIds: ["r4"], hint: "Made weekly reports" });

function show(questions: TailorQuestion[], over: Partial<Parameters<typeof GapQuestions>[0]> = {}) {
  const onSubmit = vi.fn<(answers: Answer[]) => void>();
  render(<GapQuestions questions={questions} roles={roles} locale="en" busy={false} onSubmit={onSubmit} {...over} />);
  return { onSubmit, row: (name: string) => screen.getByRole("group", { name }) };
}

describe("the one questions screen", () => {
  it("lists every gap as a row, with the roles to tick, and nothing ticked for the person", () => {
    const { row } = show([kissflow, queues]);
    expect(screen.getByRole("heading", { level: 1, name: "The job asks for 2 things your CV doesn't show" })).toBeInTheDocument();
    const first = within(row("Did you use KissFlow?"));
    expect(first.getAllByRole("button").map((b) => b.textContent)).toEqual([
      expect.stringContaining("Business Analyst"), expect.stringContaining("Data Analyst"), expect.stringContaining("Intern"),
      "2 more roles", "No",
    ]);
    // One way to say no: "something similar" asked nothing more and did the same as "No" (27 Nov, the owner: "How is
    // 'No, but I used something similar' here?", on "Have you led team leads for 2+ years?").
    expect(screen.queryByRole("button", { name: /something similar/ })).toBeNull();
    expect(first.queryByRole("button", { pressed: true })).toBeNull();

    // A role the CV hints at comes first and says so, with the CV's own words; it is not ticked.
    const second = within(row("Did you monitor ticket queues?"));
    expect(second.getByText("Your CV says: “Made weekly reports”")).toBeInTheDocument();
    const chips = second.getAllByRole("button");
    expect(chips[0]).toHaveTextContent("Cashier");
    expect(chips[0]).toHaveTextContent("your CV hints at this");
    expect(chips[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("sends what was ticked, a one-tap no, and a skip for a row left untouched", async () => {
    const user = userEvent.setup();
    const { onSubmit, row } = show([kissflow, queues, question("q3", "Zendesk")]);
    const first = within(row("Did you use KissFlow?"));
    await user.click(first.getByRole("button", { name: /Business Analyst/ }));
    await user.click(first.getByRole("button", { name: /Intern/ }));
    await user.click(within(row("Did you monitor ticket queues?")).getByRole("button", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "Tailor my CV" }));
    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: "q1", value: "Yes", via: "option", use: "used", roleIds: ["r1", "r3"] },
      { questionId: "q2", value: "No", via: "option", use: "none" },
      { questionId: "q3", value: null, via: "skip" },
    ]);
  });

  it("a no clears the ticks, and a tick clears the no", async () => {
    const user = userEvent.setup();
    const { onSubmit, row } = show([kissflow]);
    const first = within(row("Did you use KissFlow?"));
    await user.click(first.getByRole("button", { name: /Business Analyst/ }));
    await user.click(first.getByRole("button", { name: "No" }));
    expect(first.getByRole("button", { name: /Business Analyst/ })).toHaveAttribute("aria-pressed", "false");
    await user.click(first.getByRole("button", { name: /Data Analyst/ }));
    expect(first.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "false");
    // Unticking the only role leaves the row untouched again.
    await user.click(first.getByRole("button", { name: /Data Analyst/ }));
    await user.click(screen.getByRole("button", { name: "Tailor my CV" }));
    expect(onSubmit).toHaveBeenCalledWith([{ questionId: "q1", value: null, via: "skip" }]);
  });

  it("keeps the other roles and the later rows one click away", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 8 }, (_, i) => question(`q${i}`, `Tool ${i}`));
    const { row } = show(many);
    expect(screen.getAllByRole("group")).toHaveLength(6);
    await user.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(screen.getAllByRole("group")).toHaveLength(8);

    const first = within(row("Did you use Tool 0?"));
    expect(first.queryByRole("button", { name: /Courier/ })).toBeNull();
    await user.click(first.getByRole("button", { name: "2 more roles" }));
    expect(first.getByRole("button", { name: /Courier/ })).toBeInTheDocument();
    expect(first.queryByRole("button", { name: "2 more roles" })).toBeNull();
  });

  it("opens with the answers already given, and waits while they are sent", () => {
    const { row } = show([kissflow, queues], { busy: true, answers: [
      { questionId: "q1", value: "Yes", via: "option", use: "used", roleIds: ["r5"] },
      { questionId: "q2", value: "No", via: "option", use: "none" },
    ] });
    // A ticked role is shown even when it is one of the "more roles".
    expect(within(row("Did you use KissFlow?")).getByRole("button", { name: /Courier/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(row("Did you monitor ticket queues?")).getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tailor my CV" })).toBeDisabled();
  });

  it("opened to change earlier answers, it can be left without sending anything", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { onSubmit } = show([kissflow], { onCancel });
    expect(screen.getByRole("note")).toHaveTextContent("Sending your answers tailors your CV again from your own wording.");
    await user.click(screen.getByRole("button", { name: "Back to the result" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("has no way back on a first visit", () => {
    show([kissflow]);
    expect(screen.queryByRole("button", { name: "Back to the result" })).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("an earlier 'something similar' opens as No", async () => {
    const user = userEvent.setup();
    const { onSubmit, row } = show([kissflow], { answers: [{ questionId: "q1", value: "No", via: "option", use: "similar" }] });
    expect(within(row("Did you use KissFlow?")).getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Tailor my CV" }));
    expect(onSubmit).toHaveBeenCalledWith([{ questionId: "q1", value: "No", via: "option", use: "none" }]);
  });

  it("says one thing for one gap", () => {
    show([kissflow]);
    expect(screen.getByRole("heading", { level: 1, name: "The job asks for 1 thing your CV doesn't show" })).toBeInTheDocument();
  });
});

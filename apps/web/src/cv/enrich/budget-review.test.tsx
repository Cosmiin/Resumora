import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type BudgetItem, type CvContent, type Experience } from "@resumora/shared";

vi.mock("./enrich-api.ts", () => ({ createVoiceSession: vi.fn() }));

import { BudgetStep } from "./BudgetStep.tsx";
import { ReviewSheet } from "./ReviewSheet.tsx";
import type { Change } from "./prepare.ts";

const role = (id: string, over: Partial<Experience> = {}): Experience => ({
  id, company: "Acme", title: `Role ${id}`, location: "", startDate: "2019-03", endDate: "2021-06", current: false,
  description: "", bullets: [], notes: [], ...over,
});
const cv: CvContent = { ...emptyCv("en"), experience: [
  role("a", { title: "Staffing Manager", company: "Robert Half", bullets: [{ id: "b1", text: "Built a candidate pipeline." }] }),
  role("b", { title: "Clerk", company: "Elias Metal" }),
] };
const items: BudgetItem[] = [
  { roleId: "a", kind: "role", question: { id: "rq1", text: "Did anyone report to you in this role?", options: ["No", "1–5 people", "6–20"], kind: "role", topic: "leadership" } },
  { roleId: "a", kind: "line", question: { bulletId: "b1", text: "What changed because of this pipeline?", options: [], kind: "result" } },
  { roleId: "b", kind: "role", question: { id: "rq2", text: "What was the role for?", options: [], kind: "role", topic: "purpose" } },
];

describe("BudgetStep", () => {
  it("shows the role on top of every question, and the line when it is about one", async () => {
    render(<BudgetStep cv={cv} items={items} onAnswer={vi.fn()} onTalk={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByText(/Step 4 of 4 · Question 1 of 3/)).toBeInTheDocument();
    expect(screen.getByTestId("ep-rolecard")).toHaveTextContent(/Staffing Manager · Robert Half · Mar 2019 – Jun 2021/);
    expect(screen.queryByText(/“Built a candidate pipeline\.”/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText(/“Built a candidate pipeline\.”/)).toBeInTheDocument();
    expect(screen.getByTestId("ep-rolecard")).toHaveTextContent("Staffing Manager");
  });

  it("an answer is handed back with its item; Skip moves on without one; the last one finishes", async () => {
    const onAnswer = vi.fn();
    const onDone = vi.fn();
    render(<BudgetStep cv={cv} items={items} onAnswer={onAnswer} onTalk={vi.fn()} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "1–5 people" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onAnswer).toHaveBeenCalledWith(items[0], "1–5 people", ["pick"]);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("ep-rolecard")).toHaveTextContent("Clerk");
    await userEvent.type(screen.getByLabelText("Your answer"), "Kept stock records");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Rather just talk? takes the role's answer in one box and skips the rest of that role", async () => {
    const onTalk = vi.fn();
    render(<BudgetStep cv={cv} items={items} onAnswer={vi.fn()} onTalk={onTalk} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Rather just talk?" }));
    await userEvent.type(screen.getByRole("textbox"), "I ran the Toronto desk with two recruiters.");
    await userEvent.click(screen.getByRole("button", { name: /Continue|Next|Send/ }));
    expect(onTalk).toHaveBeenCalledWith("a", "I ran the Toronto desk with two recruiters.", ["type"]);
    expect(screen.getByTestId("ep-rolecard")).toHaveTextContent("Clerk");
  });
});

describe("ReviewSheet", () => {
  const changes: Change[] = [
    { id: "description", kind: "description", before: "", after: "Robert Half is a staffing firm. Ran the Toronto desk." },
    { id: "bullet:b1", kind: "bullet", bulletId: "b1", before: "Built a candidate pipeline.", after: "Built a pipeline of 40 candidates a week." },
  ];
  const groups = [
    { roleId: "a", changes, tidied: new Set<string>() },
    { roleId: "b", changes: [{ id: "bullet:x", kind: "bullet" as const, bulletId: "x", before: "Helped.", after: "Helped the stock team." }], tidied: new Set(["bullet:x"]) },
  ];

  it("starts with every role collapsed and says how many changes each has", () => {
    render(<ReviewSheet cv={cv} groups={groups} busy={false} onApply={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Staffing Manager · Robert Half: 2 changes" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Clerk · Elias Metal: 1 change" })).toBeInTheDocument();
    expect(screen.queryByText("Built a pipeline of 40 candidates a week.")).toBeNull();
  });

  it("Keep mine leaves that change out of Apply all", async () => {
    const onApply = vi.fn();
    render(<ReviewSheet cv={cv} groups={groups} busy={false} onApply={onApply} />);
    await userEvent.click(screen.getByRole("button", { name: "Staffing Manager · Robert Half: 2 changes" }));
    expect(screen.getByText("Built a pipeline of 40 candidates a week.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Keep mine" })[1]!);
    await userEvent.click(screen.getByRole("button", { name: "Apply all" }));
    expect(onApply).toHaveBeenCalledWith([
      { roleId: "a", id: "description", text: "Robert Half is a staffing firm. Ran the Toronto desk." },
      { roleId: "b", id: "bullet:x", text: "Helped the stock team." },
    ]);
  });

  it("marks a line rewritten with no new facts", async () => {
    render(<ReviewSheet cv={cv} groups={groups} busy={false} onApply={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Clerk · Elias Metal: 1 change" }));
    expect(screen.getByText("Tidied, no new facts")).toBeInTheDocument();
  });

  it("with nothing to change says so and lets the person go on", async () => {
    const onApply = vi.fn();
    render(<ReviewSheet cv={cv} groups={[]} busy={false} onApply={onApply} />);
    expect(screen.getByText("Nothing to change.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onApply).toHaveBeenCalledWith([]);
  });
});

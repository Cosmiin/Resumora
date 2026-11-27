import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type BudgetItem, type CvContent, type Experience } from "@resumora/shared";

vi.mock("./enrich-api.ts", () => ({ createVoiceSession: vi.fn() }));

import { BudgetStep } from "./BudgetStep.tsx";

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
    expect(screen.getByText(/Step 4 of 4 · Role 1 of 2/)).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
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

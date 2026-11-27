import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type BudgetItem, type CvContent, type Experience } from "@resumora/shared";

const api = vi.hoisted(() => ({ createVoiceSession: vi.fn(), reportFailure: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { BudgetStep } from "./BudgetStep.tsx";

const role = (id: string, title: string, company: string): Experience => ({
  id, title, company, location: "", startDate: "2020-01", endDate: "2021-01", current: false, description: "",
  bullets: [{ id: `${id}b1`, text: `Ran the ${title} reports.` }, { id: `${id}b2`, text: `Led the ${title} launch.` }], notes: [],
});
const cv: CvContent = { ...emptyCv("en"), experience: [role("r1", "Analyst", "Acme"), role("r2", "Planner", "Beta")] };
const lineQ = (roleId: string, n: 1 | 2, text: string): BudgetItem => ({ roleId, kind: "line", question: { bulletId: `${roleId}b${n}`, text, options: [], kind: "detail" } });
const items: BudgetItem[] = [
  lineQ("r1", 1, "How many reports a week?"),
  lineQ("r1", 2, "What did the launch change?"),
  lineQ("r2", 1, "Who read the reports?"),
];

describe("BudgetStep", () => {
  const onAnswer = vi.fn();
  const onTalk = vi.fn();
  const onDone = vi.fn();
  const onRoleDone = vi.fn();
  beforeEach(() => vi.resetAllMocks());

  const open = () => render(<BudgetStep cv={cv} items={items} onAnswer={onAnswer} onTalk={onTalk} onRoleDone={onRoleDone} onDone={onDone} />);
  const answer = async (text: string, button: string) => {
    await userEvent.type(screen.getByRole("textbox"), text);
    await userEvent.click(screen.getByRole("button", { name: button }));
  };
  const passed = () => within(screen.getByRole("list", { name: "Answered so far in this role" })).getAllByRole("listitem");

  it("keeps the role on screen and shows one question at a time: an answered one folds into a line above the next", async () => {
    open();
    expect(screen.getByText("Step 4 of 4 · Role 1 of 2")).toBeInTheDocument();
    expect(screen.getByTestId("ep-rolecard")).toHaveTextContent("Analyst · Acme");
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How many reports a week?" })).toBeInTheDocument();
    expect(screen.queryByText("What did the launch change?")).toBeNull();
    expect(screen.queryByRole("list", { name: "Answered so far in this role" })).toBeNull();
    await answer("Five", "Next");
    expect(onAnswer).toHaveBeenCalledWith(items[0], "Five", ["type"]);
    // The same role, its second question open, the first folded with its answer.
    expect(screen.getByTestId("ep-rolecard")).toHaveTextContent("Analyst · Acme");
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What did the launch change?" })).toBeInTheDocument();
    expect(passed()).toHaveLength(1);
    expect(passed()[0]).toHaveTextContent("How many reports a week?");
    expect(passed()[0]).toHaveTextContent("Five");
    expect(screen.getByText("“Led the Analyst launch.”", { exact: false })).toBeInTheDocument();
  });

  it("the button names the next role after a role's last question, and the new role starts with nothing folded", async () => {
    open();
    await answer("Five", "Next");
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await answer("Sales doubled", "Next role");
    expect(screen.getByText("Step 4 of 4 · Role 2 of 2")).toBeInTheDocument();
    expect(screen.getByTestId("ep-rolecard")).toHaveTextContent("Planner · Beta");
    expect(screen.queryByRole("list", { name: "Answered so far in this role" })).toBeNull();
    // A role with one question does not count it.
    expect(screen.queryByText(/^Question \d of \d$/)).toBeNull();
    await answer("The board", "Continue");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledTimes(3);
  });

  it("says when the person leaves a role, and Back does not go into a role already left", async () => {
    open();
    await answer("Five", "Next");
    expect(onRoleDone).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    await answer("Sales doubled", "Next role");
    expect(onRoleDone).toHaveBeenCalledTimes(1);
    expect(onRoleDone).toHaveBeenCalledWith("r1");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    // The last role is not "left": the end of the questions covers it.
    await answer("The board", "Continue");
    expect(onRoleDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a skipped question folds as skipped and saves nothing", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(passed()[0]).toHaveTextContent("How many reports a week?");
    expect(passed()[0]).toHaveTextContent("Skipped");
  });

  it("Back opens the question before with its answer, and unfolds it", async () => {
    open();
    await answer("Five", "Next");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "How many reports a week?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Five");
    expect(screen.queryByRole("list", { name: "Answered so far in this role" })).toBeNull();
  });

  it("Rather just talk takes one answer for the role and goes to the next role", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "Rather just talk?" }));
    await userEvent.type(screen.getByRole("textbox"), "I ran five reports a week and led the launch");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onTalk).toHaveBeenCalledWith("r1", "I ran five reports a week and led the launch", ["type"]);
    expect(screen.getByTestId("ep-rolecard")).toHaveTextContent("Planner · Beta");
  });
});

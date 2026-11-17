import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience, type Note } from "@resumora/shared";

const api = vi.hoisted(() => ({ suggestCompanies: vi.fn(), suggestTools: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { CompaniesStep } from "./CompaniesStep.tsx";
import { ToolsStep } from "./ToolsStep.tsx";

const role = (id: string, over: Partial<Experience> = {}): Experience => ({
  id, company: "Acme", title: `Role ${id}`, location: "", startDate: "2020-01", endDate: "2021-01", current: false,
  description: "", bullets: [], notes: [], ...over,
});
type Saved = { roleId: string; note: Note }[];

describe("CompaniesStep", () => {
  const cv: CvContent = { ...emptyCv("en"), experience: [
    role("a", { company: "Carbon Global", location: "Remote", title: "HR Manager" }),
    role("b", { company: "carbon global SRL", title: "Recruiter" }),
    role("c", { company: "Robert Half", location: "Toronto" }),
    role("d", { company: "Elias Metal" }),
    role("e", { company: "  " }),
  ] };

  beforeEach(() => {
    vi.resetAllMocks();
    api.suggestCompanies.mockResolvedValue({ companies: [
      { key: "carbon global", proposal: null },
      { key: "robert half", proposal: "Staffing and recruitment firm." },
      { key: "elias metal", proposal: null },
    ] });
  });

  it("shows one row per company and saves the answer on every role there", async () => {
    const onDone = vi.fn();
    render(<CompaniesStep cv={cv} onDone={onDone} />);
    const rows = await screen.findAllByRole("group");
    expect(rows.map((r) => within(r).getByRole("heading").textContent)).toEqual(["Carbon Global · Remote", "Robert Half · Toronto", "Elias Metal"]);
    await userEvent.type(within(rows[0]!).getByRole("textbox"), "Carbon accounting software");
    await userEvent.click(screen.getByRole("button", { name: "Confirm all and continue" }));
    const saved: Saved = onDone.mock.calls[0]![0];
    const carbon = saved.filter((s) => s.note.answer === "Carbon accounting software");
    expect(carbon.map((s) => s.roleId)).toEqual(["a", "b"]);
    expect(carbon[0]!.note).toMatchObject({ question: "What does Carbon Global do?", via: ["type"] });
    // Left empty: nothing saved for Elias Metal.
    expect(saved.some((s) => s.roleId === "d")).toBe(false);
  });

  it("saves an accepted proposal as picked, and an edited one as typed", async () => {
    const onDone = vi.fn();
    render(<CompaniesStep cv={cv} onDone={onDone} />);
    const robert = (await screen.findAllByRole("group"))[1]!;
    expect(within(robert).getByText("Staffing and recruitment firm.")).toBeInTheDocument();
    await userEvent.click(within(robert).getByRole("button", { name: "Edit" }));
    const box = within(robert).getByRole("textbox");
    expect(box).toHaveValue("Staffing and recruitment firm.");
    await userEvent.type(box, " In Canada.");
    await userEvent.click(screen.getByRole("button", { name: "Confirm all and continue" }));
    expect((onDone.mock.calls[0]![0] as Saved).find((s) => s.roleId === "c")!.note).toMatchObject({ answer: "Staffing and recruitment firm. In Canada.", via: ["type"] });
  });

  it("an untouched proposal counts as confirmed", async () => {
    const onDone = vi.fn();
    render(<CompaniesStep cv={cv} onDone={onDone} />);
    await screen.findAllByRole("group");
    await userEvent.click(screen.getByRole("button", { name: "Confirm all and continue" }));
    expect((onDone.mock.calls[0]![0] as Saved).find((s) => s.roleId === "c")!.note).toMatchObject({ answer: "Staffing and recruitment firm.", via: ["pick"] });
  });

  it("a company already answered shows its answer and asks nothing", async () => {
    const answered = { ...cv, experience: [role("a", { company: "Robert Half", notes: [
      { id: "n1", question: "What does Robert Half do?", answer: "Recruitment", via: ["type"], askedAt: "2026-11-17T00:00:00Z" },
    ] })] };
    const onDone = vi.fn();
    render(<CompaniesStep cv={answered} onDone={onDone} />);
    const row = (await screen.findAllByRole("group"))[0]!;
    expect(within(row).getByText("Recruitment")).toBeInTheDocument();
    expect(within(row).queryByRole("textbox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Confirm all and continue" }));
    expect(onDone).toHaveBeenCalledWith([]);
  });

  it("shows … on each company while the AI looks, and no Continue yet", async () => {
    api.suggestCompanies.mockReturnValue(new Promise(() => {}));
    render(<CompaniesStep cv={cv} onDone={vi.fn()} />);
    expect(screen.getAllByText("…")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Confirm all and continue" })).toBeDisabled();
  });

  it("still works when the AI is unavailable: every company gets an empty field", async () => {
    api.suggestCompanies.mockRejectedValue(new Error("down"));
    render(<CompaniesStep cv={cv} onDone={vi.fn()} />);
    const rows = await screen.findAllByRole("group");
    expect(await within(rows[1]!).findByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Confirm all and continue" })).toBeEnabled();
  });
});

describe("ToolsStep", () => {
  const cv: CvContent = { ...emptyCv("en"), experience: [
    role("a", { title: "Analyst", bullets: [{ id: "b1", text: "Built reports in Excel." }] }),
    role("b", { title: "Planner" }),
    role("c", { title: "Clerk" }),
  ] };

  beforeEach(() => {
    vi.resetAllMocks();
    api.suggestTools.mockResolvedValue({ roles: [
      { roleId: "a", tools: ["Excel", "SAP"] },
      { roleId: "b", tools: ["SAP"] },
      { roleId: "c", tools: [] },
    ] });
  });

  const cell = (roleTitle: string, tool: string) => screen.queryByRole("checkbox", { name: `${tool} in ${roleTitle}` });

  it("ticks a tool the role already names, and saves only the rows that changed", async () => {
    const onDone = vi.fn();
    render(<ToolsStep cv={cv} onDone={onDone} />);
    expect(await screen.findByRole("checkbox", { name: "Excel in Analyst" })).toBeChecked();
    expect(cell("Analyst", "SAP")).not.toBeChecked();
    await userEvent.click(cell("Planner", "SAP")!);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    const saved: Saved = onDone.mock.calls[0]![0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ roleId: "b", note: { question: "Which tools did you use?", answer: "SAP", via: ["pick"] } });
  });

  it("unticking a tool the role names saves the rest", async () => {
    const onDone = vi.fn();
    render(<ToolsStep cv={cv} onDone={onDone} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "SAP in Analyst" }));
    await userEvent.click(cell("Analyst", "Excel")!);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((onDone.mock.calls[0]![0] as Saved)[0]).toMatchObject({ roleId: "a", note: { answer: "SAP" } });
  });

  it("a tool added on one row is offered on the rows just before and after it", async () => {
    render(<ToolsStep cv={cv} onDone={vi.fn()} />);
    await screen.findByRole("checkbox", { name: "Excel in Analyst" });
    expect(cell("Clerk", "Excel")).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: "Add a tool for Planner" }), "Jira{Enter}");
    expect(cell("Planner", "Jira")).toBeChecked();
    expect(cell("Analyst", "Jira")).not.toBeChecked();
    expect(cell("Clerk", "Jira")).not.toBeChecked();
  });

  it("a tool the role names gets a column past the first eight, and stays in the saved answer", async () => {
    const many = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];
    api.suggestTools.mockResolvedValue({ roles: [
      { roleId: "a", tools: many }, { roleId: "b", tools: many }, { roleId: "c", tools: ["Excel"] },
    ] });
    const named: CvContent = { ...cv, experience: [cv.experience[0]!, cv.experience[1]!, role("c", { title: "Clerk", bullets: [{ id: "x", text: "Kept stock in Excel." }] })] };
    const onDone = vi.fn();
    render(<ToolsStep cv={named} onDone={onDone} />);
    expect(await screen.findByRole("checkbox", { name: "Excel in Clerk" })).toBeChecked();
    // Analyst's own line names Excel too, though no suggestion for it does.
    expect(cell("Analyst", "Excel")).toBeChecked();
    await userEvent.type(screen.getByRole("textbox", { name: "Add a tool for Clerk" }), "SAP{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((onDone.mock.calls[0]![0] as Saved).find((s) => s.roleId === "c")!.note.answer).toBe("Excel, SAP");
  });

  it("a tool added on a row keeps its box there when unticked", async () => {
    render(<ToolsStep cv={cv} onDone={vi.fn()} />);
    await screen.findByRole("checkbox", { name: "Excel in Analyst" });
    await userEvent.type(screen.getByRole("textbox", { name: "Add a tool for Clerk" }), "Jira{Enter}");
    await userEvent.click(cell("Clerk", "Jira")!);
    expect(cell("Clerk", "Jira")).not.toBeChecked();
  });

  it("still works when the AI is unavailable: the tools the CV names are shown", async () => {
    api.suggestTools.mockRejectedValue(new Error("down"));
    const onDone = vi.fn();
    render(<ToolsStep cv={cv} onDone={onDone} />);
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(onDone).toHaveBeenCalledWith([]);
  });
});

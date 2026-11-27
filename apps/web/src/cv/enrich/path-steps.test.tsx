import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

  const next = () => screen.getByRole("button", { name: "Continue" });

  it("asks only about the companies the AI does not know, and saves the answer on every role there", async () => {
    const onDone = vi.fn();
    render(<CompaniesStep cv={cv} onDone={onDone} />);
    const rows = await screen.findAllByRole("group");
    expect(rows.map((r) => within(r).getByRole("heading").textContent)).toEqual(["Carbon Global · Remote", "Elias Metal"]);
    await userEvent.type(within(rows[0]!).getByRole("textbox"), "Carbon accounting software");
    await userEvent.click(next());
    const saved: Saved = onDone.mock.calls[0]![0];
    const carbon = saved.filter((s) => s.note.answer === "Carbon accounting software");
    expect(carbon.map((s) => s.roleId)).toEqual(["a", "b"]);
    expect(carbon[0]!.note).toMatchObject({ question: "What does Carbon Global do?", via: ["type"] });
    // Left empty: nothing saved for Elias Metal.
    expect(saved.some((s) => s.roleId === "d")).toBe(false);
  });

  it("asks nothing about a self-employed or freelance role, and saves nothing for it", async () => {
    const own: CvContent = { ...cv, experience: [...cv.experience, role("s", { company: "Self-Employed", location: "Remote" }), role("f", { company: "Freelancing" })] };
    const onDone = vi.fn();
    render(<CompaniesStep cv={own} onDone={onDone} />);
    const rows = await screen.findAllByRole("group");
    expect(rows.map((r) => within(r).getByRole("heading").textContent)).toEqual(["Carbon Global · Remote", "Elias Metal"]);
    await userEvent.click(next());
    expect((onDone.mock.calls[0]![0] as Saved).some((s) => s.roleId === "s" || s.roleId === "f")).toBe(false);
  });

  it("asks nothing about a name the AI says is the person working for themselves", async () => {
    const own: CvContent = { ...cv, experience: [...cv.experience, role("i", { company: "Independent Shopify Projects" })] };
    api.suggestCompanies.mockResolvedValue({ companies: [
      { key: "carbon global", proposal: null },
      { key: "robert half", proposal: "Staffing and recruitment firm." },
      { key: "elias metal", proposal: null },
      { key: "independent shopify projects", proposal: null, selfEmployed: true },
    ] });
    const onDone = vi.fn();
    render(<CompaniesStep cv={own} onDone={onDone} />);
    const rows = await screen.findAllByRole("group");
    expect(rows.map((r) => within(r).getByRole("heading").textContent)).toEqual(["Carbon Global · Remote", "Elias Metal"]);
    await userEvent.click(next());
    expect((onDone.mock.calls[0]![0] as Saved).some((s) => s.roleId === "i")).toBe(false);
  });

  it("moves on by itself when the only name left to ask about is the person's own work", async () => {
    const own: CvContent = { ...emptyCv("en"), experience: [role("c", { company: "Robert Half" }), role("i", { company: "Independent Shopify Projects" }), role("s", { company: "Self-employed" })] };
    api.suggestCompanies.mockResolvedValue({ companies: [
      { key: "robert half", proposal: "Staffing and recruitment firm." },
      { key: "independent shopify projects", proposal: null, selfEmployed: true },
    ] });
    const onDone = vi.fn();
    render(<CompaniesStep cv={own} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect((onDone.mock.calls[0]![0] as Saved).map((s) => s.roleId)).toEqual(["c"]);
  });

  it("fills in a company the AI knows without asking, says so, and saves it as picked", async () => {
    const onDone = vi.fn();
    render(<CompaniesStep cv={cv} onDone={onDone} />);
    await screen.findAllByRole("group");
    expect(screen.queryByText(/Robert Half/)).toBeNull();
    expect(screen.queryByText("Staffing and recruitment firm.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByText("We recognised 1 company and filled in what it does.")).toBeInTheDocument();
    await userEvent.click(next());
    expect((onDone.mock.calls[0]![0] as Saved).find((s) => s.roleId === "c")!.note).toMatchObject({ question: "What does Robert Half do?", answer: "Staffing and recruitment firm.", via: ["pick"] });
  });

  it("moves on by itself when the AI knows every company", async () => {
    api.suggestCompanies.mockResolvedValue({ companies: [
      { key: "carbon global", proposal: "Carbon accounting software." },
      { key: "robert half", proposal: "Staffing and recruitment firm." },
      { key: "elias metal", proposal: "Custom metal parts." },
    ] });
    const onDone = vi.fn();
    render(<CompaniesStep cv={cv} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const saved: Saved = onDone.mock.calls[0]![0];
    expect(saved.map((s) => [s.roleId, s.note.answer, s.note.via[0]])).toEqual([
      ["a", "Carbon accounting software.", "pick"], ["b", "Carbon accounting software.", "pick"],
      ["c", "Staffing and recruitment firm.", "pick"], ["d", "Custom metal parts.", "pick"],
    ]);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("Continue saves once, even when clicked twice", async () => {
    const onDone = vi.fn();
    render(<CompaniesStep cv={cv} onDone={onDone} />);
    await screen.findAllByRole("group");
    const button = next();
    await userEvent.click(button);
    await userEvent.click(button);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a company already answered is not asked again: with nothing else to ask, the step moves on and saves nothing", async () => {
    const answered = { ...cv, experience: [role("a", { company: "Robert Half", notes: [
      { id: "n1", question: "What does Robert Half do?", answer: "Recruitment", via: ["type"], askedAt: "2026-11-17T00:00:00Z" },
    ] })] };
    const onDone = vi.fn();
    render(<CompaniesStep cv={answered} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith([]));
    expect(api.suggestCompanies).not.toHaveBeenCalled();
  });

  it("shows that it is looking while the AI looks: no company, and no Continue yet", async () => {
    api.suggestCompanies.mockReturnValue(new Promise(() => {}));
    render(<CompaniesStep cv={cv} onDone={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Looking up your companies…");
    expect(screen.queryByRole("group")).toBeNull();
    expect(next()).toBeDisabled();
  });

  it("still works when the AI is unavailable: every company gets an empty field", async () => {
    api.suggestCompanies.mockRejectedValue(new Error("down"));
    render(<CompaniesStep cv={cv} onDone={vi.fn()} />);
    const rows = await screen.findAllByRole("group");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByRole("textbox")).toHaveValue("");
    expect(next()).toBeEnabled();
  });

  it("uses the answer prepared while the import was on screen, and asks again only if that failed", async () => {
    const prepared = Promise.resolve({ companies: [{ key: "carbon global", proposal: "Carbon accounting software." }, { key: "robert half", proposal: null }, { key: "elias metal", proposal: null }] });
    const { unmount } = render(<CompaniesStep cv={cv} prepared={prepared} onDone={vi.fn()} />);
    const rows = await screen.findAllByRole("group");
    expect(rows.map((r) => within(r).getByRole("heading").textContent)).toEqual(["Robert Half · Toronto", "Elias Metal"]);
    expect(api.suggestCompanies).not.toHaveBeenCalled();
    unmount();
    const failed = Promise.reject(new Error("used in the meantime"));
    failed.catch(() => undefined);
    render(<CompaniesStep cv={cv} prepared={failed} onDone={vi.fn()} />);
    expect((await screen.findAllByRole("group")).map((r) => within(r).getByRole("heading").textContent)).toEqual(["Carbon Global · Remote", "Elias Metal"]);
    expect(api.suggestCompanies).toHaveBeenCalledTimes(1);
  });
});

describe("ToolsStep", () => {
  const cv: CvContent = { ...emptyCv("en"), experience: [
    role("a", { title: "Analyst", bullets: [{ id: "b1", text: "Built reports in Excel." }] }),
    role("b", { title: "Planner", bullets: [{ id: "b2", text: "Planned the weekly routes." }] }),
    role("c", { title: "Clerk", bullets: [{ id: "b3", text: "Filed the invoices." }] }),
    role("d", { title: "Volunteer" }),
  ] };

  beforeEach(() => {
    vi.resetAllMocks();
    api.suggestTools.mockResolvedValue({ roles: [
      { roleId: "a", tools: ["Excel", "SAP"] },
      { roleId: "b", tools: ["SAP"] },
      { roleId: "c", tools: [] },
      { roleId: "d", tools: ["Canva"] },
    ] });
  });

  /** A role's card on the one screen. */
  const card = (title: string) => within(screen.getByRole("group", { name: title }));
  const tool = (title: string, name: string) => card(title).queryByRole("button", { name });
  const ticked = (title: string, name: string) => expect(tool(title, name)).toHaveAttribute("aria-pressed", "true");
  const unticked = (title: string, name: string) => expect(tool(title, name)).toHaveAttribute("aria-pressed", "false");
  const press = (title: string, name: string) => userEvent.click(card(title).getByRole("button", { name }));
  const add = async (title: string, name: string) => {
    await press(title, "Add a tool");
    await userEvent.type(card(title).getByRole("textbox", { name: "Tool name" }), `${name}{Enter}`);
  };
  const done = () => userEvent.click(screen.getByRole("button", { name: "Continue" }));
  /** The screen, once the suggestions are in. */
  const open = async (content = cv, onDone = vi.fn()) => {
    render(<ToolsStep cv={content} onDone={onDone} />);
    await screen.findAllByRole("button", { name: "Excel" });
    return onDone;
  };

  it("shows every role with a line on one screen, ticks a tool the role already names, and saves only the roles that changed", async () => {
    const onDone = await open();
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-labelledby"))).toHaveLength(3);
    ticked("Analyst", "Excel");
    unticked("Analyst", "SAP");
    unticked("Planner", "SAP");
    await press("Planner", "SAP");
    await done();
    const saved: Saved = onDone.mock.calls[0]![0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ roleId: "b", note: { question: "Which tools did you use?", answer: "SAP", via: ["pick"], topic: "tools" } });
  });

  it("a role with no written line is not shown and gets no note", async () => {
    const onDone = await open();
    expect(screen.queryByRole("group", { name: "Volunteer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Canva" })).toBeNull();
    await done();
    expect(onDone).toHaveBeenCalledWith([]);
  });

  it("unticking a tool the role names saves the rest", async () => {
    const onDone = await open();
    await press("Analyst", "SAP");
    await press("Analyst", "Excel");
    await done();
    const saved: Saved = onDone.mock.calls[0]![0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ roleId: "a", note: { answer: "SAP" } });
  });

  it("a tool ticked on one role is offered on the roles just before and after it, not further", async () => {
    await open();
    // Excel is ticked on Analyst only: offered on Planner, the next card, and not on Clerk, two cards away.
    unticked("Planner", "Excel");
    expect(tool("Clerk", "Excel")).toBeNull();
    await add("Planner", "Jira");
    ticked("Planner", "Jira");
    unticked("Analyst", "Jira");
    unticked("Clerk", "Jira");
  });

  it("a tool the role names is offered past the first eight suggestions, and stays in the saved answer", async () => {
    const many = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];
    api.suggestTools.mockResolvedValue({ roles: [
      { roleId: "a", tools: many }, { roleId: "b", tools: many }, { roleId: "c", tools: ["Excel"] },
    ] });
    const named: CvContent = { ...cv, experience: [cv.experience[0]!, cv.experience[1]!, role("c", { title: "Clerk", bullets: [{ id: "x", text: "Kept stock in Excel." }] })] };
    // Analyst's own line names Excel, though no suggestion for Analyst does.
    const onDone = await open(named);
    ticked("Analyst", "Excel");
    ticked("Clerk", "Excel");
    await press("Clerk", "Add a tool");
    await userEvent.type(card("Clerk").getByRole("textbox", { name: "Tool name" }), "SAP");
    await press("Clerk", "Add");
    ticked("Clerk", "SAP");
    await done();
    expect((onDone.mock.calls[0]![0] as Saved).find((s) => s.roleId === "c")!.note.answer).toBe("Excel, SAP");
  });

  it("a tool added on a role stays offered there when unticked, and the field is ready for another", async () => {
    await open();
    await add("Clerk", "Jira");
    expect(card("Clerk").getByRole("textbox", { name: "Tool name" })).toHaveValue("");
    await press("Clerk", "Jira");
    unticked("Clerk", "Jira");
  });

  it("Continue saves once, even when clicked twice", async () => {
    const onDone = await open();
    const button = screen.getByRole("button", { name: "Continue" });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("waits for the suggestions before the tools can be answered", async () => {
    api.suggestTools.mockReturnValue(new Promise(() => {}));
    render(<ToolsStep cv={cv} onDone={vi.fn()} />);
    expect(screen.getByText("Finding the usual tools for your roles…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("uses the tools prepared while the import was on screen, and asks again only if that failed", async () => {
    const prepared = Promise.resolve({ roles: [{ roleId: "a", tools: ["Tableau"] }, { roleId: "b", tools: [] }, { roleId: "c", tools: [] }] });
    const { unmount } = render(<ToolsStep cv={cv} prepared={prepared} onDone={vi.fn()} />);
    await screen.findByRole("button", { name: "Tableau" });
    expect(api.suggestTools).not.toHaveBeenCalled();
    unmount();
    const failed = Promise.reject(new Error("used in the meantime"));
    failed.catch(() => undefined);
    render(<ToolsStep cv={cv} prepared={failed} onDone={vi.fn()} />);
    await screen.findAllByRole("button", { name: "Excel" });
    expect(api.suggestTools).toHaveBeenCalledTimes(1);
  });

  it("still works when the AI is unavailable", async () => {
    api.suggestTools.mockRejectedValue(new Error("down"));
    const onDone = vi.fn();
    render(<ToolsStep cv={cv} onDone={onDone} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    await done();
    expect(onDone).toHaveBeenCalledWith([]);
  });
});

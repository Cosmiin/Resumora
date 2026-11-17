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

  it("fills in a company the AI knows without asking, says so, and saves it as picked", async () => {
    const onDone = vi.fn();
    render(<CompaniesStep cv={cv} onDone={onDone} />);
    await screen.findAllByRole("group");
    expect(screen.queryByText(/Robert Half/)).toBeNull();
    expect(screen.queryByText("Staffing and recruitment firm.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByText("We recognised 1 company and filled in what it does. You will see it in the review at the end.")).toBeInTheDocument();
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

  const tool = (name: string) => screen.queryByRole("button", { name });
  const ticked = (name: string) => expect(tool(name)).toHaveAttribute("aria-pressed", "true");
  const unticked = (name: string) => expect(tool(name)).toHaveAttribute("aria-pressed", "false");
  const press = (name: string) => userEvent.click(screen.getByRole("button", { name }));
  const onRole = (title: string) => expect(screen.getByTestId("ep-rolecard")).toHaveTextContent(title);
  const addBox = () => screen.getByRole("textbox", { name: "Add a tool that is missing" });
  /** The first role's screen, once the suggestions are in. */
  const open = async (content = cv, onDone = vi.fn()) => {
    render(<ToolsStep cv={content} onDone={onDone} />);
    await screen.findByRole("button", { name: "Excel" });
    return onDone;
  };

  it("shows one role at a time, ticks a tool the role already names, and saves only the roles that changed", async () => {
    const onDone = await open();
    onRole("Analyst");
    expect(screen.getByText("Step 2 of 4 · Role 1 of 3")).toBeInTheDocument();
    ticked("Excel");
    unticked("SAP");
    expect(tool("Back")).toBeNull();
    await press("Next role");
    onRole("Planner");
    expect(screen.getByText("Step 2 of 4 · Role 2 of 3")).toBeInTheDocument();
    await press("SAP");
    await press("Next role");
    onRole("Clerk");
    expect(tool("Next role")).toBeNull();
    await press("Continue");
    const saved: Saved = onDone.mock.calls[0]![0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ roleId: "b", note: { question: "Which tools did you use?", answer: "SAP", via: ["pick"] } });
  });

  it("unticking a tool the role names saves the rest", async () => {
    const onDone = await open();
    await press("SAP");
    await press("Excel");
    await press("Next role");
    await press("Next role");
    await press("Continue");
    const saved: Saved = onDone.mock.calls[0]![0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ roleId: "a", note: { answer: "SAP" } });
  });

  it("a tool added on one role is offered on the roles just before and after it", async () => {
    await open();
    await press("Next role");
    await press("Next role");
    onRole("Clerk");
    // Excel is ticked on Analyst only, two roles away.
    expect(tool("Excel")).toBeNull();
    await press("Back");
    onRole("Planner");
    await userEvent.type(addBox(), "Jira{Enter}");
    ticked("Jira");
    expect(addBox()).toHaveValue("");
    await press("Back");
    onRole("Analyst");
    unticked("Jira");
    await press("Next role");
    await press("Next role");
    onRole("Clerk");
    unticked("Jira");
  });

  it("a tool the role names is offered past the first eight suggestions, and stays in the saved answer", async () => {
    const many = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];
    api.suggestTools.mockResolvedValue({ roles: [
      { roleId: "a", tools: many }, { roleId: "b", tools: many }, { roleId: "c", tools: ["Excel"] },
    ] });
    const named: CvContent = { ...cv, experience: [cv.experience[0]!, cv.experience[1]!, role("c", { title: "Clerk", bullets: [{ id: "x", text: "Kept stock in Excel." }] })] };
    // Analyst's own line names Excel, though no suggestion for Analyst does.
    const onDone = await open(named);
    ticked("Excel");
    await press("Next role");
    await press("Next role");
    onRole("Clerk");
    ticked("Excel");
    await userEvent.type(addBox(), "SAP");
    await press("Add");
    ticked("SAP");
    await press("Continue");
    expect((onDone.mock.calls[0]![0] as Saved).find((s) => s.roleId === "c")!.note.answer).toBe("Excel, SAP");
  });

  it("a tool added on a role stays offered there when unticked", async () => {
    await open();
    await press("Next role");
    await press("Next role");
    await userEvent.type(addBox(), "Jira{Enter}");
    await press("Jira");
    unticked("Jira");
  });

  it("groups a role's tools under their headings", async () => {
    await open();
    const group = (name: string) => within(screen.getByRole("group", { name }));
    expect(group("Named in your CV").getByRole("button", { name: "Excel" })).toBeInTheDocument();
    expect(group("Often used in this kind of role").getByRole("button", { name: "SAP" })).toBeInTheDocument();
    await press("Next role");
    // Excel is ticked on Analyst, the role before.
    expect(group("From the role before or after").getByRole("button", { name: "Excel" })).toBeInTheDocument();
    await userEvent.type(addBox(), "Jira{Enter}");
    expect(group("Added by you").getByRole("button", { name: "Jira" })).toBeInTheDocument();
  });

  it("Skip saves nothing for the role on screen, also on the last role", async () => {
    const onDone = await open();
    await press("SAP");
    await press("Skip");
    onRole("Planner");
    await press("Back");
    // Analyst is back to what its text names.
    ticked("Excel");
    unticked("SAP");
    await press("Next role");
    await press("SAP");
    await press("Next role");
    onRole("Clerk");
    await userEvent.type(addBox(), "Jira{Enter}");
    await press("Skip");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect((onDone.mock.calls[0]![0] as Saved).map((s) => s.roleId)).toEqual(["b"]);
  });

  it("Back returns to the role before, with its ticks kept", async () => {
    await open();
    await press("SAP");
    await press("Next role");
    await press("SAP");
    await press("Back");
    onRole("Analyst");
    ticked("SAP");
    await press("Next role");
    onRole("Planner");
    ticked("SAP");
  });

  it("Continue saves once, even when clicked twice", async () => {
    const onDone = await open();
    await press("Next role");
    await press("Next role");
    const button = screen.getByRole("button", { name: "Continue" });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("waits for the suggestions before a role can be answered", async () => {
    api.suggestTools.mockReturnValue(new Promise(() => {}));
    render(<ToolsStep cv={cv} onDone={vi.fn()} />);
    expect(screen.getByText("Finding the usual tools for your roles…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next role" })).toBeDisabled();
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
    await screen.findByRole("button", { name: "Excel" });
    expect(api.suggestTools).toHaveBeenCalledTimes(1);
  });

  it("still works when the AI is unavailable", async () => {
    api.suggestTools.mockRejectedValue(new Error("down"));
    const onDone = vi.fn();
    render(<ToolsStep cv={cv} onDone={onDone} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Next role" })).toBeEnabled());
    await press("Next role");
    await press("Next role");
    await press("Continue");
    expect(onDone).toHaveBeenCalledWith([]);
  });
});


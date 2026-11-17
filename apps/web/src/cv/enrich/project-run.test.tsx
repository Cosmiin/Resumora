import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience, type Project } from "@resumora/shared";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";

const api = vi.hoisted(() => ({ projectQuestions: vi.fn(), projectWrite: vi.fn(), createVoiceSession: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { ProjectRun, isProjectTarget } from "./ProjectRun.tsx";
import { FocusOpenProvider } from "./focus-context.ts";
import { RoleItem } from "../edit/sections/RoleItem.tsx";

const role: Experience = {
  id: "r1", company: "Nordlane", title: "Analyst", location: "", startDate: "2022-01", endDate: "", current: true, description: "",
  bullets: [{ id: "rb", text: "Ran the weekly report." }], notes: [],
};
const project: Project = {
  id: "p1", company: "Personal project", title: "Lead intake flow", location: "", startDate: "2025-01", endDate: "2025-06", current: false,
  description: "Old long description.", url: "",
  bullets: ["One", "Two", "Three", "Four", "Five"].map((text, i) => ({ id: `pb${i}`, text })),
  notes: [],
};
const base: CvContent = { ...emptyCv(), experience: [role], projects: [project], technicalSkills: [{ id: "s1", name: "Excel" }] };
const QUESTIONS = [
  { id: "pq1", topic: "tools", text: "Which tools did you use?", options: ["Make", "Airtable", "Zapier"] },
  { id: "pq2", topic: "connections", text: "Did it connect to anything?", options: ["Webhooks", "REST API"] },
  { id: "pq3", topic: "outcome", text: "Is it used?", options: ["1–5 hours saved a week", "Not yet"] },
];

let actions: CvAction[];
let latest: CvContent;
function Harness({ waitForSave = () => Promise.resolve(), onClose = () => {} }: { waitForSave?(): Promise<void>; onClose?(): void }) {
  const [state, apply] = useReducer(cvReducer, base);
  latest = state;
  const dispatch = (a: CvAction) => {
    actions.push(a);
    apply(a);
  };
  return <ProjectRun target={{ roleId: "p1", mode: "improve" }} cv={state} dispatch={dispatch} waitForSave={waitForSave} onClose={onClose} />;
}

beforeEach(() => {
  vi.resetAllMocks();
  actions = [];
  api.projectQuestions.mockResolvedValue({ questions: QUESTIONS });
  api.projectWrite.mockResolvedValue({ description: "", bullets: [], extraTools: [] });
});

const startRun = async () => {
  render(<Harness />);
  await userEvent.click(await screen.findByRole("button", { name: "Start" }));
};

describe("the project run", () => {
  it("opens on the start screen, then shows the first question with its options as picks", async () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: "Lead intake flow" })).toBeInTheDocument();
    expect(screen.getByText(/Personal project/)).toBeInTheDocument();
    expect(await screen.findByText(/Up to 6 short questions/)).toBeInTheDocument();
    expect(api.projectQuestions).toHaveBeenCalledWith("p1");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Question 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Which tools did you use?" })).toBeInTheDocument();
    for (const option of ["Make", "Airtable", "Zapier"]) expect(screen.getByRole("button", { name: option })).toBeInTheDocument();
  });

  it("asks for the questions only once the CV is saved (a project added a moment ago)", async () => {
    let saved!: () => void;
    render(<Harness waitForSave={() => new Promise<void>((res) => (saved = res))} />);
    expect(screen.getByText("Loading your questions…")).toBeInTheDocument();
    expect(api.projectQuestions).not.toHaveBeenCalled();
    saved();
    expect(await screen.findByText(/Up to 6 short questions/)).toBeInTheDocument();
    expect(api.projectQuestions).toHaveBeenCalledWith("p1");
  });

  it("saves two answered questions on the project, nothing for the skipped one, and writes only after the save", async () => {
    let saved!: () => void;
    const waitForSave = vi.fn(() => Promise.resolve());
    render(<Harness waitForSave={waitForSave} />);
    await userEvent.click(await screen.findByRole("button", { name: "Start" }));
    waitForSave.mockClear();
    waitForSave.mockImplementation(() => new Promise<void>((res) => (saved = res)));
    await userEvent.click(screen.getByRole("button", { name: "Make" }));
    await userEvent.click(screen.getByRole("button", { name: "Airtable" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    await userEvent.click(screen.getByRole("button", { name: "Not yet" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const notes = actions.filter((a) => a.type === "setNote");
    expect(notes).toHaveLength(2);
    expect(notes.every((a) => a.type === "setNote" && a.roleId === "p1")).toBe(true);
    expect(latest.projects[0]!.notes.map((n) => [n.question, n.answer])).toEqual([["Which tools did you use?", "Make, Airtable"], ["Is it used?", "Not yet"]]);
    expect(screen.getByText("Writing your project…")).toBeInTheDocument();
    expect(waitForSave).toHaveBeenCalled();
    expect(api.projectWrite).not.toHaveBeenCalled();
    saved();
    await waitFor(() => expect(api.projectWrite).toHaveBeenCalledWith("p1"));
  });

  it("Back shows the earlier question with its answer, and a new answer replaces that note", async () => {
    await startRun();
    await userEvent.click(screen.getByRole("button", { name: "Make" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox")).toHaveValue("Make");
    await userEvent.click(screen.getByRole("button", { name: "Zapier" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(latest.projects[0]!.notes.map((n) => n.answer)).toEqual(["Make, Zapier"]);
  });

  it("approval replaces all five old bullets with the two kept ones and the description, and adds only the kept tool (review focus 2)", async () => {
    api.projectWrite.mockResolvedValue({
      description: "A Make flow that files new bakery leads into Airtable.",
      bullets: ["Built the flow in Make with webhooks.", "Connected the Airtable REST API."],
      extraTools: ["Make", "Zapier"],
    });
    await startRun();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("Built the flow in Make with webhooks.")).toBeInTheDocument();
    expect(screen.getByText("Added to Skills")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Zapier" }));
    await userEvent.click(screen.getByRole("button", { name: "Use these" }));
    const p = latest.projects[0]!;
    expect(p.description).toBe("A Make flow that files new bakery leads into Airtable.");
    expect(p.bullets.map((b) => b.text)).toEqual(["Built the flow in Make with webhooks.", "Connected the Airtable REST API."]);
    expect(latest.technicalSkills.map((s) => s.name)).toEqual(["Excel", "Make"]);
    expect(screen.getByText("Your project is updated.")).toBeInTheDocument();
  });

  it("a piece can be left out or edited right there", async () => {
    api.projectWrite.mockResolvedValue({ description: "A Make flow for bakery leads.", bullets: ["Built the flow in Make.", "Connected Airtable."], extraTools: [] });
    await startRun();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    const keeps = await screen.findAllByRole("button", { name: "Keep" });
    expect(keeps).toHaveLength(3);
    await userEvent.click(keeps[0]!); // the description: left out, the old one stays
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!); // the second bullet
    const box = screen.getByRole("textbox", { name: "Edit this line" });
    await userEvent.clear(box);
    await userEvent.type(box, "Connected Airtable with webhooks.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Use these" }));
    const p = latest.projects[0]!;
    expect(p.description).toBe("Old long description.");
    expect(p.bullets.map((b) => b.text)).toEqual(["Built the flow in Make.", "Connected Airtable with webhooks."]);
  });

  it("an empty answer from the writer says there is nothing to write and changes nothing (review focus 3)", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(await screen.findByRole("button", { name: "Start" }));
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("Nothing new to write from these answers.")).toBeInTheDocument();
    expect(actions).toEqual([]);
    expect(latest).toBe(base);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a failed write offers Try again", async () => {
    api.projectWrite.mockRejectedValueOnce(new Error("down"));
    await startRun();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("Couldn't write this project. Try again in a moment.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Nothing new to write from these answers.")).toBeInTheDocument();
    expect(api.projectWrite).toHaveBeenCalledTimes(2);
  });
});

describe("opening a project", () => {
  it("a project's id opens the project run; a role's does not", () => {
    expect(isProjectTarget(base, { roleId: "p1", mode: "improve" })).toBe(true);
    expect(isProjectTarget(base, { roleId: "r1", mode: "improve" })).toBe(false);
    expect(isProjectTarget(base, { roleId: "p1", bulletId: "pb0", mode: "improve" })).toBe(false);
  });

  it("the project's Improve button on the CV page opens it; a role has none", async () => {
    const open = vi.fn();
    const view = render(<FocusOpenProvider value={open}><RoleItem role={project} list="projects" locale="en" dispatch={() => {}} /></FocusOpenProvider>);
    const button = screen.getByRole("button", { name: "Improve" });
    expect(button).not.toHaveTextContent("✨");
    await userEvent.click(button);
    expect(open).toHaveBeenCalledWith({ roleId: "p1", mode: "improve" });
    view.unmount();
    render(<FocusOpenProvider value={open}><RoleItem role={role} list="experience" locale="en" dispatch={() => {}} /></FocusOpenProvider>);
    expect(screen.queryByRole("button", { name: "Improve" })).toBeNull();
  });
});

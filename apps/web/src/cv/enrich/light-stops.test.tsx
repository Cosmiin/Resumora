import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { emptyCv, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import type { RoleScoreState } from "./useRoleScores.ts";

// Task 7 (E6, 3B): one stop per lighter item with no lines yet: "Tell us about ‹item›", then the picks.

const api = vi.hoisted(() => ({
  suggestAchievements: vi.fn(), getSkillSuggestions: vi.fn(), itemLines: vi.fn(),
  getScores: vi.fn(), scoreRole: vi.fn(), improveBullet: vi.fn(), brainDump: vi.fn(), roleFacts: vi.fn(), roleDescription: vi.fn(), createVoiceSession: vi.fn(),
}));
vi.mock("./enrich-api.ts", () => api);

import { EnrichPath } from "./EnrichPath.tsx";
import { cvReducer } from "../edit/cvReducer.ts";

beforeEach(() => {
  vi.resetAllMocks();
  api.suggestAchievements.mockReturnValue(new Promise(() => {}));
  api.getSkillSuggestions.mockReturnValue(new Promise(() => {}));
});

const role: Experience = {
  id: "r", company: "Acme", title: "Analyst", location: "", startDate: "2020-01", endDate: "", current: true,
  description: "", bullets: [{ id: "r-b", text: "Did things." }], notes: [],
};
const ready = (score: number): RoleScoreState => ({
  state: "ready",
  result: { roleId: "r", policy: "score/4", fingerprint: "x", score, bullets: [], nextStep: null, questions: [], roleQuestions: [], thin: false } satisfies RoleResult,
});
const start: CvContent = {
  ...emptyCv(),
  experience: [role],
  courses: [
    { id: "c1", name: "Excel for analysts", provider: "Udemy", date: "2022-03" },
    { id: "c2", name: "SQL basics", provider: "Coursera", date: "2023-01" },
    { id: "c3", name: "Git", provider: "", date: "", bullets: [{ id: "c3-l", text: "Branching." }] },
  ],
};

let latest: CvContent;
function Host({ cv = start }: { cv?: CvContent }) {
  const [state, dispatch] = useReducer(cvReducer, cv);
  latest = state;
  return (
    <MemoryRouter>
      <EnrichPath cv={state} dispatch={dispatch} scores={new Map([["r", ready(90)]])} waitForSave={() => Promise.resolve()} onClose={() => {}} />
    </MemoryRouter>
  );
}

async function openFirst() {
  render(<Host />);
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("lighter stops in the path (3B)", () => {
  it("visits each course with no lines: the box, then the picks; Add 2 adds exactly 2 lines under that course", async () => {
    api.itemLines.mockResolvedValue({ lines: ["Built pivot tables for sales.", "Made a monthly dashboard.", "Cleaned raw exports."] });
    await openFirst();
    expect(screen.getByText("Courses & training, 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tell us about Excel for analysts" })).toBeInTheDocument();
    expect(screen.getByText("Tell us more. There are no wrong answers.")).toBeInTheDocument();
    expect(screen.getAllByText("Excel for analysts").length).toBeGreaterThan(0);
    await userEvent.type(screen.getByRole("textbox"), "Pivot tables and a dashboard");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(api.itemLines).toHaveBeenCalledWith({ section: "courses", itemId: "c1", text: "Pivot tables and a dashboard" });
    expect(await screen.findByRole("heading", { name: "Pick the ones that are true" })).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Add 0 lines" })).toBeDisabled();
    await userEvent.click(boxes[0]!);
    await userEvent.click(boxes[2]!);
    await userEvent.click(screen.getByRole("button", { name: "Add 2 lines" }));
    expect(latest.courses[0]!.bullets?.map((b) => b.text)).toEqual(["Built pivot tables for sales.", "Cleaned raw exports."]);
    expect(latest.courses[1]!.bullets).toBeUndefined();
    expect(screen.getByText("Courses & training, 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tell us about SQL basics" })).toBeInTheDocument();
  });

  it("Skip moves on without a call, and the last stop goes on to Key achievements", async () => {
    await openFirst();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: "Tell us about SQL basics" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(api.itemLines).not.toHaveBeenCalled();
    expect(screen.getAllByText("Key achievements").length).toBeGreaterThan(0);
  });

  it("an empty answer from the API skips the picks", async () => {
    api.itemLines.mockResolvedValue({ lines: [] });
    await openFirst();
    await userEvent.type(screen.getByRole("textbox"), "Not much to say");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Tell us about SQL basics" })).toBeInTheDocument();
    expect(latest.courses[0]!.bullets).toBeUndefined();
  });

  it("None of these adds nothing, and Back from the picks returns to the box with the answer", async () => {
    api.itemLines.mockResolvedValue({ lines: ["Built pivot tables for sales."] });
    await openFirst();
    await userEvent.type(screen.getByRole("textbox"), "Pivot tables");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Pick the ones that are true" });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox")).toHaveValue("Pivot tables");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "None of these" }));
    expect(latest.courses[0]!.bullets).toBeUndefined();
    expect(screen.getByRole("heading", { name: "Tell us about SQL basics" })).toBeInTheDocument();
  });

  it("a failed call offers Try again and Skip", async () => {
    api.itemLines.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ lines: ["Built pivot tables for sales."] });
    await openFirst();
    await userEvent.type(screen.getByRole("textbox"), "Pivot tables");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Pick the ones that are true" })).toBeInTheDocument();
    expect(api.itemLines).toHaveBeenCalledTimes(2);
  });
});

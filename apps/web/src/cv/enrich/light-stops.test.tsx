import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { emptyCv, type CvContent, type Experience } from "@resumora/shared";

// "Tell us about ‹item›", then the picks, for one course (opened from "Suggest lines" in its section).

const api = vi.hoisted(() => ({
  suggestAchievements: vi.fn(), getSkillSuggestions: vi.fn(), itemLines: vi.fn(),
  getScores: vi.fn(), scoreRole: vi.fn(), improveBullet: vi.fn(), brainDump: vi.fn(), roleFacts: vi.fn(), roleDescription: vi.fn(), createVoiceSession: vi.fn(),
}));
vi.mock("./enrich-api.ts", () => api);

import { LightStop } from "./FocusMode.tsx";
import { cvReducer } from "../edit/cvReducer.ts";

beforeEach(() => {
  vi.resetAllMocks();
  next.mockReset();
  api.suggestAchievements.mockReturnValue(new Promise(() => {}));
  api.getSkillSuggestions.mockReturnValue(new Promise(() => {}));
});

const role: Experience = {
  id: "r", company: "Acme", title: "Analyst", location: "", startDate: "2020-01", endDate: "", current: true,
  description: "", bullets: [{ id: "r-b", text: "Did things." }], notes: [],
};
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
const next = vi.fn();
function Host({ cv = start }: { cv?: CvContent }) {
  const [state, dispatch] = useReducer(cvReducer, cv);
  latest = state;
  return (
    <MemoryRouter>
      <LightStop section="courses" itemId="c1" cv={state} dispatch={dispatch} waitForSave={() => Promise.resolve()} onClose={() => {}} onNext={next} />
    </MemoryRouter>
  );
}

async function openFirst() {
  render(<Host />);
}

describe("Tell us about a course", () => {
  it("the box, then the picks; Add 2 adds exactly 2 lines under that course", async () => {
    api.itemLines.mockResolvedValue({ lines: ["Built pivot tables for sales.", "Made a monthly dashboard.", "Cleaned raw exports."] });
    await openFirst();
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
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("Skip moves on without a call", async () => {
    await openFirst();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(api.itemLines).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("an empty answer from the API skips the picks", async () => {
    api.itemLines.mockResolvedValue({ lines: [] });
    await openFirst();
    await userEvent.type(screen.getByRole("textbox"), "Not much to say");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
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
    expect(next).toHaveBeenCalledTimes(1);
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

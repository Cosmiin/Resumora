import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, fingerprint, type Change, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import type { RoleScoreState } from "./useRoleScores.ts";

const api = vi.hoisted(() => ({ proposeShape: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { ShapeStep } from "./ShapeStep.tsx";

const texts = [
  "Managed Shopify stores for 5-10 client accounts.",
  "Coordinated external developers for 5-10 client accounts.",
  "Implemented new features for 5-10 client accounts via Asana.",
  "Ran discount campaigns.",
  "Managed store operations for 5-10 client accounts in Asana.",
  "Designed visual assets in Canva to increase monthly revenue by 10–20%.",
  "Resolved 30–50 support tickets per week.",
  "Organized the first Shopify Meetup for 50–100 attendees.",
];
const role = (id: string, lines: string[], over: Partial<Experience> = {}): Experience => ({
  id, company: "Vevol Media", title: "Ecommerce Specialist", location: "", startDate: "2023-01", endDate: "", current: true,
  description: "", bullets: lines.map((text, i) => ({ id: `${id}b${i}`, text })), notes: [], ...over,
});
/** Every line graded 70 with no clear result, except `specific` (graded 90, with one). */
function result(r: Experience, specific: number[] = []): RoleResult {
  return {
    roleId: r.id, policy: "score/9", fingerprint: fingerprint(r, "en"), score: 70, nextStep: null, thin: false,
    bullets: r.bullets.map((b, i) => ({
      id: b.id, score: specific.includes(i) ? 90 : 70, contribution: "specific", clarity: "specific", specificity: "specific",
      impact: specific.includes(i) ? "specific" : "missing", issue: specific.includes(i) ? "none" : "impact", tip: null, question: null,
    })),
    questions: [], roleQuestions: [],
  } as RoleResult;
}

const vevol = role("r1", texts);
const merged = "Coordinated external developers via Asana on new features and store operations for 5-10 client accounts.";
const cvOf = (...items: Experience[]): CvContent => ({ ...emptyCv("en"), experience: items });
const ready = (r: Experience, specific: number[] = []): RoleScoreState => ({ state: "ready", result: result(r, specific) });

beforeEach(() => {
  vi.resetAllMocks();
  api.proposeShape.mockResolvedValue({ merges: [{ ids: ["r1b1", "r1b2", "r1b4"], text: merged }] });
});

const renderStep = (cv = cvOf(vevol), scores = new Map([["r1", ready(vevol, [5])]])) => {
  const onDone = vi.fn<(c: { roleId: string; changes: Change[] }[]) => void>();
  render(<ShapeStep cv={cv} scores={scores} onDone={onDone} />);
  return onDone;
};

describe("ShapeStep", () => {
  it("shows a merge with its original lines and the merged text, and the line moved to the top", async () => {
    renderStep();
    expect(screen.getByText("Step 1 of 4 · Shape")).toBeInTheDocument();
    const card = await screen.findByRole("group", { name: "These 3 lines describe the same work" });
    for (const i of [1, 2, 4]) expect(within(card).getByText(texts[i]!)).toBeInTheDocument();
    expect(within(card).getByText(merged)).toBeInTheDocument();
    expect(screen.getByText(texts[5]!)).toBeInTheDocument();
    expect(screen.getByText("Moved to the top:")).toBeInTheDocument();
    expect(api.proposeShape).toHaveBeenCalledWith({ roleId: "r1", fingerprint: fingerprint(vevol, "en") });
  });

  it("Merge all: the merged line replaces the first, the others are removed, the strongest line goes first", async () => {
    const onDone = renderStep();
    await userEvent.click(await screen.findByRole("button", { name: "Merge all and continue" }));
    expect(onDone).toHaveBeenCalledWith([{ roleId: "r1", changes: [
      { id: "merge:r1b1", kind: "bullet", bulletId: "r1b1", text: merged },
      { id: "remove:r1b2", kind: "remove", bulletId: "r1b2" },
      { id: "remove:r1b4", kind: "remove", bulletId: "r1b4" },
      { id: "order", kind: "order", ids: ["r1b5"] },
    ] }]);
  });

  it("Keep separate leaves that merge out", async () => {
    const onDone = renderStep();
    await userEvent.click(await screen.findByRole("button", { name: "Keep separate" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone).toHaveBeenCalledWith([{ roleId: "r1", changes: [{ id: "order", kind: "order", ids: ["r1b5"] }] }]);
  });

  it("Edit changes the merged text that is sent, and refuses more than 440 characters", async () => {
    const onDone = renderStep();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "Merged into one line" });
    await userEvent.clear(box);
    await userEvent.click(box);
    await userEvent.paste("x".repeat(441));
    expect(screen.getByText("At most 440 characters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Merge" })).toBeDisabled();
    await userEvent.clear(box);
    await userEvent.type(box, "Ran stores and features for 5-10 client accounts via Asana.");
    await userEvent.click(screen.getByRole("button", { name: "Merge" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone.mock.calls[0]![0][0]!.changes[0]).toEqual({ id: "merge:r1b1", kind: "bullet", bulletId: "r1b1", text: "Ran stores and features for 5-10 client accounts via Asana." });
  });

  it("Keep order leaves the order change out", async () => {
    const onDone = renderStep();
    await userEvent.click(await screen.findByRole("button", { name: "Keep order" }));
    await userEvent.click(screen.getByRole("button", { name: "Merge all and continue" }));
    expect(onDone.mock.calls[0]![0][0]!.changes.map((c: Change) => c.kind)).toEqual(["bullet", "remove", "remove"]);
  });

  it("asks nothing for a clean role of 6 lines, and finishes with no changes when nothing moves", async () => {
    const short = role("r2", texts.slice(0, 5));
    const onDone = renderStep(cvOf(short), new Map([["r2", ready(short, [0])]]));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith([]));
    expect(api.proposeShape).not.toHaveBeenCalled();
  });

  it("a role whose Shape call fails still gets its strongest line moved", async () => {
    api.proposeShape.mockRejectedValue(new Error("down"));
    const onDone = renderStep();
    expect(await screen.findByText("Moved to the top:")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /describe the same work/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone).toHaveBeenCalledWith([{ roleId: "r1", changes: [{ id: "order", kind: "order", ids: ["r1b5"] }] }]);
  });
});

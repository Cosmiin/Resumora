import { useReducer, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, fingerprint, type BudgetItem, type CvContent, type Experience, type Note, type RoleResult } from "@resumora/shared";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";
import type { RoleScoreState } from "./useRoleScores.ts";
import type { ReviewGroup } from "./ReviewSheet.tsx";

const api = vi.hoisted(() => ({ improveBullet: vi.fn(), brainDump: vi.fn(), roleDescription: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

const note = (question: string, answer: string): Note => ({ id: `n-${question}`, question, answer, via: ["type"], askedAt: "2026-11-17T00:00:00Z" });
// Each step is a stub: these tests are about the path around them.
vi.mock("./CompaniesStep.tsx", () => ({
  CompaniesStep: ({ onDone }: { onDone(n: { roleId: string; note: Note }[]): void }) => (
    <div><p>Companies step</p><button type="button" onClick={() => onDone([{ roleId: "r1", note: note("What does Acme do?", "Makes anvils") }])}>Companies done</button></div>
  ),
}));
vi.mock("./ToolsStep.tsx", () => ({
  ToolsStep: ({ onDone }: { onDone(n: { roleId: string; note: Note }[]): void }) => (
    <div><p>Tools step</p><button type="button" onClick={() => onDone([])}>Tools done</button></div>
  ),
}));
vi.mock("./BudgetStep.tsx", () => ({
  BudgetStep: ({ items, onAnswer, onTalk, onDone }: { items: BudgetItem[]; onAnswer(i: BudgetItem, t: string, v: string[]): void; onTalk(r: string, t: string, v: string[]): void; onDone(): void }) => (
    <div>
      <p>Budget: {items.map((i) => i.question.text).join(" | ")}</p>
      <button type="button" onClick={() => { for (const i of items) onAnswer(i, `Answer to ${i.question.text}`, ["type"]); onDone(); }}>Answer all</button>
      <button type="button" onClick={() => { onAnswer(items[0]!, "First answer", ["type"]); onAnswer(items[0]!, "Corrected answer", ["type"]); }}>Answer twice</button>
      <button type="button" onClick={() => { onTalk("r1", `Talked before ${items[0]!.question.text}`, ["type"]); onDone(); }}>Talk and finish</button>
      <button type="button" onClick={() => {
        const line = items.find((i) => i.kind === "line")!;
        const twin = { ...line, question: { ...line.question, bulletId: `${line.roleId}b2` } } as BudgetItem;
        onAnswer(line, "About line one", ["type"]);
        onAnswer(twin, "About line two", ["type"]);
      }}>Same wording, two lines</button>
    </div>
  ),
}));
vi.mock("./ReviewSheet.tsx", () => ({
  ReviewSheet: ({ groups, onApply }: { groups: ReviewGroup[]; onApply(d: { roleId: string; id: string; text: string }[]): void }) => (
    <div>
      <p>Review: {groups.map((g) => `${g.roleId}:${g.changes.map((c) => `${c.id}${g.tidied.has(c.id) ? "(tidied)" : ""}`).join(",")}`).join(" ")}</p>
      <button type="button" onClick={() => onApply(groups.flatMap((g) => g.changes.map((c) => ({ roleId: g.roleId, id: c.id, text: c.after }))))}>Apply all</button>
    </div>
  ),
}));

import { EnrichPath, averageScore, strengthWeights } from "./EnrichPath.tsx";

const role = (id: string, over: Partial<Experience> = {}): Experience => ({
  id, company: "Acme", title: `Role ${id}`, location: "", startDate: "2020-01", endDate: "", current: false, description: "",
  bullets: [{ id: `${id}b1`, text: "Did reports." }, { id: `${id}b2`, text: "Cut costs by 10% in a year." }], notes: [], ...over,
});
const grade = (id: string, score: number) => ({
  id, score, contribution: "specific" as const, clarity: "specific" as const, specificity: "specific" as const,
  impact: "missing" as const, issue: "impact" as const, tip: null, question: null,
});
function result(r: Experience, score: number, over: Partial<RoleResult> = {}): RoleResult {
  return { roleId: r.id, policy: "score/8", fingerprint: fingerprint(r, "en"), score, nextStep: null, thin: false,
    bullets: [grade(`${r.id}b1`, 60), grade(`${r.id}b2`, 90)],
    questions: [{ bulletId: `${r.id}b1`, text: `What changed in ${r.id}?`, options: [], kind: "result" }],
    roleQuestions: [{ id: "rq1", text: "What does Acme do?", options: [], kind: "role", topic: "company" }, { id: "rq2", text: `Did anyone report to you in ${r.id}?`, options: [], kind: "role", topic: "leadership" }],
    ...over };
}
const r1 = role("r1");
const r2 = role("r2", { company: "Beta" });
const cv: CvContent = { ...emptyCv("en"), experience: [r1, r2] };
const ready = (r: Experience, score: number, over: Partial<RoleResult> = {}): RoleScoreState => ({ state: "ready", result: result(r, score, over) });

function Harness({ initial, onAction, onClose = () => {}, extra }: { initial: Map<string, RoleScoreState>; onAction?(a: CvAction): void; onClose?(): void; extra?: string }) {
  const [state, apply] = useReducer(cvReducer, cv);
  const [scores, setScores] = useState(initial);
  return (
    <>
      <button type="button" onClick={() => setScores(new Map([
        ["r1", ready(state.experience[0]!, 88, extra ? { roleQuestions: [{ id: "rq9", text: extra, options: [], kind: "role", topic: "other" }] } : {})],
        ["r2", ready(state.experience[1]!, 80, { questions: [], roleQuestions: [] })]]))}>Rescore</button>
      <EnrichPath cv={state} scores={scores} waitForSave={() => Promise.resolve()} onClose={onClose}
        dispatch={(a) => { onAction?.(a); apply(a); }} />
    </>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.improveBullet.mockImplementation(({ bulletId }: { bulletId: string }) => Promise.resolve({ proposal: { bulletId, text: `Better ${bulletId}.` }, bulletBefore: 60, bulletAfter: 90, roleBefore: 60, roleAfter: 70, cached: false }));
  api.roleDescription.mockResolvedValue({ text: "Acme makes anvils. Ran reports.", keywords: [] });
  api.brainDump.mockResolvedValue({ proposals: [], roleBefore: null, roleAfterAll: null });
});

describe("the short path", () => {
  // r2 has nothing left to ask: only its weak line is worked on.
  const scores = () => new Map<string, RoleScoreState>([["r1", ready(r1, 60)], ["r2", ready(r2, 70, { questions: [], roleQuestions: [] })]]);

  it("waits for every role's score before it can start", async () => {
    render(<Harness initial={new Map([["r1", ready(r1, 60)], ["r2", { state: "scoring" }]])} />);
    expect(screen.getByText("Checking your roles…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("shows the CV's score at the start, then companies, tools, the questions, the review and the end, in that order", async () => {
    const actions: CvAction[] = [];
    render(<Harness initial={scores()} onAction={(a) => actions.push(a)} />);
    // Weighted: r1 counts 3, r2 counts 2 → (60*3 + 70*2) / 5 = 64.
    expect(screen.getByRole("heading", { name: "Your CV: 64" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Companies step")).toBeInTheDocument();
    expect(screen.queryByText(/Your CV:/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Companies done" }));
    expect(actions[0]).toMatchObject({ type: "setNote", roleId: "r1", note: { question: "What does Acme do?" } });
    await userEvent.click(await screen.findByRole("button", { name: "Tools done" }));
    // The company question is never in the budget; the role's own question and the line question are.
    const budget = await screen.findByText(/^Budget:/);
    expect(budget.textContent).not.toContain("What does Acme do?");
    expect(budget.textContent).toContain("Did anyone report to you in r1?");
    expect(budget.textContent).toContain("What changed in r1?");
    expect(screen.queryByText(/Your CV:/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Answer all" }));
    expect(actions.some((a) => a.type === "setNote" && a.note.question === "What changed in r1?")).toBe(true);
    const review = await screen.findByText(/^Review:/);
    expect(review.textContent).toContain("r1:description,bullet:r1b1");
    // r2 got no answers: its weak line is tidied, with no new facts.
    expect(review.textContent).toContain("r2:bullet:r2b1(tidied)");
    await userEvent.click(screen.getByRole("button", { name: "Apply all" }));
    expect(actions).toContainEqual({ type: "replaceBullet", roleId: "r1", bulletId: "r1b1", text: "Better r1b1." });
    expect(actions).toContainEqual({ type: "setItemField", list: "experience", itemId: "r1", field: "description", value: "Acme makes anvils. Ran reports." });
    await userEvent.click(screen.getByRole("button", { name: "Rescore" }));
    expect(await screen.findByRole("heading", { name: "Your CV: 64 → 85" })).toBeInTheDocument();
  });

  it("8 more questions starts another round without asking a question twice", async () => {
    render(<Harness initial={scores()} extra="Which teams did you work with in r1?" />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Companies done" }));
    await userEvent.click(await screen.findByRole("button", { name: "Tools done" }));
    const first = (await screen.findByText(/^Budget:/)).textContent ?? "";
    await userEvent.click(screen.getByRole("button", { name: "Answer all" }));
    await userEvent.click(await screen.findByRole("button", { name: "Apply all" }));
    await userEvent.click(screen.getByRole("button", { name: "Rescore" }));
    await userEvent.click(await screen.findByRole("button", { name: "1 more question" }));
    const second = (await screen.findByText(/^Budget:/)).textContent ?? "";
    expect(second).toBe("Budget: Which teams did you work with in r1?");
    expect(first).toContain("What changed in r1?");
  });

  it("goes straight from tools to the review when there is nothing to ask", async () => {
    const quiet = new Map<string, RoleScoreState>([["r1", ready(r1, 60, { questions: [], roleQuestions: [] })], ["r2", ready(r2, 70, { questions: [], roleQuestions: [] })]]);
    render(<Harness initial={quiet} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Companies done" }));
    await userEvent.click(await screen.findByRole("button", { name: "Tools done" }));
    const review = await screen.findByText(/^Review:/);
    expect(screen.queryByText(/^Budget:/)).toBeNull();
    // A company answer brings a description, but rewrites only the weak line (60), not the one at 90, and that line
    // may carry the company's facts, so it is not marked tidied.
    expect(review.textContent).toContain("r1:description,bullet:r1b1 ");
    expect(review.textContent).not.toContain("r1b2");
    expect(review.textContent).toContain("r2:bullet:r2b1(tidied)");
    expect(api.improveBullet.mock.calls.map(([b]) => b.bulletId)).toEqual(["r1b1", "r2b1"]);
  });

  it("answering a question again (after Back) replaces its note", async () => {
    const actions: CvAction[] = [];
    render(<Harness initial={scores()} onAction={(a) => actions.push(a)} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Companies done" }));
    await userEvent.click(await screen.findByRole("button", { name: "Tools done" }));
    await userEvent.click(await screen.findByRole("button", { name: "Answer twice" }));
    const notes = actions.flatMap((a) => (a.type === "setNote" && a.note.answer.endsWith("answer") ? [a.note] : []));
    expect(notes.map((n) => n.answer)).toEqual(["First answer", "Corrected answer"]);
    expect(notes[1]!.id).toBe(notes[0]!.id);
  });

  it("a free answer in a second round is kept next to the first one", async () => {
    const actions: CvAction[] = [];
    render(<Harness initial={scores()} onAction={(a) => actions.push(a)} extra="Which teams did you work with in r1?" />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Companies done" }));
    await userEvent.click(await screen.findByRole("button", { name: "Tools done" }));
    await userEvent.click(await screen.findByRole("button", { name: "Talk and finish" }));
    await userEvent.click(await screen.findByRole("button", { name: "Apply all" }));
    await userEvent.click(screen.getByRole("button", { name: "Rescore" }));
    await userEvent.click(await screen.findByRole("button", { name: "1 more question" }));
    await userEvent.click(await screen.findByRole("button", { name: "Talk and finish" }));
    const talks = actions.flatMap((a) => (a.type === "setNote" && a.note.answer.startsWith("Talked before") ? [a.note] : []));
    expect(talks).toHaveLength(2);
    expect(talks[1]!.id).not.toBe(talks[0]!.id);
  });

  it("two lines asked the same words keep two notes", async () => {
    const actions: CvAction[] = [];
    render(<Harness initial={scores()} onAction={(a) => actions.push(a)} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Companies done" }));
    await userEvent.click(await screen.findByRole("button", { name: "Tools done" }));
    await userEvent.click(await screen.findByRole("button", { name: "Same wording, two lines" }));
    const notes = actions.flatMap((a) => (a.type === "setNote" && a.note.answer.startsWith("About line") ? [a.note] : []));
    expect(notes).toHaveLength(2);
    expect(notes[1]!.id).not.toBe(notes[0]!.id);
  });

  it("Skip for now closes it", async () => {
    const onClose = vi.fn();
    render(<Harness initial={scores()} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("the CV's strength", () => {
  it("weights the latest role 3, the one before 2, the rest 1", () => {
    const weights = strengthWeights({ experience: [role("a"), role("b"), role("c")] });
    expect([...weights.values()]).toEqual([3, 2, 1]);
    expect(averageScore(new Map([["a", 90], ["b", 60], ["c", null]]), weights)).toBe(78);
    expect(averageScore(new Map([["a", null]]))).toBeNull();
  });
});

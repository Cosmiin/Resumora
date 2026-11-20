import { useReducer, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, fingerprint, type BudgetItem, type CvContent, type Experience, type Note, type RoleResult } from "@resumora/shared";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";
import type { RoleScoreState } from "./useRoleScores.ts";
import { ApiClientError } from "../../lib/api-error.ts";

const api = vi.hoisted(() => ({ improveBullet: vi.fn(), brainDump: vi.fn(), roleDescription: vi.fn(), proposeShape: vi.fn(), checkChanges: vi.fn(), placeAnswersOnCv: vi.fn() }));
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

function Harness({ initial, onAction, onClose = () => {}, extra, start = cv, onScore }: { initial: Map<string, RoleScoreState>; onAction?(a: CvAction): void; onClose?(): void; extra?: string; start?: CvContent; onScore?(r: RoleResult): void }) {
  const [state, apply] = useReducer(cvReducer, start);
  const [scores, setScores] = useState(initial);
  return (
    <>
      <button type="button" onClick={() => setScores(new Map([
        ["r1", ready(state.experience[0]!, 88, extra ? { roleQuestions: [{ id: "rq9", text: extra, options: [], kind: "role", topic: "other" }] } : {})],
        ["r2", ready(state.experience[1]!, 80, { questions: [], roleQuestions: [] })]]))}>Rescore</button>
      <EnrichPath cv={state} scores={scores} waitForSave={() => Promise.resolve()} onClose={onClose} onScore={onScore}
        dispatch={(a) => { onAction?.(a); apply(a); }} />
    </>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.improveBullet.mockImplementation(({ bulletId }: { bulletId: string }) => Promise.resolve({ proposal: { bulletId, text: `Better ${bulletId}.` }, bulletBefore: 60, bulletAfter: 90, roleBefore: 60, roleAfter: 70, cached: false }));
  api.roleDescription.mockResolvedValue({ text: "Acme makes anvils. Ran reports.", keywords: [] });
  api.brainDump.mockResolvedValue({ proposals: [], roleBefore: null, roleAfterAll: null });
  api.placeAnswersOnCv.mockResolvedValue({ changes: [] });
  // Keeps every change, and predicts the role at 85.
  api.checkChanges.mockImplementation(({ roleId, changes }: { roleId: string; changes: { id: string }[] }) =>
    Promise.resolve({ result: { ...result(roleId === "r1" ? r1 : r2, 85), fingerprint: `after-${roleId}` }, kept: changes.map((c) => c.id), held: [] }));
});

/** The change list put on the CV for a role. */
const appliedTo = (actions: CvAction[], roleId: string) =>
  actions.flatMap((a) => (a.type === "applyRoleChanges" && a.roleId === roleId ? a.changes : []));

describe("the short path", () => {
  // r2 has nothing left to ask: only its weak line is worked on.
  const scores = () => new Map<string, RoleScoreState>([["r1", ready(r1, 60)], ["r2", ready(r2, 70, { questions: [], roleQuestions: [] })]]);

  it("shows that it is reading the CV, and no score, until every role is checked", async () => {
    render(<Harness initial={new Map([["r1", ready(r1, 60)], ["r2", { state: "scoring" }]])} />);
    expect(screen.getByRole("heading", { name: "Reading your CV…" })).toBeInTheDocument();
    // r1 already has its score: a number now would move when r2's arrives.
    expect(screen.queryByText(/Your CV:/)).toBeNull();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Rescore" }));
    // (88*3 + 80*2) / 5 = 84.8
    expect(screen.getByRole("heading", { name: "Your CV: 85" })).toBeInTheDocument();
    expect(screen.queryByText("Reading your CV…")).toBeNull();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("shows the CV's score at the start, then companies, tools, the questions and the end, with no review sheet", async () => {
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
    expect(await screen.findByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply all" })).toBeNull();
    expect(appliedTo(actions, "r1")).toEqual([
      { id: "description", kind: "description", text: "Acme makes anvils. Ran reports." },
      { id: "bullet:r1b1", kind: "bullet", bulletId: "r1b1", text: "Better r1b1." },
      // A question about the whole role was answered: lines below 100 are worked on too.
      { id: "bullet:r1b2", kind: "bullet", bulletId: "r1b2", text: "Better r1b2." },
    ]);
    // r2 got no answers: only its weak line is tidied.
    expect(appliedTo(actions, "r2")).toEqual([{ id: "bullet:r2b1", kind: "bullet", bulletId: "r2b1", text: "Better r2b1." }]);
    // Every answer of this round is offered to be placed, on the role with its prepared changes.
    expect(api.placeAnswersOnCv).toHaveBeenCalledWith(expect.objectContaining({
      roleId: "r1", fingerprint: fingerprint(r1, "en"),
      questions: expect.arrayContaining(["What does Acme do?", "What changed in r1?", "Did anyone report to you in r1?"]),
    }));
    expect(api.checkChanges).toHaveBeenCalledWith(expect.objectContaining({ roleId: "r1", hold: true }));
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
    await screen.findByRole("button", { name: "Done" });
    await userEvent.click(screen.getByRole("button", { name: "Rescore" }));
    await userEvent.click(await screen.findByRole("button", { name: "1 more question" }));
    const second = (await screen.findByText(/^Budget:/)).textContent ?? "";
    expect(second).toBe("Budget: Which teams did you work with in r1?");
    expect(first).toContain("What changed in r1?");
  });

  it("goes straight from tools to the end when there is nothing to ask", async () => {
    const actions: CvAction[] = [];
    const quiet = new Map<string, RoleScoreState>([["r1", ready(r1, 60, { questions: [], roleQuestions: [] })], ["r2", ready(r2, 70, { questions: [], roleQuestions: [] })]]);
    render(<Harness initial={quiet} onAction={(a) => actions.push(a)} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Companies done" }));
    await userEvent.click(await screen.findByRole("button", { name: "Tools done" }));
    await screen.findByRole("button", { name: "Done" });
    expect(screen.queryByText(/^Budget:/)).toBeNull();
    // A company answer brings a description, but rewrites only the weak line (60), not the one at 90.
    expect(appliedTo(actions, "r1").map((c) => c.id)).toEqual(["description", "bullet:r1b1"]);
    expect(appliedTo(actions, "r2").map((c) => c.id)).toEqual(["bullet:r2b1"]);
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
    await screen.findByRole("button", { name: "Done" });
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

  describe("preparing", () => {
    const toEnd = async (onAction?: (a: CvAction) => void, onScore?: (r: RoleResult) => void) => {
      render(<Harness initial={scores()} onAction={onAction} onScore={onScore} />);
      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      await userEvent.click(screen.getByRole("button", { name: "Companies done" }));
      await userEvent.click(await screen.findByRole("button", { name: "Tools done" }));
      await userEvent.click(await screen.findByRole("button", { name: "Answer all" }));
      await screen.findByRole("button", { name: "Done" });
    };

    it("shows one ring: finished roles counted and a failed one not placed, while another still works", async () => {
      let release = () => {};
      api.checkChanges.mockImplementation(({ roleId, changes }: { roleId: string; changes: { id: string }[] }) => roleId === "r2"
        ? Promise.reject(new Error("down"))
        : new Promise((resolve) => {
          release = () => resolve({ result: { ...result(r1, 85), fingerprint: "after-r1" }, kept: changes.map((c) => c.id), held: [], asks: [] });
        }));
      render(<Harness initial={scores()} />);
      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      await userEvent.click(screen.getByRole("button", { name: "Companies done" }));
      await userEvent.click(await screen.findByRole("button", { name: "Tools done" }));
      await userEvent.click(await screen.findByRole("button", { name: "Answer all" }));
      expect(await screen.findByRole("img", { name: "1 of 2 roles ready" })).toBeInTheDocument();
      expect(screen.getByText("Role r2 · Beta: not placed")).toBeInTheDocument();
      expect(screen.getByText(/^Placing \d+ answers? in Role r1 · Acme$/)).toBeInTheDocument();
      expect(screen.queryByText("All roles at once.")).toBeNull();
      release();
      await screen.findByRole("button", { name: "Done" });
    });

    it("places what the answers still lack, replacing the role's own change for the same line, and puts the prediction", async () => {
      api.placeAnswersOnCv.mockImplementation(({ roleId }: { roleId: string }) => Promise.resolve(roleId === "r1"
        ? { changes: [{ id: "answer1", kind: "bullet", bulletId: "r1b1", text: "Better r1b1, for 3 teams." }, { id: "answer2", kind: "new", text: "Reported to the CFO." }] }
        : { changes: [] }));
      const actions: CvAction[] = [];
      const onScore = vi.fn();
      await toEnd((a) => actions.push(a), onScore);
      expect(appliedTo(actions, "r1")).toEqual([
        { id: "description", kind: "description", text: "Acme makes anvils. Ran reports." },
        { id: "bullet:r1b1", kind: "bullet", bulletId: "r1b1", text: "Better r1b1, for 3 teams." },
        { id: "bullet:r1b2", kind: "bullet", bulletId: "r1b2", text: "Better r1b2." },
        { id: "answer2", kind: "new", text: "Reported to the CFO." },
      ]);
      expect(onScore).toHaveBeenCalledWith(expect.objectContaining({ roleId: "r1", fingerprint: "after-r1" }));
      expect(onScore).toHaveBeenCalledWith(expect.objectContaining({ roleId: "r2", fingerprint: "after-r2" }));
    });

    it("a held line's retry after a failure replaces its note instead of adding a second one (score/12)", async () => {
      const held = { id: "answer1", kind: "new", text: "Helped the team." };
      const ask = { changeId: "answer1", text: "What did you do for the team?", options: ["Ran the weekly rota", "Trained new clerks"] };
      api.placeAnswersOnCv.mockImplementation(({ roleId, changes }: { roleId: string; changes: { id: string }[] }) => Promise.resolve(
        roleId !== "r1" || changes.some((c) => c.id === "answer1") ? { changes: [] } : { changes: [held] }));
      let failOnce = true;
      api.checkChanges.mockImplementation(({ roleId, changes, hold }: { roleId: string; changes: { id: string; kind: string }[]; hold: boolean }) => {
        if (!hold && failOnce) { failOnce = false; return Promise.reject(new Error("down")); }
        return Promise.resolve({
          result: { ...result(roleId === "r1" ? r1 : r2, 85), fingerprint: `after-${roleId}` },
          kept: changes.filter((c) => !hold || c.kind !== "new").map((c) => c.id), held: hold ? changes.filter((c) => c.kind === "new") : [],
          asks: hold && roleId === "r1" ? [ask] : [],
        });
      });
      const actions: CvAction[] = [];
      await toEnd((a) => actions.push(a));
      await userEvent.click(screen.getByRole("button", { name: "Ran the weekly rota" }));
      await userEvent.click(screen.getByRole("button", { name: "Add with this fact" }));
      expect(await screen.findByText("Couldn't add it. Try again.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Add with this fact" }));
      await waitFor(() => expect(screen.queryByText("Helped the team.")).toBeNull());
      const notes = actions.filter((a): a is Extract<CvAction, { type: "setNote" }> => a.type === "setNote" && a.note.question === ask.text);
      expect(notes).toHaveLength(2);
      expect(notes[1]!.note.id).toBe(notes[0]!.note.id);
    });

    it("a held line with a question: Add with this fact saves the note, places it, checks without holding, and applies (score/12)", async () => {
      const held = { id: "answer1", kind: "new", text: "Helped the team." };
      const ask = { changeId: "answer1", text: "What did you do for the team?", options: ["Ran the weekly rota", "Trained new clerks"] };
      api.placeAnswersOnCv.mockImplementation(({ roleId, changes }: { roleId: string; changes: { id: string }[] }) => Promise.resolve(
        roleId !== "r1" ? { changes: [] }
          : changes.some((c) => c.id === "answer1") ? { changes: [{ id: "answer9", kind: "bullet", bulletId: "answer1", text: "Ran the team's weekly rota." }] }
            : { changes: [held] }));
      api.checkChanges.mockImplementation(({ roleId, changes, hold }: { roleId: string; changes: { id: string; kind: string }[]; hold: boolean }) => Promise.resolve({
        result: { ...result(roleId === "r1" ? r1 : r2, 85), fingerprint: `after-${roleId}` },
        kept: changes.filter((c) => !hold || c.kind !== "new").map((c) => c.id), held: hold ? changes.filter((c) => c.kind === "new") : [],
        asks: hold && roleId === "r1" ? [ask] : [],
      }));
      const actions: CvAction[] = [];
      const onScore = vi.fn();
      await toEnd((a) => actions.push(a), onScore);
      expect(screen.getByText("Role r1: one fact away")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Ran the weekly rota" }));
      await userEvent.click(screen.getByRole("button", { name: "Add with this fact" }));
      await waitFor(() => expect(screen.queryByText("Helped the team.")).toBeNull());
      expect(actions).toContainEqual(expect.objectContaining({ type: "setNote", roleId: "r1", note: expect.objectContaining({ question: ask.text, answer: "Ran the weekly rota" }) }));
      expect(api.placeAnswersOnCv).toHaveBeenLastCalledWith(expect.objectContaining({ roleId: "r1", changes: [held], questions: [ask.text] }));
      expect(api.checkChanges).toHaveBeenLastCalledWith(expect.objectContaining({ roleId: "r1", hold: false, changes: [{ ...held, text: "Ran the team's weekly rota." }] }));
      expect(actions.at(-1)).toEqual({ type: "applyRoleChanges", roleId: "r1", changes: [{ ...held, text: "Ran the team's weekly rota." }] });
      expect(onScore).toHaveBeenLastCalledWith(expect.objectContaining({ roleId: "r1", fingerprint: "after-r1" }));
    });

    it("a held new line stays off the CV and is shown at the end; Add anyway puts it on", async () => {
      api.placeAnswersOnCv.mockImplementation(({ roleId }: { roleId: string }) => Promise.resolve(roleId === "r1"
        ? { changes: [{ id: "answer1", kind: "new", text: "Helped the team." }] } : { changes: [] }));
      api.checkChanges.mockImplementation(({ roleId, changes }: { roleId: string; changes: { id: string; kind: string }[] }) => Promise.resolve({
        result: { ...result(roleId === "r1" ? r1 : r2, 85), fingerprint: `after-${roleId}` },
        kept: changes.filter((c) => c.kind !== "new").map((c) => c.id), held: changes.filter((c) => c.kind === "new"), asks: [],
      }));
      const actions: CvAction[] = [];
      await toEnd((a) => actions.push(a));
      expect(appliedTo(actions, "r1").map((c) => c.id)).toEqual(["description", "bullet:r1b1", "bullet:r1b2"]);
      expect(screen.getByText("Not added: it would lower Role r1's score a little")).toBeInTheDocument();
      expect(screen.getByText("Helped the team.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Add anyway" }));
      expect(actions.at(-1)).toEqual({ type: "applyRoleChanges", roleId: "r1", changes: [{ id: "answer1", kind: "new", text: "Helped the team." }] });
      expect(screen.queryByText("Helped the team.")).toBeNull();
    });

    it("when one role's check fails, the other role's changes are on the CV and the notice shows", async () => {
      api.checkChanges.mockImplementation(({ roleId, changes }: { roleId: string; changes: { id: string }[] }) => (roleId === "r1"
        ? Promise.reject(new ApiClientError(503, "ai_unavailable", "down"))
        : Promise.resolve({ result: { ...result(r2, 85), fingerprint: "after-r2" }, kept: changes.map((c) => c.id), held: [] })));
      const actions: CvAction[] = [];
      await toEnd((a) => actions.push(a));
      expect(appliedTo(actions, "r2").map((c) => c.id)).toEqual(["bullet:r2b1"]);
      expect(appliedTo(actions, "r1")).toEqual([]);
      expect(screen.getByRole("alert")).toHaveTextContent("Some changes could not be prepared.");
    });

    it("when the CV moved on (409), that role's changes go on the CV anyway, with no prediction", async () => {
      api.checkChanges.mockImplementation(({ roleId, changes }: { roleId: string; changes: { id: string }[] }) => (roleId === "r1"
        ? Promise.reject(new ApiClientError(409, "not_saved", "not saved"))
        : Promise.resolve({ result: { ...result(r2, 85), fingerprint: "after-r2" }, kept: changes.map((c) => c.id), held: [] })));
      const actions: CvAction[] = [];
      const onScore = vi.fn();
      await toEnd((a) => actions.push(a), onScore);
      expect(appliedTo(actions, "r1").map((c) => c.id)).toEqual(["description", "bullet:r1b1", "bullet:r1b2"]);
      expect(onScore.mock.calls.map(([r]) => r.roleId)).toEqual(["r2"]);
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("the start lists each role as one row: title, company and period, and its score, with no checklist", () => {
    render(<Harness initial={scores()} />);
    expect(screen.getByText("About 5 minutes: tidy your lines, then your companies, your tools, and the 8 questions that will help most.")).toBeInTheDocument();
    const first = screen.getByRole("group", { name: /^Role r1/ });
    expect(within(first).getByText(/^Acme · /)).toBeInTheDocument();
    expect(within(first).getByText("60")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: /^Role r2/ })).getByText("70")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Shape" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Worth adding" })).toBeNull();
    expect(screen.queryByText("Shape and Worth adding don't change your score. They show what a recruiter notices.")).toBeNull();
  });

  it("with no role needing Shape, Start goes straight to companies", async () => {
    render(<Harness initial={scores()} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Companies step")).toBeInTheDocument();
    expect(api.proposeShape).not.toHaveBeenCalled();
  });

  describe("Shape", () => {
    const long = role("r1", { bullets: Array.from({ length: 8 }, (_, i) => ({ id: `r1b${i + 1}`, text: `Did task ${i + 1} for 5 clients.` })) });
    const start: CvContent = { ...emptyCv("en"), experience: [long, r2] };
    const shapeScores = () => new Map<string, RoleScoreState>([["r1", ready(long, 60)], ["r2", ready(r2, 70, { questions: [], roleQuestions: [] })]]);
    const mergedText = "Did tasks 2 and 3 for 5 clients.";
    const predicted = (): RoleResult => ({ ...result(long, 75), fingerprint: "after" });

    beforeEach(() => {
      api.proposeShape.mockResolvedValue({ merges: [{ ids: ["r1b2", "r1b3"], text: mergedText }] });
      api.checkChanges.mockResolvedValue({ result: predicted(), kept: [], held: [] });
    });

    it("after Merge all the CV has the merged line in place of the first, the other removed, and the predicted score is put", async () => {
      const actions: CvAction[] = [];
      const onScore = vi.fn();
      render(<Harness initial={shapeScores()} start={start} onAction={(a) => actions.push(a)} onScore={onScore} />);
      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      await userEvent.click(await screen.findByRole("button", { name: "Merge all and continue" }));
      expect(await screen.findByText("Companies step")).toBeInTheDocument();
      const changes = [
        { id: "merge:r1b2", kind: "bullet", bulletId: "r1b2", text: mergedText },
        { id: "remove:r1b3", kind: "remove", bulletId: "r1b3" },
      ];
      expect(api.checkChanges).toHaveBeenCalledWith({ roleId: "r1", fingerprint: fingerprint(long, "en"), changes, hold: false });
      const applied = actions.find((a) => a.type === "applyRoleChanges");
      expect(applied).toEqual({ type: "applyRoleChanges", roleId: "r1", changes });
      const after = cvReducer(start, applied!);
      expect(after.experience[0]!.bullets.map((b) => b.text)).toEqual([
        "Did task 1 for 5 clients.", mergedText, ...[4, 5, 6, 7, 8].map((n) => `Did task ${n} for 5 clients.`),
      ]);
      expect(onScore).toHaveBeenCalledWith(predicted());
    });

    it("when the check fails (or the CV moved on), the merges are applied anyway and no score is put", async () => {
      api.checkChanges.mockRejectedValue(Object.assign(new Error("not saved"), { status: 409 }));
      const actions: CvAction[] = [];
      const onScore = vi.fn();
      render(<Harness initial={shapeScores()} start={start} onAction={(a) => actions.push(a)} onScore={onScore} />);
      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      await userEvent.click(await screen.findByRole("button", { name: "Merge all and continue" }));
      expect(await screen.findByText("Companies step")).toBeInTheDocument();
      expect(actions.some((a) => a.type === "applyRoleChanges" && a.roleId === "r1")).toBe(true);
      expect(onScore).not.toHaveBeenCalled();
    });
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

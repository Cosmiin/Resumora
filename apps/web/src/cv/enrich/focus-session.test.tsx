import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAIN_DUMP_QUESTION, emptyCv, fingerprint, notesHash,
  type CvContent, type Experience, type RoleResult,
} from "@resumora/shared";
import { ApiClientError } from "../../lib/api-error.ts";
import { cvReducer } from "../edit/cvReducer.ts";
import type { RoleScoreState } from "./useRoleScores.ts";
import { useFocusSession } from "./useFocusSession.ts";
import { FocusMode } from "./FocusMode.tsx";

const api = vi.hoisted(() => ({ improveBullet: vi.fn(), brainDump: vi.fn(), roleFacts: vi.fn(), scoreRole: vi.fn(), roleDescription: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

function role(count = 3): Experience {
  return {
    id: "r", company: "Company", title: "Engineer", location: "", startDate: "2020",
    endDate: "", current: true, description: "", notes: [],
    bullets: Array.from({ length: count }, (_, i) => ({ id: `b${i}`, text: `Built tool ${i}` })),
  };
}
function score(r: Experience, value: number | null = 40): RoleResult {
  return {
    roleId: r.id, policy: "score/2", fingerprint: fingerprint(r, "en"), score: value, nextStep: null,
    bullets: r.bullets.map((b, i) => ({
      id: b.id, score: [20, 60, 100, 20][i]!, contribution: "partial", clarity: "specific",
      specificity: "partial", impact: i === 2 ? "specific" : "partial",
      issue: "specificity", tip: null, question: "Which tools?",
    })),
    roleQuestions: [], thin: false,
    questions: r.bullets.map((b, i) => ({ bulletId: b.id, text: i === 0 ? "Which tools?" : `Which tools for tool ${i}?`, options: [], kind: "detail" })),
  };
}
const proposal = {
  proposal: { bulletId: "b0", text: "Built the reporting tool in Python" },
  bulletBefore: 20, bulletAfter: 80, roleBefore: 40, roleAfter: 70, cached: true,
};
const roleQuestions: RoleResult["roleQuestions"] = [
  { id: "rq1", text: "Who did you report to?", options: ["The CEO", "The owner", "A team lead"], kind: "role", topic: "other" },
  { id: "rq2", text: "Who did you work with?", options: ["Finance", "Customers", "Vendors"], kind: "role", topic: "other" },
];
function needsDetails() {
  api.improveBullet.mockResolvedValueOnce({ needsDetail: true, nextQuestion: { text: "Which processes?", options: ["Payroll", "Onboarding", "Reporting"] } })
    .mockResolvedValueOnce({ needsDetail: true, nextQuestion: { text: "Who used the reports?", options: ["Finance", "Managers", "Customers"] } })
    .mockResolvedValueOnce({ needsDetail: true, nextQuestion: { text: "What changed?", options: ["Faster", "Fewer errors", "Lower costs"] } });
}
type Options = Parameters<typeof useFocusSession>[0];
function mount(overrides: Partial<Options> = {}, r = role()) {
  const dispatch = vi.fn<Options["dispatch"]>();
  let opts: Options = {
    cv: { ...emptyCv(), experience: [r] }, roleId: "r", mode: "improve",
    scores: new Map([["r", { state: "ready", result: score(r) }]]),
    dispatch, waitForSave: vi.fn().mockResolvedValue(undefined), onClose: vi.fn(), ...overrides,
  };
  const view = renderHook((p: Options) => useFocusSession(p), { initialProps: opts });
  const update = (changes: Partial<Options>) => {
    opts = { ...opts, ...changes };
    view.rerender(opts);
  };
  dispatch.mockImplementation((a) => update({ cv: cvReducer(opts.cv, a) }));
  return { ...view, dispatch, update, opts: () => opts };
}
const submit = (h: ReturnType<typeof mount>, text = "Used Python") =>
  act(async () => h.result.current.submitAnswer(text, ["type"]));
const settle = () => act(async () => {});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
async function dump() {
  const h = mount({}, role(2));
  act(() => h.result.current.freeTalk());
  await submit(h, "Built reports every week");
  return h;
}

describe("useFocusSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.improveBullet.mockResolvedValue(proposal);
    api.brainDump.mockResolvedValue({
      proposals: [{ id: "p", text: "Built weekly reports", score: 80 }],
      roleBefore: 40, roleAfterAll: 70,
    });
    api.roleFacts.mockResolvedValue({ facts: ["Used Python"], fromNotes: notesHash([]) });
    api.scoreRole.mockRejectedValue(new Error("unavailable"));
    api.roleDescription.mockResolvedValue({ text: "", keywords: [] });
  });
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

  it.each([false, true])("filters saved role answers before asking and saving the next question (score on open: %s)", async (onOpen) => {
    const r = role();
    r.notes = [{ id: "n", question: "  WHO  did you REPORT to? ", answer: "The CEO", via: ["type"], askedAt: "2026-11-07T00:00:00Z" }];
    const result = { ...score(r), roleQuestions: [...roleQuestions, { ...roleQuestions[1]!, id: "rq3", text: " WHO did you WORK with? " }] };
    api.scoreRole.mockResolvedValue(result);
    const h = mount({ scores: onOpen ? new Map() : new Map([["r", { state: "ready", result }]]) }, r);
    await settle();
    expect(h.result.current.step).toEqual({ kind: "role", index: 0 });
    expect(h.result.current.roleQuestions).toEqual([roleQuestions[1]]);
    const ui = render(<FocusMode target={{ roleId: "r", mode: "improve" }} {...h.opts()} />);
    await settle();
    expect(screen.getByText("Question 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: roleQuestions[1]!.text })).toBeInTheDocument();
    ui.unmount();
    await submit(h, "Finance");
    expect(h.opts().cv.experience[0]!.notes[1]).toMatchObject({ question: roleQuestions[1]!.text, answer: "Finance" });
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b0" });
  });
  it.each([0, 1, 3])("skips previously answered role questions with %i bullets", async (count) => {
    const r = role(count);
    r.notes = roleQuestions.map((q) => ({ id: q.id, question: q.text.toUpperCase(), answer: "Saved answer", via: ["type"], askedAt: "2026-11-07T00:00:00Z" }));
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    await settle();
    expect(h.result.current.roleQuestions).toEqual([]);
    expect(h.result.current.step.kind).toBe(count <= 1 ? "brainDump" : "question");
    expect(api.brainDump).not.toHaveBeenCalled();
    expect(api.improveBullet).not.toHaveBeenCalled();
  });
  it("skips answered role questions when scoring an empty role on open", async () => {
    const r = role(0);
    r.notes = roleQuestions.map((q) => ({ id: q.id, question: q.text, answer: "Saved answer", via: ["type"], askedAt: "2026-11-07T00:00:00Z" }));
    api.scoreRole.mockResolvedValue({ ...score(r), roleQuestions });
    const h = mount({ scores: new Map() }, r);
    await settle();
    expect(h.result.current.roleQuestions).toEqual([]);
    expect(h.result.current.step).toEqual({ kind: "brainDump" });
    expect(api.brainDump).not.toHaveBeenCalled();
  });
  it("moves on when a follow-up repeats a skipped role question", async () => {
    const r = role();
    api.improveBullet.mockResolvedValue({ needsDetail: true, nextQuestion: { text: " WHO  DID YOU REPORT TO? ", options: [] } });
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    act(() => h.result.current.skip());
    act(() => h.result.current.skip());
    await submit(h);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1", asked: 1 });
  });
  it("skips a bullet whose stored question repeats an earlier bullet question", () => {
    const r = role(4);
    const result = score(r);
    result.questions[3]!.text = " WHICH  tools? ";
    const h = mount({ scores: new Map([["r", { state: "ready", result }]]) }, r);
    act(() => h.result.current.skip());
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
    expect(h.result.current.position).toBe(2);
    expect(api.improveBullet).not.toHaveBeenCalled();
  });
  it("shows a skipped role question again in a new session", () => {
    const r = role();
    const scores: Options["scores"] = new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]);
    const first = mount({ scores }, r);
    act(() => first.result.current.skip());
    expect(first.result.current.step).toEqual({ kind: "role", index: 1 });
    act(() => first.result.current.close());
    const saved = first.opts().cv.experience[0]!;
    first.unmount();
    const second = mount({ scores }, saved);
    expect(second.result.current.step).toEqual({ kind: "role", index: 0 });
    expect(second.result.current.roleQuestions[0]).toEqual(roleQuestions[0]);
    expect(saved.notes).toEqual([]);
  });

  it("saves role answers before bullet questions without calling AI", async () => {
    const r = role();
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    expect(h.result.current.step).toEqual({ kind: "role", index: 0 });
    await submit(h, "The CEO");
    expect(h.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "setNote", note: expect.objectContaining({ question: roleQuestions[0]!.text, answer: "The CEO" }) }));
    expect(h.result.current.step).toEqual({ kind: "role", index: 1 });
    await submit(h, "Finance");
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b0", asked: 1 });
    expect(api.improveBullet).not.toHaveBeenCalled();
    expect(api.brainDump).not.toHaveBeenCalled();
    expect(api.scoreRole).not.toHaveBeenCalled();
  });
  it("skips all role and bullet questions without AI calls", async () => {
    const r = role();
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    for (let i = 0; i < 4; i++) act(() => h.result.current.skip());
    await settle();
    expect(h.result.current.step.kind).toBe("roleDone");
    expect(api.improveBullet).not.toHaveBeenCalled();
    expect(api.brainDump).not.toHaveBeenCalled();
    expect(h.dispatch).not.toHaveBeenCalled();
  });
  it.each([0, 1])("creates bullet proposals from role answers for %i bullets", async (count) => {
    const r = role(count);
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    act(() => h.result.current.skip()); // the box comes first on a thin role
    await submit(h, "The CEO");
    act(() => h.result.current.skip());
    await settle();
    expect(api.brainDump).toHaveBeenCalledExactlyOnceWith({ roleId: "r", fingerprint: fingerprint(h.opts().cv.experience[0]!, "en"), source: "answers" });
    expect(h.result.current.step.kind).toBe("dumpPick");
    act(() => h.result.current.addSelected(["p"]));
    expect(h.opts().cv.experience[0]!.bullets).toHaveLength(count + 1);
  });
  it.each([0, 1])("opens on the box, then the role questions, for %i bullets", (count) => {
    const r = role(count);
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    expect(h.result.current.step.kind).toBe("brainDump");
    act(() => h.result.current.skip());
    expect(h.result.current.step).toEqual({ kind: "role", index: 0 });
    expect(api.brainDump).not.toHaveBeenCalled();
  });
  it("scores an empty role once on open, then opens on the box and asks its role questions after it", async () => {
    const r = role(0);
    api.scoreRole.mockResolvedValue({ ...score(r), roleQuestions });
    const h = mount({ scores: new Map([["r", { state: "none" }]]) }, r);
    expect(h.result.current.busy).toBe(true);
    await settle();
    expect(api.scoreRole).toHaveBeenCalledExactlyOnceWith("r", fingerprint(r, "en"));
    expect(h.result.current.step).toEqual({ kind: "brainDump" });
    act(() => h.result.current.skip());
    expect(h.result.current.step).toEqual({ kind: "role", index: 0 });
    h.update({ scores: new Map([["r", { state: "none" }]]) });
    expect(api.scoreRole).toHaveBeenCalledTimes(1);
  });
  it("keeps the opening score when the background has no result", async () => {
    const r = role();
    api.scoreRole.mockResolvedValue({ ...score(r, 60), roleQuestions });
    const h = mount({ scores: new Map() }, r);
    await settle();
    for (let i = 0; i < 4; i++) act(() => h.result.current.skip());
    await settle();
    expect(h.result.current.step).toEqual({ kind: "roleDone", score: 60 });
  });
  it.each([0, 1, 3])("falls back to the role's queue when opening score fails: %i bullets", async (count) => {
    const h = mount({ scores: new Map() }, role(count));
    await settle();
    expect(h.result.current.busy).toBe(false);
    expect(h.result.current.step.kind).toBe(count <= 1 ? "brainDump" : "proposal");
  });

  it("sorts improve by score with CV-order ties, excludes 100, and moves the chosen bullet first", () => {
    const h = mount({ bulletId: "b1" }, role(4));
    expect(h.result.current.queue).toEqual(["b1", "b0", "b3"]);
    expect(h.result.current.position).toBe(0);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
  });
  it.each([
    { mode: "improve" as const, bulletId: undefined, queue: ["b0", "b1", "b2", "b3"] },
    { mode: "improve" as const, bulletId: "b2", queue: ["b2", "b0", "b1", "b3"] },
    { mode: "standOut" as const, bulletId: undefined, queue: ["b0", "b1", "b2", "b3"] },
  ])("ignores grades after editing the role: $mode, chosen $bulletId", ({ mode, bulletId, queue }) => {
    const r = role(4);
    const stored = score(r);
    r.bullets[0]!.text = "Built an updated tool";
    const h = mount({ mode, bulletId, scores: new Map([["r", { state: "ready", result: stored }]]) }, r);
    expect(h.result.current.queue).toEqual(queue);
  });
  it("keeps a chosen 100 bullet first when the fingerprint matches", () => {
    expect(mount({ bulletId: "b2" }).result.current.queue).toEqual(["b2", "b0", "b1"]);
  });
  it.each(["improve", "standOut"] as const)("ignores stale grades when rebuilding after a brain dump: %s", async (mode) => {
    const r = role(2);
    const stored = score(r);
    Object.assign(stored.bullets[0]!, { score: 100, impact: "specific" });
    const h = mount({ mode, scores: new Map([["r", { state: "ready", result: stored }]]) }, r);
    act(() => h.result.current.freeTalk());
    await submit(h, "Built weekly reports");
    act(() => h.result.current.addSelected(["p"]));
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    const addedId = h.opts().cv.experience[0]!.bullets[2]!.id;
    expect(h.result.current.queue).toEqual(["b1", "b0", addedId]);
  });
  it("standOut keeps only impact below specific in CV order", () => {
    const h = mount({ mode: "standOut", bulletId: "b3" }, role(4));
    expect(h.result.current.queue).toEqual(["b0", "b1", "b3"]);
  });
  it("starts two or more bullets on the first question when there are no role questions", () => {
    expect(mount({}, role(2)).result.current.step).toMatchObject({ kind: "question", bulletId: "b0" });
    expect(mount().result.current.step).toMatchObject({ kind: "question", bulletId: "b0" });
  });
  it("goes directly to working when there is no question", async () => {
    const r = role();
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), questions: [] } }]]) });
    expect(h.result.current.step).toEqual({ kind: "working", bulletId: "b0" });
    await settle();
    expect(api.improveBullet).toHaveBeenCalledTimes(1);
    expect(h.result.current.step.kind).toBe("proposal");
  });
  it("saves the note before the API, waits for saving, and ignores all actions but close while busy", async () => {
    const gate = deferred();
    const waitForSave = vi.fn(() => gate.promise);
    const h = mount({ waitForSave });
    act(() => {
      h.result.current.submitAnswer("  Used Python  ", ["pick", "voice"]);
      h.result.current.submitAnswer("Again", ["type"]);
      h.result.current.skip(); h.result.current.keepMine(); h.result.current.useProposal();
      h.result.current.addSelected(["p"]); h.result.current.next();
      h.result.current.retry();
    });
    expect(h.dispatch).toHaveBeenCalledTimes(1);
    expect(h.dispatch).toHaveBeenCalledWith({
      type: "setNote", roleId: "r", note: {
        id: expect.any(String), question: "Which tools?", answer: "Used Python",
        via: ["pick", "voice"], askedAt: expect.any(String),
      },
    });
    expect(waitForSave).toHaveBeenCalledTimes(1);
    expect(api.improveBullet).not.toHaveBeenCalled();
    expect(h.result.current.busy).toBe(true);
    await act(async () => gate.resolve());
    expect(api.improveBullet).toHaveBeenCalledTimes(1);
    expect(api.improveBullet).toHaveBeenCalledWith({
      roleId: "r", bulletId: "b0", fingerprint: fingerprint(h.opts().cv.experience[0]!, "en"),
    });
    expect(h.result.current.busy).toBe(false);
    expect(h.opts().onClose).not.toHaveBeenCalled();
  });
  it("ignores empty answers and limits saved answers to 4000 characters", async () => {
    const h = mount();
    await submit(h, "  ");
    expect(h.dispatch).not.toHaveBeenCalled();
    await submit(h, "x".repeat(5000));
    const action = h.dispatch.mock.calls[0]![0];
    expect(action.type === "setNote" && action.note.answer).toBe("x".repeat(4000));
  });
  it("uses a proposal in one dispatch and celebrates the answer's role scores", async () => {
    const h = mount();
    await submit(h);
    h.dispatch.mockClear();
    act(() => { h.result.current.useProposal(); h.result.current.useProposal(); });
    expect(h.dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "replaceBullet", roleId: "r", bulletId: "b0", text: proposal.proposal.text,
    });
    expect(h.result.current.step).toEqual({ kind: "celebrate", from: 40, to: 70, next: "queue" });
    act(() => h.result.current.next());
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
  });
  it("uses fresh background questions after a cached proposal and deduplicates them", async () => {
    const h = mount();
    await submit(h);
    act(() => h.result.current.useProposal());
    const fresh = score(h.opts().cv.experience[0]!, 70);
    const question = { ...fresh.questions[1]!, text: "Which processes did you own?", options: ["Payroll", "Onboarding", "Reporting"] };
    fresh.questions[1] = question;
    h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
    act(() => h.result.current.next());
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1", question, asked: 1 });
    api.improveBullet.mockResolvedValueOnce({ needsDetail: true, nextQuestion: { text: " WHICH  processes did you OWN? ", options: [] } });
    await submit(h, "Payroll");
    expect(h.result.current.step.kind).toBe("roleDone");
  });
  it.each([
    { state: "ready" as const, fingerprint: "old" },
    { state: "scoring" as const, fingerprint: null },
    { state: "unavailable" as const, fingerprint: null },
  ])("falls back to session questions when background scores are $state with fingerprint $fingerprint", async ({ state, fingerprint }) => {
    const h = mount();
    await submit(h);
    act(() => h.result.current.useProposal());
    const background = score(h.opts().cv.experience[0]!, 70);
    background.questions[1] = { ...background.questions[1]!, text: "Which processes did you own?" };
    if (fingerprint) background.fingerprint = fingerprint;
    h.update({ scores: new Map([["r", { state, result: background }]]) });
    act(() => h.result.current.next());
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1", question: { text: "Which tools for tool 1?" } });
  });
  it("prefers ready matching background questions when the opening score returns", async () => {
    const r = role();
    const gate = deferred();
    api.scoreRole.mockImplementationOnce(async () => { await gate.promise; return score(r); });
    const h = mount({ scores: new Map() }, r);
    await settle();
    const fresh = score(r, 60);
    fresh.questions[0] = { ...fresh.questions[0]!, text: "Which processes did you own?" };
    h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
    await act(async () => gate.resolve());
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b0", question: fresh.questions[0] });
  });
  it.each([40, 35])("accepts a cached proposal without celebrating a role score of %i", async (roleAfter) => {
    api.improveBullet.mockResolvedValue({ ...proposal, roleAfter });
    const h = mount();
    await submit(h);
    h.dispatch.mockClear();
    act(() => h.result.current.useProposal());
    expect(h.dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "replaceBullet", roleId: "r", bulletId: "b0", text: proposal.proposal.text,
    });
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
  });
  it.each([80, 40, 35])("waits for a fresh score for an uncached proposal and only celebrates an increase: %i", async (value) => {
    api.improveBullet.mockResolvedValue({ ...proposal, cached: false });
    const h = mount();
    await submit(h);
    h.dispatch.mockClear();
    act(() => { h.result.current.useProposal(); h.result.current.useProposal(); });
    expect(h.dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "replaceBullet", roleId: "r", bulletId: "b0", text: proposal.proposal.text,
    });
    expect(h.result.current.step).toEqual({ kind: "scoring", source: "bullet" });
    expect(h.result.current.busy).toBe(true);
    const fresh = score(h.opts().cv.experience[0]!, value);
    h.update({ scores: new Map([["r", { state: "ready", result: { ...fresh, fingerprint: "old" } }]]) });
    expect(h.result.current.step).toEqual({ kind: "scoring", source: "bullet" });
    h.update({ scores: new Map([["r", { state: "scoring", result: fresh }]]) });
    expect(h.result.current.step).toEqual({ kind: "scoring", source: "bullet" });
    h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
    expect(h.result.current.busy).toBe(false);
    if (value > proposal.roleBefore) {
      expect(h.result.current.step).toEqual({ kind: "celebrate", from: 40, to: value, next: "queue" });
      act(() => h.result.current.next());
    }
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
    expect(h.result.current.position).toBe(1);
  });
  it("moves to the next bullet after 15 seconds without a fresh score for an uncached proposal", async () => {
    api.improveBullet.mockResolvedValue({ ...proposal, cached: false });
    const h = mount();
    await submit(h);
    act(() => h.result.current.useProposal());
    await act(async () => vi.advanceTimersByTimeAsync(14999));
    expect(h.result.current.step).toEqual({ kind: "scoring", source: "bullet" });
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
    expect(h.result.current.busy).toBe(false);
  });
  it("keepMine and skip advance without celebrating and finish with the current score", async () => {
    const h = mount();
    await submit(h);
    act(() => h.result.current.keepMine());
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
    expect(h.dispatch.mock.calls.filter(([a]) => a.type === "replaceBullet")).toHaveLength(0);
    act(() => h.result.current.skip());
    await settle();
    expect(h.result.current.step).toEqual({ kind: "roleDone", score: 40 });
  });
  it("roleDone keeps the last celebrated score until fresh ready scores arrive", async () => {
    const h = mount();
    act(() => h.result.current.skip());
    api.improveBullet.mockResolvedValueOnce({ ...proposal, proposal: { ...proposal.proposal, bulletId: "b1" } });
    await submit(h);
    act(() => h.result.current.useProposal());
    act(() => h.result.current.next());
    await settle();
    expect(h.result.current.step).toEqual({ kind: "roleDone", score: 70 });
    const old = score(role());
    h.update({ scores: new Map([["r", { state: "scoring", result: old }]]) });
    expect(h.result.current.step).toEqual({ kind: "roleDone", score: 70 });
    const fresh = score(h.opts().cv.experience[0]!, 85);
    h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
    expect(h.result.current.step).toEqual({ kind: "roleDone", score: 85 });
    h.update({ scores: new Map([["r", { state: "ready", result: { ...fresh, score: 90 } }]]) });
    expect(h.result.current.step).toEqual({ kind: "roleDone", score: 90 });
  });
  it("asks up to three specific questions, then advances on a third needs-detail", async () => {
    needsDetails();
    const h = mount();
    await submit(h);
    expect(h.result.current.step).toMatchObject({ kind: "needsDetail", bulletId: "b0", asked: 2, question: { text: "Which processes?" } });
    await submit(h, "Payroll");
    expect(h.result.current.step).toMatchObject({ kind: "needsDetail", asked: 3, question: { text: "Who used the reports?" } });
    await submit(h, "Finance");
    expect(api.improveBullet).toHaveBeenCalledTimes(3);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1", asked: 1 });
  });
  it.each([null, { text: "  WHICH   tools? ", options: [] }])("advances for a missing or repeated next question: %j", async (nextQuestion) => {
    api.improveBullet.mockResolvedValue({ needsDetail: true, nextQuestion });
    const h = mount();
    await submit(h);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
  });
  it("never repeats an earlier follow-up question", async () => {
    api.improveBullet.mockResolvedValueOnce({ needsDetail: true, nextQuestion: { text: "Which processes?", options: [] } })
      .mockResolvedValueOnce({ needsDetail: true, nextQuestion: { text: " WHICH  PROCESSES? ", options: [] } });
    const h = mount();
    await submit(h);
    await submit(h, "Payroll");
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
  });
  it("the attempt cap waits for the last note to save before advancing, and role facts wait for it too", async () => {
    needsDetails();
    const waitForSave = vi.fn().mockResolvedValue(undefined);
    const h = mount({ waitForSave });
    await submit(h);
    await submit(h, "More detail");
    const gate = deferred();
    waitForSave.mockImplementationOnce(() => gate.promise);
    await submit(h, "Final detail");
    expect(h.dispatch.mock.calls[2]![0]).toMatchObject({ type: "setNote", note: { answer: "Final detail" } });
    expect(waitForSave).toHaveBeenCalledTimes(3);
    expect(h.result.current.busy).toBe(true);
    expect(h.result.current.position).toBe(0);
    // ✕ / Esc work while busy: the screen closes at once, but role facts wait for the last note's save.
    act(() => h.result.current.close());
    expect(h.opts().onClose).toHaveBeenCalledTimes(1);
    expect(api.roleFacts).not.toHaveBeenCalled();
    await act(async () => gate.resolve());
    expect(api.roleFacts).toHaveBeenCalledTimes(1);
    expect(api.improveBullet).toHaveBeenCalledTimes(2);
  });
  it("the attempt cap moves to the next bullet once the last note is saved", async () => {
    needsDetails();
    const waitForSave = vi.fn().mockResolvedValue(undefined);
    const h = mount({ waitForSave });
    await submit(h);
    await submit(h, "More detail");
    const gate = deferred();
    waitForSave.mockImplementationOnce(() => gate.promise);
    await submit(h, "Final detail");
    expect(h.result.current.busy).toBe(true);
    await act(async () => gate.resolve());
    expect(h.result.current.busy).toBe(false);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
    expect(api.improveBullet).toHaveBeenCalledTimes(3);
  });
  it("409 twice fails as saving and retry repeats the last call without another note", async () => {
    api.improveBullet.mockRejectedValueOnce(new ApiClientError(409, "not_saved", "save"))
      .mockRejectedValueOnce(new ApiClientError(409, "not_saved", "save"));
    const h = mount();
    await submit(h);
    expect(h.result.current.step).toEqual({ kind: "failed", bulletId: "b0", reason: "saving" });
    expect(h.opts().waitForSave).toHaveBeenCalledTimes(2);
    await act(async () => h.result.current.retry());
    expect(api.improveBullet).toHaveBeenCalledTimes(3);
    expect(h.dispatch).toHaveBeenCalledTimes(1);
    expect(h.result.current.step.kind).toBe("proposal");
  });
  it.each([502, 503])("%i fails as unavailable and retry repeats the call", async (status) => {
    api.improveBullet.mockRejectedValueOnce(new ApiClientError(status, "ai_unavailable", "down"));
    const h = mount();
    await submit(h);
    expect(h.result.current.step).toEqual({ kind: "failed", bulletId: "b0", reason: "unavailable" });
    await act(async () => h.result.current.retry());
    expect(api.improveBullet).toHaveBeenCalledTimes(2);
    expect(h.result.current.step.kind).toBe("proposal");
  });
  it("save failures are retryable without calling the API first", async () => {
    const waitForSave = vi.fn().mockRejectedValueOnce(new Error("save")).mockResolvedValue(undefined);
    const h = mount({ waitForSave });
    await submit(h);
    expect(h.result.current.step).toMatchObject({ kind: "failed", reason: "saving" });
    expect(api.improveBullet).not.toHaveBeenCalled();
    await act(async () => h.result.current.retry());
    expect(h.result.current.step.kind).toBe("proposal");
  });
  it("a save-failed retry preserves the three-question limit", async () => {
    needsDetails();
    const waitForSave = vi.fn().mockRejectedValueOnce(new Error("save")).mockResolvedValue(undefined);
    const h = mount({ waitForSave });
    await submit(h);
    await act(async () => h.result.current.retry());
    await submit(h, "More detail");
    await submit(h, "Third detail");
    expect(api.improveBullet).toHaveBeenCalledTimes(3);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
  });
  it("a changed bullet discards the proposal and improves the current text once", async () => {
    const h = mount();
    await submit(h);
    const cv: CvContent = cvReducer(h.opts().cv, { type: "replaceBullet", roleId: "r", bulletId: "b0", text: "New text" });
    h.update({ cv });
    h.dispatch.mockClear();
    await act(async () => h.result.current.useProposal());
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(api.improveBullet).toHaveBeenCalledTimes(2);
    expect(api.improveBullet.mock.calls[1]![0].fingerprint).toBe(fingerprint(cv.experience[0]!, "en"));
  });
  it("stores the box answer with the shared question; no new bullets from it goes on to the bullet questions", async () => {
    api.brainDump.mockResolvedValue({ proposals: [], roleBefore: null, roleAfterAll: null });
    const h = mount({}, role(1));
    await submit(h, "Built reports every week");
    await settle();
    expect(h.dispatch.mock.calls[0]![0]).toMatchObject({ type: "setNote", note: { question: BRAIN_DUMP_QUESTION } });
    expect(api.brainDump).toHaveBeenCalledWith(expect.objectContaining({ source: "answers" }));
    expect(h.result.current.step.kind).toBe("question");
  });
  it("skipping a failed free talk returns to the same bullet question", async () => {
    api.brainDump.mockRejectedValueOnce(new ApiClientError(503, "ai_unavailable", "down"));
    const h = await dump();
    expect(h.result.current.step).toEqual({ kind: "failed", bulletId: null, reason: "unavailable" });
    act(() => h.result.current.skip());
    expect(h.result.current.position).toBe(0);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b0", asked: 1 });
  });
  it("addSelected waits for a matching ready score, celebrates, then builds the fresh queue", async () => {
    const h = await dump();
    expect(h.result.current.step.kind).toBe("dumpPick");
    act(() => { h.result.current.addSelected(["p"]); h.result.current.addSelected(["p"]); });
    expect(h.dispatch.mock.calls.filter(([a]) => a.type === "addBullets")).toEqual([
      [{ type: "addBullets", roleId: "r", texts: ["Built weekly reports"] }],
    ]);
    expect(h.result.current.step).toEqual({ kind: "scoring", source: "dump" });
    expect(h.result.current.busy).toBe(true);
    const r = h.opts().cv.experience[0]!;
    const fresh = { ...score(r, 75), bullets: score(r).bullets.map((b) => ({ ...b, score: 100 })) };
    h.update({ scores: new Map([["r", { state: "ready", result: { ...fresh, fingerprint: "old" } }]]) });
    expect(h.result.current.step).toEqual({ kind: "scoring", source: "dump" });
    h.update({ scores: new Map([["r", { state: "scoring", result: fresh }]]) });
    expect(h.result.current.step).toEqual({ kind: "scoring", source: "dump" });
    h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
    expect(h.result.current.step).toEqual({ kind: "celebrate", from: 40, to: 75, next: "done" });
    expect(h.result.current.busy).toBe(false);
    act(() => h.result.current.next());
    expect(h.result.current.queue).toEqual([]);
    await settle();
    expect(h.result.current.step).toEqual({ kind: "roleDone", score: 75 });
  });
  it("continues after 15 seconds without a fresh score", async () => {
    const h = await dump();
    act(() => h.result.current.addSelected(["p"]));
    await act(async () => vi.advanceTimersByTimeAsync(14999));
    expect(h.result.current.step).toEqual({ kind: "scoring", source: "dump" });
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const addedId = h.opts().cv.experience[0]!.bullets[2]!.id;
    expect(h.result.current.queue).toEqual(["b0", "b1", addedId]);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b0", asked: 1 });
    expect(h.result.current.busy).toBe(false);
  });
  it("a fresh score that did not rise goes directly to its queue", async () => {
    const h = await dump();
    act(() => h.result.current.addSelected(["p"]));
    const fresh = score(h.opts().cv.experience[0]!, 40);
    h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
    expect(h.result.current.step.kind).toBe("question");
    expect(h.result.current.queue).toEqual(["b0", "b1"]);
  });
  it.each(["role", "bullet", "follow-up"])("returns to the same %s question after accepting free-talk proposals", async (source) => {
    const r = role();
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    act(() => h.result.current.skip());
    if (source !== "role") {
      act(() => h.result.current.skip());
      act(() => h.result.current.skip());
    }
    if (source === "follow-up") {
      api.improveBullet.mockResolvedValueOnce({ needsDetail: true, nextQuestion: { text: "Which processes?", options: [] } });
      await submit(h);
    }
    const previous = h.result.current.step;
    act(() => h.result.current.freeTalk());
    await submit(h, "Built weekly reports");
    act(() => h.result.current.addSelected(["p"]));
    const fresh = score(h.opts().cv.experience[0]!, 70);
    fresh.roleQuestions = [];
    fresh.questions[1]!.text = "Who used the reports?";
    h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
    expect(h.result.current.step.kind).toBe("celebrate");
    act(() => h.result.current.next());
    expect(h.result.current.step).toEqual(previous);
    expect(h.result.current.roleQuestions).toEqual(roleQuestions);
    if (source !== "role") expect(h.result.current.queue).not.toContain("b0");
    expect(api.brainDump).toHaveBeenCalledTimes(1);
    expect(api.improveBullet).toHaveBeenCalledTimes(source === "follow-up" ? 1 : 0);
    if (source !== "role") {
      act(() => h.result.current.skip());
      const addedId = h.opts().cv.experience[0]!.bullets[3]!.id;
      expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: addedId });
    }
  });

  it("returns to the remaining bullets after free talk rebuilds the queue", async () => {
    const h = mount();
    act(() => h.result.current.skip());
    act(() => h.result.current.freeTalk());
    await submit(h, "Built weekly reports");
    act(() => h.result.current.addSelected(["p"]));
    const r = h.opts().cv.experience[0]!;
    const fresh = score(r, 40);
    fresh.bullets[0]!.score = 80;
    fresh.bullets[3]!.score = 80;
    fresh.questions[1]!.text = "Who used the reports?";
    h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
  });
  it("never re-offers skipped bullets after rebuilding the free-talk queue twice", async () => {
    const h = mount();
    act(() => h.result.current.skip());
    for (const text of ["Built weekly reports", "Automated payroll summaries"]) {
      api.brainDump.mockResolvedValueOnce({ proposals: [{ id: "p", text, score: 80 }], roleBefore: 40, roleAfterAll: 70 });
      act(() => h.result.current.freeTalk());
      await submit(h, text);
      act(() => h.result.current.addSelected(["p"]));
      const r = h.opts().cv.experience[0]!;
      const fresh = score(r, 40);
      fresh.bullets = fresh.bullets.map((b) => ({ ...b, score: b.id === "b0" ? 20 : b.id === "b1" ? 60 : 100 }));
      fresh.questions[1]!.text = `Who used the ${text.toLowerCase()}?`;
      h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
      expect(h.result.current.queue).not.toContain("b0");
      expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
    }
    expect(api.improveBullet).not.toHaveBeenCalled();
  });
  it("restores the same follow-up question when returning from free talk", async () => {
    needsDetails();
    const h = mount();
    await submit(h);
    const previous = h.result.current.step;
    act(() => h.result.current.freeTalk());
    act(() => h.result.current.skip());
    expect(h.result.current.step).toEqual(previous);
    expect(api.improveBullet).toHaveBeenCalledTimes(1);
  });
  it("keeps the same question and budget across repeated free-talk rescoring", async () => {
    const h = mount();
    const previous = h.result.current.step;
    const questions = ["Who used the reports?", "Which processes did you own?", "What changed after the reports?"];
    for (const text of questions) {
      api.brainDump.mockResolvedValueOnce({ proposals: [{ id: "p", text, score: 80 }], roleBefore: 40, roleAfterAll: 70 });
      act(() => h.result.current.freeTalk());
      await submit(h, text);
      act(() => h.result.current.addSelected(["p"]));
      const fresh = score(h.opts().cv.experience[0]!, 40);
      fresh.bullets = fresh.bullets.map((b) => ({ ...b, score: b.id === "b0" ? 20 : b.id === "b1" ? 60 : 100 }));
      fresh.questions[0]!.text = text;
      h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
      expect(h.result.current.step).toEqual(previous);
    }
    expect(api.improveBullet).not.toHaveBeenCalled();
  });
  it.each(["improve", "rescore", "return"] as const)("never shows a fourth question through %s", async (path) => {
    needsDetails();
    const h = mount();
    await submit(h);
    await submit(h, "Payroll");
    expect(h.result.current.step).toMatchObject({ kind: "needsDetail", bulletId: "b0", asked: 3 });
    if (path === "improve") await submit(h, "Finance");
    else {
      act(() => h.result.current.freeTalk());
      if (path === "return") act(() => h.result.current.skip());
      else {
        await submit(h, "Built weekly reports");
        act(() => h.result.current.addSelected(["p"]));
        const fresh = score(h.opts().cv.experience[0]!, 40);
        fresh.bullets[3]!.score = 100;
        fresh.questions[0]!.text = "What changed after the reports?";
        h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
      }
      expect(h.result.current.step).toMatchObject({ kind: "needsDetail", bulletId: "b0", asked: 3 });
      await submit(h, "Finance");
    }
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1", asked: 1 });
    act(() => h.result.current.freeTalk());
    await submit(h, "Automated payroll summaries");
    act(() => h.result.current.addSelected(["p"]));
    const fresh = score(h.opts().cv.experience[0]!, 40);
    fresh.bullets = fresh.bullets.map((b) => ({ ...b, score: b.id === "b0" ? 20 : b.id === "b1" ? 60 : 100 }));
    fresh.questions[0]!.text = "Who did the reports help?";
    fresh.questions[1]!.text = "Who used the second tool?";
    h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
    expect(h.result.current.queue).not.toContain("b0");
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1", asked: 1 });
  });
  it("close immediately calls onClose and collects facts only after changed notes", async () => {
    const h = mount();
    await submit(h);
    const fromNotes = notesHash(h.opts().cv.experience[0]!.notes);
    api.roleFacts.mockResolvedValueOnce({ facts: ["Used Python"], fromNotes });
    h.dispatch.mockClear();
    act(() => h.result.current.close());
    expect(h.opts().onClose).toHaveBeenCalledTimes(1);
    await settle();
    expect(api.roleFacts).toHaveBeenCalledWith("r");
    expect(h.dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "setFacts", roleId: "r",
      facts: { items: ["Used Python"], fromNotes, updatedAt: expect.any(String) },
    });
  });
  it.each(["restored notes", "removed role"])("discards facts returned after close for %s", async (change) => {
    const h = mount();
    await submit(h);
    const fromNotes = notesHash(h.opts().cv.experience[0]!.notes);
    const gate = deferred();
    api.roleFacts.mockImplementationOnce(async () => {
      await gate.promise;
      return { facts: ["Used Python"], fromNotes };
    });
    act(() => h.result.current.close());
    await settle();
    expect(api.roleFacts).toHaveBeenCalledExactlyOnceWith("r");
    h.update({ cv: { ...h.opts().cv, experience: change === "restored notes" ? [role()] : [] } });
    h.dispatch.mockClear();
    await act(async () => gate.resolve());
    expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("close without notes makes no facts call and facts failures dispatch nothing", async () => {
    const unchanged = mount();
    act(() => unchanged.result.current.close());
    expect(api.roleFacts).not.toHaveBeenCalled();
    api.roleFacts.mockRejectedValueOnce(new Error("down"));
    const h = mount();
    await submit(h);
    h.dispatch.mockClear();
    act(() => h.result.current.close());
    await settle();
    expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("a removed role closes once without collecting facts", async () => {
    const h = mount();
    await submit(h);
    h.update({ cv: { ...h.opts().cv, experience: [] } });
    h.update({ scores: new Map<string, RoleScoreState>() });
    expect(h.opts().onClose).toHaveBeenCalledTimes(1);
    expect(api.roleFacts).not.toHaveBeenCalled();
  });
});

describe("steps never disappear, thin roles and Back (E1)", () => {
  const withQuestions = (r: Experience, qs = roleQuestions) => new Map([["r", { state: "ready" as const, result: { ...score(r), roleQuestions: qs } }]]);
  beforeEach(() => {
    vi.useFakeTimers();
    api.brainDump.mockResolvedValue({ proposals: [{ id: "p", text: "Built weekly reports", score: 80 }], roleBefore: 40, roleAfterAll: 70 });
    api.roleFacts.mockResolvedValue({ facts: [], fromNotes: notesHash([]) });
    api.scoreRole.mockRejectedValue(new Error("unavailable"));
    api.roleDescription.mockResolvedValue({ text: "", keywords: [] });
  });
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

  it("(a) a one-bullet role keeps the box on screen when a fresh score with role questions arrives", async () => {
    const r = role(1);
    const h = mount({}, r);
    expect(h.result.current.step).toEqual({ kind: "brainDump" });
    h.update({ scores: withQuestions(r) });
    h.update({ scores: new Map([["r", { state: "ready", result: { ...score(r, 90), roleQuestions } }]]) });
    await settle();
    expect(h.result.current.step).toEqual({ kind: "brainDump" });
  });

  it("(b) a thin role opens on the box, re-asks the AI after it, then asks the role questions, then the pick step", async () => {
    const r = role(1);
    api.scoreRole.mockResolvedValue({ ...score(r), roleQuestions: [roleQuestions[1]!] });
    const h = mount({ scores: withQuestions(r) }, r);
    expect(h.result.current.step).toEqual({ kind: "brainDump" });
    await submit(h, "I ran dispatch for a fintech");
    expect(api.scoreRole).toHaveBeenCalledExactlyOnceWith("r", fingerprint(r, "en"), true);
    expect(h.result.current.step).toEqual({ kind: "role", index: 0 });
    expect(h.result.current.roleQuestions).toEqual([roleQuestions[1]]);
    await submit(h, "Finance");
    expect(api.brainDump).toHaveBeenCalledExactlyOnceWith({ roleId: "r", fingerprint: fingerprint(r, "en"), source: "answers" });
    expect(h.result.current.step.kind).toBe("dumpPick");
  });

  it("a role the AI calls thin opens on the box even with three bullets", () => {
    const r = role(3);
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions, thin: true } }]]) }, r);
    expect(h.result.current.step).toEqual({ kind: "brainDump" });
  });

  it("skipping the box goes to the stored role questions; skipping everything goes to the bullets without AI calls", () => {
    const r = role(1);
    const h = mount({ scores: withQuestions(r) }, r);
    act(() => h.result.current.skip());
    expect(h.result.current.step).toEqual({ kind: "role", index: 0 });
    act(() => h.result.current.skip());
    act(() => h.result.current.skip());
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b0" });
    expect(api.brainDump).not.toHaveBeenCalled();
    expect(api.scoreRole).not.toHaveBeenCalled();
  });

  it("(c) Back shows the earlier answer, and sending it again updates that note", async () => {
    const r = role();
    const h = mount({ scores: withQuestions(r) }, r);
    expect(h.result.current.canBack).toBe(false);
    await submit(h, "The CEO");
    expect(h.result.current.step).toEqual({ kind: "role", index: 1 });
    expect(h.result.current.canBack).toBe(true);
    act(() => h.result.current.back());
    expect(h.result.current.step).toEqual({ kind: "role", index: 0 });
    expect(h.result.current.prefill).toBe("The CEO");
    expect(h.result.current.canBack).toBe(false);
    const id = h.opts().cv.experience[0]!.notes[0]!.id;
    await submit(h, "The owner");
    expect(h.opts().cv.experience[0]!.notes).toEqual([expect.objectContaining({ id, question: roleQuestions[0]!.text, answer: "The owner" })]);
    expect(h.result.current.step).toEqual({ kind: "role", index: 1 });
    expect(h.result.current.prefill).toBeNull();
  });

  it("Back from the pick step shows the box with its text, and Skip there returns to the pick step", async () => {
    const r = role(1);
    const h = mount({}, r);
    await submit(h, "I ran dispatch");
    await settle();
    expect(h.result.current.step.kind).toBe("dumpPick");
    expect(h.result.current.canBack).toBe(true);
    act(() => h.result.current.back());
    expect(h.result.current.step).toEqual({ kind: "brainDump" });
    expect(h.result.current.prefill).toBe("I ran dispatch");
    act(() => h.result.current.skip());
    expect(h.result.current.step.kind).toBe("dumpPick");
    expect(api.brainDump).toHaveBeenCalledTimes(1);
  });

  it("(d) a score crossing 80 mid-session changes no step", async () => {
    const r = role();
    const h = mount({ scores: withQuestions(r) }, r);
    await submit(h, "The CEO");
    h.update({ scores: new Map([["r", { state: "ready", result: { ...score(r, 85), roleQuestions: [] } }]]) });
    await settle();
    expect(h.result.current.step).toEqual({ kind: "role", index: 1 });
  });

  it("(e) the E1 case: after the role questions the answers become bullets behind a plain working screen, never the box", async () => {
    const r = role(1);
    const gate = deferred();
    api.brainDump.mockImplementation(async () => {
      await gate.promise;
      return { proposals: [{ id: "p", text: "Built weekly reports", score: 80 }], roleBefore: 40, roleAfterAll: 70 };
    });
    const h = mount({ scores: withQuestions(r) }, r);
    act(() => h.result.current.skip());
    await submit(h, "The CEO");
    act(() => h.result.current.skip());
    await settle();
    expect(h.result.current.step).toEqual({ kind: "dumpWorking", source: "answers" });
    await act(async () => gate.resolve());
    expect(h.result.current.step.kind).toBe("dumpPick");
  });
});

describe("Back edge cases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.brainDump.mockResolvedValue({ proposals: [{ id: "p", text: "Built weekly reports", score: 80 }], roleBefore: 40, roleAfterAll: 70 });
    api.roleFacts.mockResolvedValue({ facts: [], fromNotes: notesHash([]) });
    api.scoreRole.mockRejectedValue(new Error("unavailable"));
    api.roleDescription.mockResolvedValue({ text: "", keywords: [] });
  });
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
  it("a box first answered after Back still becomes bullets at the end of the role questions", async () => {
    const r = role(1);
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    act(() => h.result.current.skip());
    act(() => h.result.current.back());
    expect(h.result.current.step).toEqual({ kind: "brainDump" });
    await submit(h, "I ran dispatch");
    expect(h.result.current.step).toEqual({ kind: "role", index: 0 });
    act(() => h.result.current.skip());
    act(() => h.result.current.skip());
    await settle();
    expect(api.brainDump).toHaveBeenCalledWith(expect.objectContaining({ source: "answers" }));
  });
});

describe("the role description step (3B)", () => {
  const proposed = { text: "Company runs logistics for retailers. The role kept deliveries on time.", keywords: ["logistics"] };
  beforeEach(() => {
    vi.useFakeTimers();
    api.scoreRole.mockRejectedValue(new Error("unavailable"));
    api.roleDescription.mockResolvedValue(proposed);
  });
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
  async function toTheEnd() {
    const r = role();
    const h = mount({}, r);
    act(() => h.result.current.skip());
    expect(h.result.current.step.kind).toBe("question");
    expect(api.roleDescription).not.toHaveBeenCalled();
    act(() => h.result.current.skip());
    expect(h.result.current.step).toEqual({ kind: "describing" });
    await settle();
    return h;
  }
  it("shows after the last bullet step, then Use it sets the description and ends the role", async () => {
    const h = await toTheEnd();
    expect(api.roleDescription).toHaveBeenCalledExactlyOnceWith({ roleId: "r", fingerprint: fingerprint(role(), "en") });
    expect(h.result.current.step).toEqual({ kind: "description", ...proposed });
    act(() => h.result.current.useDescription(proposed.text));
    expect(h.opts().cv.experience[0]!.description).toBe(proposed.text);
    expect(h.result.current.step.kind).toBe("roleDone");
  });
  it("Use it with edited text saves the edit", async () => {
    const h = await toTheEnd();
    act(() => h.result.current.useDescription("  A logistics firm. The role planned routes.  "));
    expect(h.opts().cv.experience[0]!.description).toBe("A logistics firm. The role planned routes.");
  });
  it("Skip leaves the description as it is", async () => {
    const h = await toTheEnd();
    act(() => h.result.current.skip());
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(h.result.current.step.kind).toBe("roleDone");
  });
  it.each(["empty", "failed"])("an %s answer skips the step", async (how) => {
    if (how === "empty") api.roleDescription.mockResolvedValue({ text: "", keywords: [] });
    else api.roleDescription.mockRejectedValue(new Error("down"));
    const h = await toTheEnd();
    expect(h.result.current.step.kind).toBe("roleDone");
  });
});

describe("a role the AI called thin, after the box (review fix)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.brainDump.mockResolvedValue({ proposals: [{ id: "p", text: "Built weekly reports", score: 80 }], roleBefore: 40, roleAfterAll: 70 });
    api.roleDescription.mockResolvedValue({ text: "", keywords: [] });
  });
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
  it("still turns the box into bullets when the re-score after it no longer says thin", async () => {
    const r = role(3);
    api.scoreRole.mockResolvedValue({ ...score(r), roleQuestions: [], thin: false });
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), thin: true } }]]) }, r);
    expect(h.result.current.step).toEqual({ kind: "brainDump" });
    await submit(h, "I ran the reporting for the whole region");
    await settle();
    expect(api.brainDump).toHaveBeenCalledWith(expect.objectContaining({ source: "answers" }));
    expect(h.result.current.step.kind).toBe("dumpPick");
  });
});

describe("a session opened with what the person wants their CV to bring out", () => {
  it("asks for the role's questions again with it, even when a stored result is fresh, and uses that answer", async () => {
    const r = role();
    api.scoreRole.mockResolvedValue({ ...score(r), roleQuestions });
    const h = mount({ focus: "Move into automation" }, r);
    expect(h.result.current.step).toEqual({ kind: "scoring", source: "opening" });
    await settle();
    expect(api.scoreRole).toHaveBeenCalledExactlyOnceWith("r", fingerprint(r, "en"), true, "Move into automation");
    // The stored result has no role questions; the answer asked with the focus does.
    expect(h.result.current.step).toEqual({ kind: "role", index: 0 });
    expect(h.result.current.roleQuestions.map((q) => q.text)).toEqual(["Who did you report to?", "Who did you work with?"]);
  });

  it("falls back to the stored result when that call fails", async () => {
    const r = role();
    api.scoreRole.mockRejectedValue(new Error("down"));
    const h = mount({ focus: "Move into automation" }, r);
    await settle();
    expect(h.result.current.step.kind).toBe("question");
  });
});

describe("a thin role opened with a focus", () => {
  it("asks again after the box with the same focus", async () => {
    const r = role(1);
    api.scoreRole.mockResolvedValue({ ...score(r), roleQuestions });
    const h = mount({ focus: "Move into automation" }, r);
    await settle();
    expect(h.result.current.step).toEqual({ kind: "brainDump" });
    await submit(h, "I ran the tools team");
    await settle();
    expect(api.scoreRole).toHaveBeenCalledTimes(2);
    expect(api.scoreRole).toHaveBeenLastCalledWith("r", fingerprint(r, "en"), true, "Move into automation");
  });
});

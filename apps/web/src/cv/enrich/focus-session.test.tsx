import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAIN_DUMP_QUESTION, emptyCv, fingerprint, notesHash,
  type CvContent, type Experience, type RoleResult,
} from "@resumora/shared";
import { ApiClientError } from "../../lib/api-error.ts";
import { cvReducer } from "../edit/cvReducer.ts";
import type { RoleScoreState } from "./useRoleScores.ts";
import { useFocusSession } from "./useFocusSession.ts";

const api = vi.hoisted(() => ({ improveBullet: vi.fn(), brainDump: vi.fn(), roleFacts: vi.fn(), scoreRole: vi.fn() }));
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
    roleQuestions: [],
    questions: r.bullets.map((b) => ({ bulletId: b.id, text: "Which tools?", options: [], kind: "detail" })),
  };
}
const proposal = {
  proposal: { bulletId: "b0", text: "Built the reporting tool in Python" },
  bulletBefore: 20, bulletAfter: 80, roleBefore: 40, roleAfter: 70, cached: true,
};
const roleQuestions: RoleResult["roleQuestions"] = [
  { id: "rq1", text: "Who did you report to?", options: ["The CEO", "The owner", "A team lead"], kind: "role" },
  { id: "rq2", text: "Who did you work with?", options: ["Finance", "Customers", "Vendors"], kind: "role" },
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
  });
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

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
  it("skips all role and bullet questions without AI calls", () => {
    const r = role();
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    for (let i = 0; i < 4; i++) act(() => h.result.current.skip());
    expect(h.result.current.step.kind).toBe("roleDone");
    expect(api.improveBullet).not.toHaveBeenCalled();
    expect(api.brainDump).not.toHaveBeenCalled();
    expect(h.dispatch).not.toHaveBeenCalled();
  });
  it.each([0, 1])("creates bullet proposals from role answers for %i bullets", async (count) => {
    const r = role(count);
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    await submit(h, "The CEO");
    act(() => h.result.current.skip());
    await settle();
    expect(api.brainDump).toHaveBeenCalledExactlyOnceWith({ roleId: "r", fingerprint: fingerprint(h.opts().cv.experience[0]!, "en"), source: "answers" });
    expect(h.result.current.step.kind).toBe("dumpPick");
    act(() => h.result.current.addSelected(["p"]));
    expect(h.opts().cv.experience[0]!.bullets).toHaveLength(count + 1);
  });
  it.each([0, 1])("opens free talk after skipping every role question for %i bullets", (count) => {
    const r = role(count);
    const h = mount({ scores: new Map([["r", { state: "ready", result: { ...score(r), roleQuestions } }]]) }, r);
    act(() => h.result.current.skip());
    act(() => h.result.current.skip());
    expect(h.result.current.step.kind).toBe("brainDump");
    expect(api.brainDump).not.toHaveBeenCalled();
  });
  it("scores an empty role once on open, then asks its role questions", async () => {
    const r = role(0);
    api.scoreRole.mockResolvedValue({ ...score(r), roleQuestions });
    const h = mount({ scores: new Map([["r", { state: "none" }]]) }, r);
    expect(h.result.current.busy).toBe(true);
    await settle();
    expect(api.scoreRole).toHaveBeenCalledExactlyOnceWith("r", fingerprint(r, "en"));
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
    expect(h.result.current.queue).toEqual(["b0", "b1", addedId]);
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
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1", question: { text: "Which tools?" } });
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
    expect(h.result.current.step).toEqual({ kind: "roleDone", score: 40 });
  });
  it("roleDone keeps the last celebrated score until fresh ready scores arrive", async () => {
    const h = mount();
    act(() => h.result.current.skip());
    api.improveBullet.mockResolvedValueOnce({ ...proposal, proposal: { ...proposal.proposal, bulletId: "b1" } });
    await submit(h);
    act(() => h.result.current.useProposal());
    act(() => h.result.current.next());
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
  it("stores brain dumps with the shared question and shows dumpEmpty for no proposals", async () => {
    api.brainDump.mockResolvedValue({ proposals: [], roleBefore: null, roleAfterAll: null });
    const h = await dump();
    expect(h.dispatch.mock.calls[0]![0]).toMatchObject({ type: "setNote", note: { question: BRAIN_DUMP_QUESTION } });
    expect(h.result.current.step).toEqual({ kind: "dumpEmpty" });
    act(() => h.result.current.next());
    expect(h.result.current.step.kind).toBe("question");
  });
  it("skipping a failed brain dump skips the already shown bullet question", async () => {
    api.brainDump.mockRejectedValueOnce(new ApiClientError(503, "ai_unavailable", "down"));
    const h = await dump();
    expect(h.result.current.step).toEqual({ kind: "failed", bulletId: null, reason: "unavailable" });
    act(() => h.result.current.skip());
    expect(h.result.current.position).toBe(1);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
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
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
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
  it("skips already shown questions when returning from free talk", async () => {
    needsDetails();
    const h = mount();
    await submit(h);
    act(() => h.result.current.freeTalk());
    act(() => h.result.current.skip());
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
    expect(api.improveBullet).toHaveBeenCalledTimes(1);
  });
  it("keeps a session-wide question budget across repeated free-talk rescoring", async () => {
    const h = mount();
    const questions = ["Who used the reports?", "Which processes did you own?", "What changed after the reports?"];
    for (const [i, text] of questions.entries()) {
      api.brainDump.mockResolvedValueOnce({ proposals: [{ id: "p", text, score: 80 }], roleBefore: 40, roleAfterAll: 70 });
      act(() => h.result.current.freeTalk());
      await submit(h, text);
      act(() => h.result.current.addSelected(["p"]));
      const fresh = score(h.opts().cv.experience[0]!, 40);
      fresh.bullets = fresh.bullets.map((b) => ({ ...b, score: b.id === "b0" ? 20 : b.id === "b1" ? 60 : 100 }));
      fresh.questions[0]!.text = text;
      h.update({ scores: new Map([["r", { state: "ready", result: fresh }]]) });
      expect(h.result.current.step).toMatchObject(i < 2
        ? { kind: "question", bulletId: "b0", question: { text }, asked: i + 2 }
        : { kind: "question", bulletId: "b1", asked: 1 });
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
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1", asked: 2 });
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

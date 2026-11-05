import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAIN_DUMP_QUESTION, emptyCv, fingerprint, hashText,
  type CvContent, type Experience, type RoleResult,
} from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { ApiClientError } from "../../lib/api-error.ts";
import { cvReducer } from "../edit/cvReducer.ts";
import type { RoleScoreState } from "./useRoleScores.ts";
import { useFocusSession } from "./useFocusSession.ts";

const api = vi.hoisted(() => ({ improveBullet: vi.fn(), brainDump: vi.fn(), roleFacts: vi.fn() }));
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
    questions: r.bullets.map((b) => ({ bulletId: b.id, text: "Which tools?", options: [], kind: "detail" })),
  };
}
const proposal = {
  proposal: { bulletId: "b0", text: "Built the reporting tool in Python" },
  bulletBefore: 20, bulletAfter: 80, roleBefore: 40, roleAfter: 70,
};
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
    api.roleFacts.mockResolvedValue({ facts: ["Used Python"], fromNotes: hashText("notes") });
  });
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

  it("sorts improve by score with CV-order ties, excludes 100, and moves the chosen bullet first", () => {
    const h = mount({ bulletId: "b1" }, role(4));
    expect(h.result.current.queue).toEqual(["b1", "b0", "b3"]);
    expect(h.result.current.position).toBe(0);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
  });
  it("standOut keeps only impact below specific in CV order", () => {
    const h = mount({ mode: "standOut", bulletId: "b3" }, role(4));
    expect(h.result.current.queue).toEqual(["b0", "b1", "b3"]);
  });
  it("starts two bullets on brainDump and three on the first question", () => {
    expect(mount({}, role(2)).result.current.step).toEqual({ kind: "brainDump" });
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
  it("asks for free text after answering the stored question and never makes a third improve call", async () => {
    api.improveBullet.mockResolvedValue({ needsDetail: true });
    const h = mount();
    await submit(h);
    expect(h.result.current.step).toEqual({ kind: "needsDetail", bulletId: "b0", question: null });
    await submit(h, "More detail");
    expect(h.result.current.step.kind).toBe("needsDetail");
    expect(h.dispatch.mock.calls[1]![0]).toMatchObject({
      type: "setNote", note: { question: t("enrich.focus.followUpQuestion") },
    });
    await submit(h, "Third detail");
    expect(api.improveBullet).toHaveBeenCalledTimes(2);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b1" });
  });
  it("the attempt cap waits for the last note to save before advancing, and role facts wait for it too", async () => {
    api.improveBullet.mockResolvedValue({ needsDetail: true });
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
    api.improveBullet.mockResolvedValue({ needsDetail: true });
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
    expect(api.improveBullet).toHaveBeenCalledTimes(2);
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
  it("a save-failed retry still counts toward the two improve attempts", async () => {
    api.improveBullet.mockResolvedValue({ needsDetail: true });
    const waitForSave = vi.fn().mockRejectedValueOnce(new Error("save")).mockResolvedValue(undefined);
    const h = mount({ waitForSave });
    await submit(h);
    await act(async () => h.result.current.retry());
    await submit(h, "More detail");
    await submit(h, "Third detail");
    expect(api.improveBullet).toHaveBeenCalledTimes(2);
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
  it("skipping a failed brain dump starts at the first queued bullet", async () => {
    api.brainDump.mockRejectedValueOnce(new ApiClientError(503, "ai_unavailable", "down"));
    const h = await dump();
    expect(h.result.current.step).toEqual({ kind: "failed", bulletId: null, reason: "unavailable" });
    act(() => h.result.current.skip());
    expect(h.result.current.position).toBe(0);
    expect(h.result.current.step).toMatchObject({ kind: "question", bulletId: "b0" });
  });
  it("addSelected waits for a matching ready score, celebrates, then builds the fresh queue", async () => {
    const h = await dump();
    expect(h.result.current.step.kind).toBe("dumpPick");
    act(() => { h.result.current.addSelected(["p"]); h.result.current.addSelected(["p"]); });
    expect(h.dispatch.mock.calls.filter(([a]) => a.type === "addBullets")).toEqual([
      [{ type: "addBullets", roleId: "r", texts: ["Built weekly reports"] }],
    ]);
    expect(h.result.current.step).toEqual({ kind: "dumpScoring" });
    expect(h.result.current.busy).toBe(true);
    const r = h.opts().cv.experience[0]!;
    const fresh = { ...score(r, 75), bullets: score(r).bullets.map((b) => ({ ...b, score: 100 })) };
    h.update({ scores: new Map([["r", { state: "ready", result: { ...fresh, fingerprint: "old" } }]]) });
    expect(h.result.current.step.kind).toBe("dumpScoring");
    h.update({ scores: new Map([["r", { state: "scoring", result: fresh }]]) });
    expect(h.result.current.step.kind).toBe("dumpScoring");
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
    expect(h.result.current.step.kind).toBe("dumpScoring");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const addedId = h.opts().cv.experience[0]!.bullets[2]!.id;
    expect(h.result.current.step).toMatchObject({ kind: "proposal", bulletId: addedId });
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
  it("close immediately calls onClose and collects facts only after changed notes", async () => {
    const h = mount();
    await submit(h);
    h.dispatch.mockClear();
    act(() => h.result.current.close());
    expect(h.opts().onClose).toHaveBeenCalledTimes(1);
    await settle();
    expect(api.roleFacts).toHaveBeenCalledWith("r");
    expect(h.dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "setFacts", roleId: "r",
      facts: { items: ["Used Python"], fromNotes: hashText("notes"), updatedAt: expect.any(String) },
    });
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

import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience, type Question, type RewriteEvent, type RoleResult } from "@resumora/shared";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";
import { HelperPanel } from "../panel/HelperPanel.tsx";
import { useWaitForSave, type SaveStatus } from "../useAutosave.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }));
vi.mock("../../lib/supabase.ts", () => ({ supabase: { auth } }));
const api = vi.hoisted(() => ({ streamRewrite: vi.fn(), createVoiceSession: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { QuestionFlow } from "./QuestionFlow.tsx";
import { RewriteReview } from "./RewriteReview.tsx";

function role(over: Partial<Experience> = {}): Experience {
  return {
    id: "r1",
    company: "Acme",
    title: "Dev",
    location: "",
    startDate: "2020-03",
    endDate: "",
    current: false,
    description: "",
    bullets: [
      { id: "b1", text: "Did various tasks" },
      { id: "b2", text: "Helped with suppliers" },
      { id: "b3", text: "Ran the weekly rota" },
    ],
    notes: [],
    ...over,
  };
}
const cvWith = (r: Experience = role()): CvContent => ({ ...emptyCv(), experience: [r] });

const questions: Question[] = [
  { bulletId: "b1", text: "Which tasks did you do?", options: ["Invoices", "Orders"] },
  { bulletId: "b2", text: "How many suppliers?", options: ["Under 10", "10–50"] },
];

/** A fake event stream: `emit` plays a server event, `controllers` are the aborts handed out. */
function fakeStream() {
  const s = { emit: (_e: RewriteEvent) => {}, controllers: [] as AbortController[] };
  api.streamRewrite.mockImplementation((_path: string, _body: unknown, onEvent: (e: RewriteEvent) => void) => {
    s.emit = (e) => act(() => onEvent(e));
    const c = new AbortController();
    s.controllers.push(c);
    return c;
  });
  return s;
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } }, error: null });
  auth.refreshSession.mockResolvedValue({ data: { session: { access_token: "token-2" } }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("question flow", () => {
  function flow(waitForSave = vi.fn(() => Promise.resolve())) {
    const dispatch = vi.fn<(a: CvAction) => void>();
    const onDraft = vi.fn();
    render(<QuestionFlow role={role()} questions={questions} dispatch={dispatch} waitForSave={waitForSave} onDraft={onDraft} />);
    return { dispatch, onDraft, waitForSave };
  }

  it("shows one question at a time, each with an answer box", () => {
    flow();
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Which tasks did you do?")).toBeInTheDocument();
    expect(screen.queryByText("How many suppliers?")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your answer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invoices" })).toBeInTheDocument();
  });

  it("Save answer saves a note with the question, the answer and how it was given", async () => {
    const user = userEvent.setup();
    const { dispatch } = flow();
    await user.click(screen.getByRole("button", { name: "Invoices" }));
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), " for 3 carriers");
    await user.click(screen.getByRole("button", { name: "Save answer" }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0]![0];
    expect(action).toMatchObject({
      type: "setNote",
      roleId: "r1",
      note: { question: "Which tasks did you do?", answer: "Invoices for 3 carriers", via: ["pick", "type"] },
    });
    if (action.type !== "setNote") throw new Error("expected setNote");
    expect(action.note.id).toMatch(/\S/);
    expect(Number.isNaN(Date.parse(action.note.askedAt))).toBe(false);
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue("");
  });

  it("Save answer waits until there is an answer", () => {
    flow();
    expect(screen.getByRole("button", { name: "Save answer" })).toBeDisabled();
  });

  it("Skip saves nothing and moves on", async () => {
    const user = userEvent.setup();
    const { dispatch } = flow();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("How many suppliers?")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("after the last question, Draft improved bullets waits for the save, then opens the review", async () => {
    const user = userEvent.setup();
    let saved = () => {};
    const waitForSave = vi.fn(() => new Promise<void>((resolve) => (saved = resolve)));
    const { onDraft } = flow(waitForSave);
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Invoices");
    await user.click(screen.getByRole("button", { name: "Save answer" }));
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Thanks. 1 answer saved.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Draft improved bullets" }));
    expect(waitForSave).toHaveBeenCalled();
    expect(onDraft).not.toHaveBeenCalled();
    expect(screen.getByText(/Drafting/)).toBeInTheDocument();
    await act(async () => saved());
    expect(onDraft).toHaveBeenCalledTimes(1);
  });
});

/** The review over a real reducer, with an undo stack so one undo step can be checked. */
function ReviewHarness({ initial, onAction, onClose }: { initial: CvContent; onAction(a: CvAction): void; onClose(): void }) {
  const [h, setH] = useState<{ past: CvContent[]; cv: CvContent }>({ past: [], cv: initial });
  const dispatch = (a: CvAction) => {
    onAction(a);
    setH((s) => {
      const next = cvReducer(s.cv, a);
      return next === s.cv ? s : { past: [...s.past, s.cv], cv: next };
    });
  };
  const undo = () => setH((s) => (s.past.length ? { past: s.past.slice(0, -1), cv: s.past.at(-1)! } : s));
  return (
    <>
      <ul data-testid="bullets">
        {h.cv.experience[0]!.bullets.map((b) => (
          <li key={b.id}>{b.text}</li>
        ))}
      </ul>
      <button type="button" onClick={undo}>
        Undo
      </button>
      <RewriteReview role={h.cv.experience[0]!} dispatch={dispatch} onClose={onClose} />
    </>
  );
}

function review(initial = cvWith()) {
  const stream = fakeStream();
  const onAction = vi.fn<(a: CvAction) => void>();
  const onClose = vi.fn();
  const view = render(<ReviewHarness initial={initial} onAction={onAction} onClose={onClose} />);
  return { stream, onAction, onClose, view };
}
const bulletTexts = () => within(screen.getByTestId("bullets")).getAllByRole("listitem").map((li) => li.textContent);
const proposal = (text: string) => screen.getByText(text).closest(".prop") as HTMLElement;

describe("rewrite review", () => {
  it("asks for the role's rewrite and shows Drafting until the first proposal starts", () => {
    const { stream } = review();
    expect(api.streamRewrite).toHaveBeenCalledWith("/v1/enrich/rewrite-role", { roleId: "r1" }, expect.any(Function));
    expect(screen.getByText(/Drafting/)).toBeInTheDocument();
    stream.emit({ event: "start", data: { index: 0, replaces: "b1" } });
    expect(screen.queryByText(/Drafting/)).not.toBeInTheDocument();
  });

  it("streams text muted under its original bullet, or as New bullet, with no buttons", () => {
    const { stream } = review();
    stream.emit({ event: "start", data: { index: 0, replaces: "b1" } });
    stream.emit({ event: "delta", data: { index: 0, text: "Processed " } });
    stream.emit({ event: "delta", data: { index: 0, text: "invoices" } });
    const p = proposal("Processed invoices");
    expect(p).toHaveClass("streaming");
    expect(within(p).getByText("Did various tasks")).toBeInTheDocument();
    expect(within(p).queryByRole("button")).not.toBeInTheDocument();
    stream.emit({ event: "start", data: { index: 1, replaces: null } });
    stream.emit({ event: "delta", data: { index: 1, text: "Trained staff" } });
    expect(within(proposal("Trained staff")).getByText("New bullet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use this" })).not.toBeInTheDocument();
  });

  it("ready shows Use this and Keep mine", () => {
    const { stream } = review();
    stream.emit({ event: "start", data: { index: 0, replaces: "b1" } });
    stream.emit({ event: "delta", data: { index: 0, text: "Processed invoices" } });
    stream.emit({ event: "ready", data: { index: 0, text: "Processed carrier invoices" } });
    const p = proposal("Processed carrier invoices");
    expect(p).not.toHaveClass("streaming");
    expect(within(p).getByRole("button", { name: "Use this" })).toBeInTheDocument();
    expect(within(p).getByRole("button", { name: "Keep mine" })).toBeInTheDocument();
  });

  it("a dropped proposal shows why in plain words, with no buttons", () => {
    const { stream } = review();
    stream.emit({ event: "start", data: { index: 0, replaces: "b1" } });
    stream.emit({ event: "delta", data: { index: 0, text: "Cut time by 45%" } });
    stream.emit({ event: "dropped", data: { index: 0, reason: "number" } });
    const p = proposal("Cut time by 45%");
    expect(p).toHaveClass("dropped");
    expect(within(p).getByText("Left out: it added a number you didn't give us")).toBeInTheDocument();
    expect(within(p).queryByRole("button")).not.toBeInTheDocument();
  });

  it("Use this on one, then Done, applies just that one in one action", async () => {
    const user = userEvent.setup();
    const { stream, onAction, onClose } = review();
    for (const [i, id] of ["b1", "b2"].entries()) {
      stream.emit({ event: "start", data: { index: i, replaces: id } });
      stream.emit({ event: "ready", data: { index: i, text: `New ${id}` } });
    }
    stream.emit({ event: "done", data: {} });
    await user.click(within(proposal("New b1")).getByRole("button", { name: "Use this" }));
    await user.click(within(proposal("New b2")).getByRole("button", { name: "Keep mine" }));
    expect(onAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ type: "applyProposals", roleId: "r1", accepted: [{ replaces: "b1", text: "New b1" }] });
    expect(bulletTexts()).toEqual(["New b1", "Helped with suppliers", "Ran the weekly rota"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("Use all applies only ready ones in one action, and one undo restores every bullet", async () => {
    const user = userEvent.setup();
    const { stream, onAction } = review();
    stream.emit({ event: "start", data: { index: 0, replaces: "b1" } });
    stream.emit({ event: "ready", data: { index: 0, text: "New b1" } });
    stream.emit({ event: "start", data: { index: 1, replaces: "b2" } });
    stream.emit({ event: "dropped", data: { index: 1, reason: "number" } });
    stream.emit({ event: "start", data: { index: 2, replaces: "b3" } });
    stream.emit({ event: "ready", data: { index: 2, text: "New b3" } });
    stream.emit({ event: "start", data: { index: 3, replaces: null } });
    stream.emit({ event: "delta", data: { index: 3, text: "Still writing" } });
    await user.click(screen.getByRole("button", { name: /Use all/ }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: "applyProposals",
      roleId: "r1",
      accepted: [
        { replaces: "b1", text: "New b1" },
        { replaces: "b3", text: "New b3" },
      ],
    });
    expect(bulletTexts()).toEqual(["New b1", "Helped with suppliers", "New b3"]);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(bulletTexts()).toEqual(["Did various tasks", "Helped with suppliers", "Ran the weekly rota"]);
    // Done afterwards does not apply them a second time.
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("a stream error keeps ready proposals usable and offers Try again", async () => {
    const user = userEvent.setup();
    const { stream } = review();
    stream.emit({ event: "start", data: { index: 0, replaces: "b1" } });
    stream.emit({ event: "ready", data: { index: 0, text: "New b1" } });
    stream.emit({ event: "start", data: { index: 1, replaces: "b2" } });
    stream.emit({ event: "delta", data: { index: 1, text: "Half writ" } });
    stream.emit({ event: "error", data: { code: "stream_broken", message: "The stream stopped." } });
    expect(within(proposal("New b1")).getByRole("button", { name: "Use this" })).toBeInTheDocument();
    expect(within(proposal("Half writ")).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/The rest didn't come through\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(api.streamRewrite).toHaveBeenCalledTimes(2);
    expect(stream.controllers[0]!.signal.aborted).toBe(true);
  });

  it("Back to score keeps what was chosen, like Done", async () => {
    const user = userEvent.setup();
    const { stream, onAction, onClose } = review();
    stream.emit({ event: "start", data: { index: 0, replaces: "b2" } });
    stream.emit({ event: "ready", data: { index: 0, text: "New b2" } });
    await user.click(screen.getByRole("button", { name: "Use this" }));
    expect(within(proposal("New b2")).getByText("✓ Used")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "← Back to score" }));
    expect(onAction).toHaveBeenCalledWith({ type: "applyProposals", roleId: "r1", accepted: [{ replaces: "b2", text: "New b2" }] });
    expect(onClose).toHaveBeenCalled();
  });

  it("Try again keeps the proposals already used", async () => {
    const user = userEvent.setup();
    const { stream, onAction } = review();
    stream.emit({ event: "start", data: { index: 0, replaces: "b1" } });
    stream.emit({ event: "ready", data: { index: 0, text: "New b1" } });
    await user.click(screen.getByRole("button", { name: "Use this" }));
    stream.emit({ event: "error", data: { code: "stream_broken", message: "x" } });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    stream.emit({ event: "start", data: { index: 0, replaces: "b3" } });
    stream.emit({ event: "ready", data: { index: 0, text: "New b3" } });
    expect(screen.getByText("New b1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use this" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: "applyProposals",
      roleId: "r1",
      accepted: [
        { replaces: "b1", text: "New b1" },
        { replaces: "b3", text: "New b3" },
      ],
    });
  });

  it("unmounting aborts the stream", () => {
    const { stream, view } = review();
    expect(stream.controllers[0]!.signal.aborted).toBe(false);
    view.unmount();
    expect(stream.controllers[0]!.signal.aborted).toBe(true);
  });

  it("done with nothing ready says it couldn't improve without adding facts", () => {
    const { stream } = review();
    stream.emit({ event: "start", data: { index: 0, replaces: "b1" } });
    stream.emit({ event: "dropped", data: { index: 0, reason: "unchanged" } });
    stream.emit({ event: "done", data: {} });
    expect(screen.getByText("Couldn't improve this without adding facts. Try answering a question first.")).toBeInTheDocument();
  });
});

describe("role tools", () => {
  const scoreOf = (qs: Question[]): RoleScoreState => {
    const result: RoleResult = {
      roleId: "r1",
      policy: "score/1",
      fingerprint: "x",
      score: 40,
      bullets: ["b1", "b2", "b3"].map((id) => ({
        id,
        score: 40,
        contribution: "partial",
        clarity: "partial",
        specificity: "partial",
        impact: "partial",
        issue: "specificity",
        tip: null,
        question: null,
      })),
      nextStep: null,
      questions: qs,
    };
    return { state: "ready", result };
  };

  function Panel({ qs, waitForSave }: { qs: Question[]; waitForSave(): Promise<void> }) {
    const [cv, setCv] = useState(cvWith());
    return (
      <HelperPanel
        cv={cv}
        dispatch={(a) => setCv((c) => cvReducer(c, a))}
        focus={{ key: "experience", itemId: "r1" }}
        onBack={() => {}}
        onFocusField={() => {}}
        onFocusPage={() => {}}
        opened={new Set()}
        onOpen={() => {}}
        scores={new Map([["r1", scoreOf(qs)]])}
        waitForSave={waitForSave}
      />
    );
  }

  it("Rewrite bullets waits for the save, then opens the review; Back to score returns", async () => {
    const user = userEvent.setup();
    fakeStream();
    let saved = () => {};
    const waitForSave = vi.fn(() => new Promise<void>((resolve) => (saved = resolve)));
    render(<Panel qs={[]} waitForSave={waitForSave} />);
    await user.click(screen.getByRole("button", { name: "Rewrite bullets" }));
    expect(screen.getByText(/Drafting/)).toBeInTheDocument();
    expect(api.streamRewrite).not.toHaveBeenCalled();
    await act(async () => saved());
    expect(api.streamRewrite).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Rewrite bullets" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "← Back to score" }));
    expect(screen.getByRole("button", { name: "Rewrite bullets" })).toBeInTheDocument();
  });

  it("Answer questions opens the questions in place of the card", async () => {
    const user = userEvent.setup();
    render(<Panel qs={questions} waitForSave={() => Promise.resolve()} />);
    await user.click(screen.getByRole("button", { name: "Answer 2 questions" }));
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rewrite bullets" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "← Back to score" }));
    expect(screen.getByRole("button", { name: "Rewrite bullets" })).toBeInTheDocument();
  });
});

describe("waitForSave", () => {
  it("resolves at once when everything is saved", async () => {
    const { result } = renderHook(() => useWaitForSave("saved"));
    await expect(result.current.waitForSave()).resolves.toBeUndefined();
  });

  it("after an edit, resolves on the next save", async () => {
    const { result, rerender } = renderHook(({ status }: { status: SaveStatus }) => useWaitForSave(status), {
      initialProps: { status: "saved" },
    });
    result.current.markEdited();
    let done = false;
    void result.current.waitForSave().then(() => (done = true));
    rerender({ status: "dirty" });
    rerender({ status: "saving" });
    await act(async () => {});
    expect(done).toBe(false);
    rerender({ status: "saved" });
    await act(async () => {});
    expect(done).toBe(true);
  });

  it("gives up waiting after 15 s", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWaitForSave("error"));
    let done = false;
    void result.current.waitForSave().then(() => (done = true));
    await act(async () => vi.advanceTimersByTimeAsync(14_999));
    expect(done).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(done).toBe(true);
  });
});

/** The real `streamRewrite`, against a fake fetch. */
describe("streamRewrite", () => {
  const actual = () => vi.importActual<typeof import("./enrich-api.ts")>("./enrich-api.ts");
  const enc = new TextEncoder();
  function sse(chunks: string[], fail = false) {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch));
        if (fail) c.error(new Error("connection reset"));
        else c.close();
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }
  async function run(response: Response | (() => Response), path = "/v1/enrich/rewrite-role") {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => (typeof response === "function" ? response() : response));
    vi.stubGlobal("fetch", fetchMock);
    const { streamRewrite } = await actual();
    const events: RewriteEvent[] = [];
    let finish = () => {};
    const ended = new Promise<void>((r) => (finish = r));
    streamRewrite(path, { roleId: "r1" }, (e) => {
      events.push(e);
      if (e.event === "done" || e.event === "error") finish();
    });
    await ended;
    return { events, fetchMock };
  }

  it("reads frames split across chunks, skips invalid ones, and sends the token", async () => {
    const { events, fetchMock } = await run(
      sse([
        'event: start\ndata: {"index":0,"replaces":"b1"}\n\nevent: del',
        'ta\ndata: {"index":0,"text":"Hi"}\n\n',
        'event: delta\ndata: {"index":"x"}\n\nevent: nonsense\ndata: {}\n\nevent: ready\ndata: not json\n\n',
        'event: ready\r\ndata: {"index":0,"text":"Hi there"}\r\n\r\nevent: done\ndata: {}\n\n',
      ]),
    );
    expect(events).toEqual([
      { event: "start", data: { index: 0, replaces: "b1" } },
      { event: "delta", data: { index: 0, text: "Hi" } },
      { event: "ready", data: { index: 0, text: "Hi there" } },
      { event: "done", data: {} },
    ]);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer token-1");
    expect(init.body).toBe(JSON.stringify({ roleId: "r1" }));
  });

  it("a reader error after the start becomes stream_broken", async () => {
    const { events } = await run(sse(['event: start\ndata: {"index":0,"replaces":null}\n\n'], true));
    expect(events.at(-1)).toEqual({ event: "error", data: { code: "stream_broken", message: expect.any(String) } });
  });

  it("a stream that ends without done becomes stream_broken", async () => {
    const { events } = await run(sse(['event: start\ndata: {"index":0,"replaces":null}\n\n']));
    expect(events.at(-1)?.event).toBe("error");
    expect(events.at(-1)?.data).toMatchObject({ code: "stream_broken" });
  });

  it("a JSON error before the stream maps to the server's code", async () => {
    const body = { error: { code: "not_saved", message: "Save first.", requestId: "req-1" } };
    const { events } = await run(new Response(JSON.stringify(body), { status: 409, headers: { "content-type": "application/json" } }));
    expect(events).toEqual([{ event: "error", data: { code: "not_saved", message: "Save first." } }]);
  });

  it("refreshes an expired token once, like every other call", async () => {
    let calls = 0;
    const { events, fetchMock } = await run(() =>
      ++calls === 1 ? new Response(null, { status: 401 }) : sse(["event: done\ndata: {}\n\n"]),
    );
    expect(events).toEqual([{ event: "done", data: {} }]);
    expect(new Headers((fetchMock.mock.calls[1]![1] as RequestInit).headers).get("authorization")).toBe("Bearer token-2");
  });

  it("aborting is silent", async () => {
    let cancel = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('event: start\ndata: {"index":0,"replaces":null}\n\n'));
        cancel = () => c.error(new DOMException("aborted", "AbortError"));
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const { streamRewrite } = await actual();
    const events: RewriteEvent[] = [];
    const ctrl = streamRewrite("/v1/enrich/rewrite-role", { roleId: "r1" }, (e) => events.push(e));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    ctrl.abort();
    cancel();
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toHaveLength(1);
  });
});

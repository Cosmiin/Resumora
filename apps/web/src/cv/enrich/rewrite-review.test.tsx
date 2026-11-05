import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type RewriteEvent } from "@resumora/shared";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";

const api = vi.hoisted(() => ({ streamRewrite: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { RewriteReview } from "./RewriteReview.tsx";

const initial: CvContent = {
  ...emptyCv(),
  experience: [
    {
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
    },
  ],
};

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

/** The review over a real reducer, with an undo stack so one undo step can be checked. */
function Harness({ onAction, onClose }: { onAction(a: CvAction): void; onClose(): void }) {
  const [h, setH] = useState<{ past: CvContent[]; cv: CvContent }>({ past: [], cv: initial });
  const dispatch = (a: CvAction) => {
    onAction(a);
    setH((s) => {
      const next = cvReducer(s.cv, a);
      return next === s.cv ? s : { past: [...s.past, s.cv], cv: next };
    });
  };
  const undo = () => setH((s) => (s.past.length ? { past: s.past.slice(0, -1), cv: s.past.at(-1)! } : s));
  const removeB2 = () => dispatch({ type: "joinBullet", owner: { list: "experience", itemId: "r1" }, bulletId: "b2" });
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
      <button type="button" onClick={removeB2}>
        Remove b2
      </button>
      <div data-testid="review">
        <RewriteReview role={h.cv.experience[0]!} dispatch={dispatch} onClose={onClose} />
      </div>
    </>
  );
}

function review() {
  const stream = fakeStream();
  const onAction = vi.fn<(a: CvAction) => void>();
  const onClose = vi.fn();
  const view = render(<Harness onAction={onAction} onClose={onClose} />);
  return { stream, onAction, onClose, view, user: userEvent.setup() };
}
const bulletTexts = () => within(screen.getByTestId("bullets")).getAllByRole("listitem").map((li) => li.textContent);
const inReview = () => within(screen.getByTestId("review"));
const proposal = (text: string) => inReview().getByText(text).closest(".prop") as HTMLElement;
const ready = (stream: ReturnType<typeof fakeStream>, index: number, replaces: string | null, text: string) => {
  stream.emit({ event: "start", data: { index, replaces } });
  stream.emit({ event: "ready", data: { index, text } });
};
const apply = (accepted: { replaces: string | null; text: string }[]) => ({ type: "applyProposals", roleId: "r1", accepted });

beforeEach(() => vi.resetAllMocks());

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

  it("Use this applies that one proposal at once; Done and unmounting apply nothing more", async () => {
    const { stream, onAction, onClose, user, view } = review();
    ready(stream, 0, "b1", "New b1");
    ready(stream, 1, "b2", "New b2");
    stream.emit({ event: "done", data: {} });
    await user.click(within(proposal("New b1")).getByRole("button", { name: "Use this" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(apply([{ replaces: "b1", text: "New b1" }]));
    expect(within(proposal("New b1")).getByText("✓ Used")).toBeInTheDocument();
    expect(bulletTexts()).toEqual(["New b1", "Helped with suppliers", "Ran the weekly rota"]);
    await user.click(within(proposal("New b2")).getByRole("button", { name: "Keep mine" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
    view.unmount();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("Back to score only closes the view", async () => {
    const { stream, onAction, onClose, user } = review();
    ready(stream, 0, "b2", "New b2");
    await user.click(screen.getByRole("button", { name: "← Back to score" }));
    expect(onClose).toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("Use all applies the ready ones not yet used in one action, and one undo restores them", async () => {
    const { stream, onAction, user } = review();
    ready(stream, 0, "b1", "New b1");
    stream.emit({ event: "start", data: { index: 1, replaces: "b2" } });
    stream.emit({ event: "dropped", data: { index: 1, reason: "number" } });
    ready(stream, 2, "b3", "New b3");
    ready(stream, 3, null, "Extra bullet");
    stream.emit({ event: "start", data: { index: 4, replaces: null } });
    stream.emit({ event: "delta", data: { index: 4, text: "Still writing" } });
    await user.click(within(proposal("Extra bullet")).getByRole("button", { name: "Use this" }));
    onAction.mockClear();
    await user.click(screen.getByRole("button", { name: /Use all/ }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(apply([{ replaces: "b1", text: "New b1" }, { replaces: "b3", text: "New b3" }]));
    expect(bulletTexts()).toEqual(["New b1", "Helped with suppliers", "New b3", "Extra bullet"]);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(bulletTexts()).toEqual(["Did various tasks", "Helped with suppliers", "Ran the weekly rota", "Extra bullet"]);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("a proposal whose bullet was removed says so and has no buttons", async () => {
    const { stream, user } = review();
    ready(stream, 0, "b2", "New b2");
    await user.click(screen.getByRole("button", { name: "Remove b2" }));
    const p = proposal("New b2");
    expect(within(p).getByText("This bullet was removed")).toBeInTheDocument();
    expect(within(p).queryByRole("button")).not.toBeInTheDocument();
  });

  it("a stream error keeps ready proposals usable and offers Try again", async () => {
    const { stream, user } = review();
    ready(stream, 0, "b1", "New b1");
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

  it("Try again keeps ready and used proposals and skips repeats of them", async () => {
    const { stream, user } = review();
    ready(stream, 0, "b1", "New b1");
    ready(stream, 1, "b2", "New b2");
    ready(stream, 2, null, "Extra bullet");
    await user.click(within(proposal("New b1")).getByRole("button", { name: "Use this" }));
    stream.emit({ event: "error", data: { code: "stream_broken", message: "x" } });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    ready(stream, 0, "b1", "Other b1");
    ready(stream, 1, "b2", "Other b2");
    ready(stream, 2, "b3", "New b3");
    ready(stream, 3, null, "Extra bullet");
    stream.emit({ event: "done", data: {} });
    expect(inReview().getByText("New b1")).toBeInTheDocument();
    expect(inReview().getByText("New b2")).toBeInTheDocument();
    expect(inReview().getByText("New b3")).toBeInTheDocument();
    expect(inReview().queryByText("Other b1")).not.toBeInTheDocument();
    expect(inReview().queryByText("Other b2")).not.toBeInTheDocument();
    expect(inReview().getAllByText("Extra bullet")).toHaveLength(1);
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

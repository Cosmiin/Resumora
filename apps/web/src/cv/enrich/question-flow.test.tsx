import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type Experience, type Question, type RoleResult } from "@resumora/shared";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";
import { HelperPanel } from "../panel/HelperPanel.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

const api = vi.hoisted(() => ({ streamRewrite: vi.fn(), createVoiceSession: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);
/** Voice the test moves by hand: `voice.set` changes its state. */
const voice = vi.hoisted(() => ({ set: (_s: string) => {}, onFinal: () => {} }));
vi.mock("./useVoice.ts", async () => {
  const { useState } = await import("react");
  return {
    useVoice: () => {
      const [state, setState] = useState("idle");
      voice.set = setState;
      return { state, partial: "", seconds: 0, interrupted: false, start: () => setState("recording"), stop: () => setState("stopping"), onFinal: voice.onFinal };
    },
  };
});

import { QuestionFlow } from "./QuestionFlow.tsx";

function role(): Experience {
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
    ],
    notes: [],
  };
}

const questions: Question[] = [
  { bulletId: "b1", text: "Which tasks did you do?", options: ["Invoices", "Orders"], kind: "detail" },
  { bulletId: "b2", text: "How many suppliers?", options: ["Under 10", "10–50"], kind: "result" },
];

beforeEach(() => {
  vi.resetAllMocks();
  api.streamRewrite.mockImplementation(() => new AbortController());
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(screen.getByText('About: "Did various tasks"')).toBeInTheDocument();
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

  it("Save answer and Skip wait while voice is recording or finishing the last words", async () => {
    const user = userEvent.setup();
    flow();
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Invoices");
    await user.click(screen.getByRole("button", { name: "Answer by speaking" }));
    expect(screen.getByRole("button", { name: "Save answer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Stop recording" }));
    expect(screen.getByRole("button", { name: "Save answer" })).toBeDisabled();
    act(() => voice.set("idle"));
    expect(screen.getByRole("button", { name: "Save answer" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Skip" })).toBeEnabled();
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

describe("role tools", () => {
  const scoreOf = (qs: Question[]): RoleScoreState => {
    const result: RoleResult = {
      roleId: "r1",
      policy: "score/2",
      fingerprint: "x",
      score: 40,
      bullets: ["b1", "b2"].map((id) => ({
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
    const [cv, setCv] = useState({ ...emptyCv(), experience: [role()] });
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

  it("an answered question is not offered again, in the count or the flow", async () => {
    const user = userEvent.setup();
    render(<Panel qs={questions} waitForSave={() => Promise.resolve()} />);
    await user.click(screen.getByRole("button", { name: "Answer 2 questions" }));
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Invoices");
    await user.click(screen.getByRole("button", { name: "Save answer" }));
    await user.click(screen.getByRole("button", { name: "← Back to score" }));
    await user.click(screen.getByRole("button", { name: "Answer 1 question" }));
    expect(screen.getByText("Question 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("How many suppliers?")).toBeInTheDocument();
  });
});

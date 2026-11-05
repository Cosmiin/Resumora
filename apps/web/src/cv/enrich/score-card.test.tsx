import { useReducer, useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import { EditablePage } from "../edit/EditablePage.tsx";
import { cvReducer } from "../edit/cvReducer.ts";
import { useFocusAfterRender } from "../edit/useFocusAfterRender.ts";
import { useFocusSection } from "../edit/useFocusSection.ts";
import { useOpenedSections } from "../edit/useOpenedSections.ts";
import { HelperPanel } from "../panel/HelperPanel.tsx";
import { ScoreCard } from "./ScoreCard.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

function role(over: Partial<Experience> = {}): Experience {
  return {
    id: "r1",
    company: "Acme",
    title: "Dev",
    location: "",
    startDate: "2020-03",
    endDate: "2021-01",
    current: false,
    description: "",
    bullets: [
      { id: "b1", text: "Did various tasks" },
      { id: "b2", text: "Cut waiting time by 20 minutes" },
      { id: "b3", text: "Ran the weekly rota" },
      { id: "b4", text: "Trained new starters" },
      { id: "b5", text: "Built the intake form" },
    ],
    notes: [],
    ...over,
  };
}

function result(over: Partial<RoleResult> = {}): RoleResult {
  const scores = [30, 80, 90, 76, 40];
  return {
    roleId: "r1",
    policy: "score/1",
    fingerprint: "x",
    score: 62,
    bullets: scores.map((score, i) => ({
      id: `b${i + 1}`,
      score,
      contribution: "specific",
      clarity: "specific",
      specificity: "partial",
      impact: "partial",
      issue: score < 75 ? "specificity" : "none",
      tip: i === 0 ? "Name the tasks you did." : null,
      question: null,
    })),
    nextStep: { bulletId: "b1", issue: "specificity", tip: "Name the tasks you did." },
    questions: [{ bulletId: "b1", text: "Which tasks?", options: ["Rota", "Orders"] }],
    ...over,
  };
}
const ready = (r = result()): RoleScoreState => ({ state: "ready", result: r });

function card(score: RoleScoreState, r: Experience = role()) {
  const fns = { onAnswer: vi.fn(), onRewrite: vi.fn(), onRetry: vi.fn() };
  render(<ScoreCard role={r} score={score} {...fns} />);
  return fns;
}

describe("score card", () => {
  it("shows the number, the band and how many bullets are clear", () => {
    card(ready());
    expect(screen.getByText("62")).toBeInTheDocument();
    expect(screen.getByText("A good start")).toBeInTheDocument();
    expect(screen.getByText("3 of 5 bullets clear")).toBeInTheDocument();
  });

  it("shows at most two tips: the next step, then the first format tip", () => {
    const r = role({ bullets: [{ id: "b1", text: "I did various tasks" }, ...role().bullets.slice(1)], title: "" });
    card(ready(), r);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Name the tasks you did.");
    expect(items[1]).toHaveTextContent(/Drop "I" and "my"/);
  });

  it("uses the plain tip for the issue when the model gave none", () => {
    card(ready(result({ nextStep: { bulletId: "b1", issue: "impact", tip: null } })));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Add the result: what changed, by how much, or why it mattered.");
  });

  it("hides the Answer button when there are none, and always offers Rewrite bullets", async () => {
    const fns = card(ready(result({ questions: [] })));
    expect(screen.queryByRole("button", { name: /^Answer/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Rewrite bullets" }));
    expect(fns.onRewrite).toHaveBeenCalled();
  });

  it("counts the questions on the Answer button", async () => {
    const fns = card(ready());
    await userEvent.click(screen.getByRole("button", { name: "Answer 1 question" }));
    expect(fns.onAnswer).toHaveBeenCalled();
  });

  it("uses the plural for several questions", () => {
    const q = { bulletId: "b1", text: "Which tasks?", options: [] };
    card(ready(result({ questions: [q, q, q] })));
    expect(screen.getByRole("button", { name: "Answer 3 questions" })).toBeInTheDocument();
  });

  it("says the score is unavailable and offers Try again", async () => {
    const fns = card({ state: "unavailable" });
    expect(screen.getByText("Score unavailable")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(fns.onRetry).toHaveBeenCalled();
  });

  it("asks for bullets when the role has none", () => {
    card({ state: "none" }, role({ bullets: [] }));
    expect(screen.getByText("Add bullets to get a score")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rewrite bullets" })).toBeNull();
  });
});

function Harness({ initial, scores }: { initial: CvContent; scores: Map<string, RoleScoreState> }) {
  const [cv, dispatch] = useReducer(cvReducer, initial);
  const page = useRef<HTMLDivElement>(null);
  const [opened, onOpen] = useOpenedSections();
  const focusLater = useFocusAfterRender(page);
  const [focus, clear] = useFocusSection(page);
  const toolsRoleId = focus?.key === "experience" ? focus.itemId : undefined;
  return (
    <>
      <div ref={page} tabIndex={-1} data-testid="page">
        <EditablePage cv={cv} dispatch={dispatch} opened={opened} onOpen={onOpen} scores={scores} toolsRoleId={toolsRoleId} />
      </div>
      <HelperPanel
        cv={cv}
        dispatch={dispatch}
        focus={focus}
        onBack={clear}
        onFocusField={focusLater}
        onFocusPage={() => page.current?.focus()}
        opened={opened}
        onOpen={onOpen}
        scores={scores}
        onRetry={() => undefined}
      />
    </>
  );
}

const cvOf = (...roles: Experience[]): CvContent => ({
  ...emptyCv(),
  basics: { ...emptyCv().basics, fullName: "Ada Lovelace", email: "ada@example.com", summary: "Maker." },
  experience: roles,
});

describe("weak bullet markers", () => {
  const scores = new Map([["r1", ready()]]);

  it("appear only on bullets below 75, and only while the role's tools are open", async () => {
    render(<Harness initial={cvOf(role())} scores={scores} />);
    expect(screen.queryAllByRole("button", { name: "Weak bullet" })).toHaveLength(0);
    await userEvent.click(screen.getByRole("textbox", { name: "Role title" }));
    const marks = screen.getAllByRole("button", { name: "Weak bullet" });
    expect(marks).toHaveLength(2); // 30 and 40; 76 is clear
    expect(marks[0]).toHaveAttribute("title", "Name the tasks you did.");
    expect(marks[1]).toHaveAttribute("title", "Name the tool, system, client or task so a reader can picture it.");
    const described = document.getElementById(marks[0]!.getAttribute("aria-describedby")!);
    expect(described).toHaveTextContent("Name the tasks you did.");
    expect(marks[0]).toHaveClass("weak-mark");
    expect(marks[0]).not.toHaveClass("mid"); // 30 is below 40
    expect(marks[1]).toHaveClass("mid"); // 40 is mid
    await userEvent.click(screen.getByRole("button", { name: "← All sections" }));
    expect(screen.queryAllByRole("button", { name: "Weak bullet" })).toHaveLength(0);
  });

  it("clicking a marker shows and hides its tip", async () => {
    render(<Harness initial={cvOf(role())} scores={scores} />);
    await userEvent.click(screen.getByRole("textbox", { name: "Role title" }));
    const mark = screen.getAllByRole("button", { name: "Weak bullet" })[0]!;
    const tip = document.getElementById(mark.getAttribute("aria-describedby")!)!;
    expect(mark).toHaveAttribute("aria-expanded", "false");
    expect(tip).not.toHaveClass("is-open");
    await userEvent.click(mark);
    expect(mark).toHaveAttribute("aria-expanded", "true");
    expect(tip).toHaveClass("is-open");
    await userEvent.click(mark);
    expect(tip).not.toHaveClass("is-open");
  });

  it("show only on the role that is open", async () => {
    const other = role({ id: "r2", title: "Lead", bullets: [{ id: "c1", text: "Did things" }] });
    const both = new Map([...scores, ["r2", ready(result({ roleId: "r2", bullets: [{ ...result().bullets[0]!, id: "c1" }] }))]]);
    render(<Harness initial={cvOf(role(), other)} scores={both} />);
    await userEvent.click(screen.getAllByRole("textbox", { name: "Role title" })[1]!);
    expect(screen.getAllByRole("button", { name: "Weak bullet" })).toHaveLength(1);
  });
});

describe("Your roles", () => {
  const second = role({ id: "r2", title: "Lead", bullets: [{ id: "c1", text: "Led the team" }] });
  const empty = role({ id: "r3", title: "Intern", bullets: [] });
  const scores = new Map<string, RoleScoreState>([
    ["r1", ready()],
    ["r2", { state: "scoring" }],
    ["r3", { state: "none" }],
  ]);

  it("lists one row per role in CV order with pill, title and band", () => {
    render(<Harness initial={cvOf(role(), second, empty)} scores={scores} />);
    const rows = within(screen.getByText("Your roles").parentElement!).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Dev");
    expect(rows[0]).toHaveTextContent("62");
    expect(rows[0]).toHaveTextContent("A good start");
    expect(within(rows[0]!).getAllByRole("button")).toHaveLength(1);
    expect(within(rows[0]!).getByRole("button")).toHaveAccessibleName("Dev, score 62 of 100, A good start");
    expect(rows[1]).toHaveTextContent("Lead");
    expect(rows[1]).toHaveTextContent("…");
    expect(rows[2]).toHaveTextContent("Intern");
    expect(rows[2]).toHaveTextContent("Add bullets to get a score");
  });

  it("clicking a row focuses that role and the panel shows its tools", async () => {
    render(<Harness initial={cvOf(role(), second, empty)} scores={scores} />);
    const rows = within(screen.getByText("Your roles").parentElement!).getAllByRole("listitem");
    await userEvent.click(within(rows[1]!).getByRole("button", { name: /Lead/ }));
    expect(screen.getAllByRole("textbox", { name: "Role title" })[1]).toHaveFocus();
    expect(screen.getByRole("button", { name: "← All sections" })).toBeInTheDocument();
    expect(screen.getByText("Scoring this role", { selector: "strong" })).toBeInTheDocument();
  });
});

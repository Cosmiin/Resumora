import { useReducer } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, fingerprint, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import { en } from "../../i18n/en.ts";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";

const api = vi.hoisted(() => ({ improveBullet: vi.fn(), brainDump: vi.fn(), roleFacts: vi.fn(), scoreRole: vi.fn(), createVoiceSession: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { BulletList } from "../edit/BulletList.tsx";
import { CvDocument } from "../page/CvDocument.tsx";
import { FocusOpenProvider } from "./focus-context.ts";
import { FocusMode } from "./FocusMode.tsx";

const role: Experience = {
  id: "r1",
  company: "TransLog",
  title: "Dispatcher",
  location: "",
  startDate: "2019-01",
  endDate: "2023-01",
  current: false,
  description: "",
  bullets: [
    { id: "b1", text: "Responsible for planning routes for drivers." },
    { id: "b2", text: "Handled calls from customers about late deliveries." },
    { id: "b3", text: "Worked with the warehouse team on loading plans." },
  ],
  notes: [],
};
const cv: CvContent = { ...emptyCv(), experience: [role] };
const grade = (id: string, score: number) => ({
  id, score, contribution: "specific" as const, clarity: "specific" as const, specificity: score > 50 ? ("specific" as const) : ("missing" as const),
  impact: "missing" as const, issue: score > 50 ? ("impact" as const) : ("specificity" as const), tip: null, question: null,
});
const result: RoleResult = {
  roleId: "r1", policy: "score/2", fingerprint: fingerprint(role, "en"), score: 52,
  bullets: [grade("b1", 43), grade("b2", 56), grade("b3", 58)],
  nextStep: null,
  roleQuestions: [],
  questions: [{ bulletId: "b1", text: "Roughly how many drivers did you plan for each day?", options: ["Under 10", "10–50"], kind: "detail" }],
};
const proposal = { proposal: { bulletId: "b1", text: "Planned daily routes for 10–50 regional drivers." }, bulletBefore: 43, bulletAfter: 80, roleBefore: 52, roleAfter: 71, cached: true };

function Harness({ onAction, onClose = () => {}, roleResult = result }: { onAction?(a: CvAction): void; onClose?(): void; roleResult?: RoleResult }) {
  const [state, apply] = useReducer(cvReducer, cv);
  const dispatch = (a: CvAction) => {
    onAction?.(a);
    apply(a);
  };
  return (
    <>
      <p data-testid="saved-b1">{state.experience[0]?.bullets[0]?.text}</p>
      <FocusMode target={{ roleId: "r1", mode: "improve" }} cv={state} dispatch={dispatch} scores={new Map([["r1", { state: "ready", result: roleResult }]])} waitForSave={() => Promise.resolve()} onClose={onClose} />
    </>
  );
}

async function answerFirstQuestion() {
  await userEvent.click(screen.getByRole("button", { name: "10–50" }));
  await userEvent.click(screen.getByRole("button", { name: "Improve this bullet →" }));
}

function reducedMotion(on: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  vi.resetAllMocks();
  api.roleFacts.mockResolvedValue({ facts: [], fromNotes: "x" });
  api.scoreRole.mockRejectedValue(new Error("unavailable"));
  reducedMotion(false);
});
afterEach(() => vi.unstubAllGlobals());

describe("focus mode", () => {
  it("shows the score fetched on open while the background score is missing", async () => {
    api.scoreRole.mockResolvedValue({ ...result, score: 60 });
    render(<FocusMode target={{ roleId: "r1", mode: "improve" }} cv={cv} dispatch={() => {}}
      scores={new Map()} waitForSave={() => Promise.resolve()} onClose={() => {}} />);
    expect(await screen.findByRole("heading", { name: result.questions[0]!.text })).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
  });
  it("opens on role questions, saves answers without rewriting, then shows the first bullet", async () => {
    const actions: CvAction[] = [];
    const roleQuestions: RoleResult["roleQuestions"] = [
      { id: "rq1", text: "Who did you report to?", options: ["The CEO", "The owner", "A team lead"], kind: "role" },
      { id: "rq2", text: "Who did you work with?", options: ["Finance", "Customers", "Vendors"], kind: "role" },
    ];
    render(<Harness roleResult={{ ...result, roleQuestions }} onAction={(a) => actions.push(a)} />);
    expect(screen.getByText("About this role · 1 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "The CEO" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(actions[0]).toMatchObject({ type: "setNote", note: { question: "Who did you report to?", answer: "The CEO", via: ["pick"] } });
    expect(screen.getByText("About this role · 2 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: result.questions[0]!.text })).toBeInTheDocument();
    expect(api.improveBullet).not.toHaveBeenCalled();
    expect(api.brainDump).not.toHaveBeenCalled();
    expect(screen.queryByText("What else can you tell us about this?")).not.toBeInTheDocument();
  });
  it("shows the role on the left with the weakest bullet first and its question on the right", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "Improve your Dispatcher role" });
    expect(within(dialog).getByText("Question 1 of 3")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Roughly how many drivers did you plan for each day?" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Under 10" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "10\u201350" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Something else" })).toBeInTheDocument();
    const current = dialog.querySelector('[aria-current="true"]');
    expect(current).toHaveTextContent("Responsible for planning routes for drivers.");
    expect(within(dialog).getByText("52")).toBeInTheDocument();
  });

  it("Use this replaces the bullet in one dispatch, then celebrates with the returned numbers", async () => {
    api.improveBullet.mockResolvedValue(proposal);
    const actions: CvAction[] = [];
    render(<Harness onAction={(a) => actions.push(a)} />);
    await answerFirstQuestion();

    expect(await screen.findByText("Planned daily routes for 10–50 regional drivers.")).toBeInTheDocument();
    expect(screen.getByText("Responsible for planning routes for drivers.", { selector: "s" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use this" }));

    expect(actions.filter((a) => a.type === "replaceBullet")).toHaveLength(1);
    expect(screen.getByTestId("saved-b1")).toHaveTextContent("Planned daily routes for 10–50 regional drivers.");
    expect(screen.getByRole("heading", { name: "Up from 52. Nice work! 🎉" })).toBeInTheDocument();
    expect(screen.getByText("Your Dispatcher role is almost in the Clear band.")).toBeInTheDocument();
    expect(screen.getAllByTestId("confetti").length).toBeGreaterThan(0);
  });

  it("checks the fresh score after accepting an uncached proposal", async () => {
    api.improveBullet.mockResolvedValue({ ...proposal, cached: false });
    const actions: CvAction[] = [];
    render(<Harness onAction={(a) => actions.push(a)} />);
    await answerFirstQuestion();
    await userEvent.click(await screen.findByRole("button", { name: "Use this" }));
    expect(screen.getByRole("heading", { name: "Checking your new score…" })).toBeInTheDocument();
    expect(actions.filter((a) => a.type === "replaceBullet")).toHaveLength(1);
    expect(screen.getByTestId("saved-b1")).toHaveTextContent(proposal.proposal.text);
    expect(screen.queryAllByTestId("confetti")).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: /Nice work/ })).toBeNull();
  });

  it("with reduced motion, shows no confetti and the final score at once", async () => {
    reducedMotion(true);
    api.improveBullet.mockResolvedValue(proposal);
    render(<Harness />);
    await answerFirstQuestion();
    await userEvent.click(await screen.findByRole("button", { name: "Use this" }));
    expect(screen.queryAllByTestId("confetti")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(/^71/);
  });

  it("Keep mine moves on without a celebration or a change", async () => {
    api.improveBullet.mockResolvedValue(proposal);
    const actions: CvAction[] = [];
    render(<Harness onAction={(a) => actions.push(a)} />);
    await answerFirstQuestion();
    await userEvent.click(await screen.findByRole("button", { name: "Keep mine" }));
    expect(actions.some((a) => a.type === "replaceBullet")).toBe(false);
    expect(screen.queryByRole("heading", { name: /Nice work/ })).toBeNull();
    expect(screen.getByText("Bullet 2 of 3")).toBeInTheDocument();
  });

  it("needs more detail: shows the specific next question and option chips", async () => {
    api.improveBullet.mockResolvedValue({ needsDetail: true, nextQuestion: { text: "Which tools did you use?", options: ["Excel", "SAP", "Workday"] } });
    render(<Harness />);
    await answerFirstQuestion();
    expect(await screen.findByText("We need a bit more detail to improve this one.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Which tools did you use?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Something else" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveValue("");
    expect(screen.queryByText("What else can you tell us about this?")).not.toBeInTheDocument();
    expect(en).not.toHaveProperty("enrich.focus.followUpQuestion");
  });

  it("Esc closes focus mode and keeps the accepted bullet", async () => {
    api.improveBullet.mockResolvedValue(proposal);
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await answerFirstQuestion();
    await userEvent.click(await screen.findByRole("button", { name: "Use this" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("saved-b1")).toHaveTextContent("Planned daily routes for 10–50 regional drivers.");
    expect(api.roleFacts).toHaveBeenCalledWith("r1");
  });

  it("Esc still closes, and Tab comes back into the dialog, when focus has fallen to the page", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await userEvent.tab();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("✕ closes while a call is still running", async () => {
    api.improveBullet.mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await answerFirstQuestion();
    expect(await screen.findByText("Improving your bullet…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a role with one bullet and no role questions opens free talk, with prompts that do not fill the box", async () => {
    const thin = { ...role, bullets: [{ id: "b1", text: "Managed the office." }] };
    function Thin() {
      const [state, dispatch] = useReducer(cvReducer, { ...cv, experience: [thin] });
      return <FocusMode target={{ roleId: "r1", mode: "improve" }} cv={state} dispatch={dispatch} scores={new Map()} waitForSave={() => Promise.resolve()} onClose={() => {}} />;
    }
    render(<Thin />);
    expect(await screen.findByRole("heading", { name: "What did a normal week here look like?" })).toBeInTheDocument();
    expect(screen.getByText("+ new bullets will appear here")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What did you handle every day?" })).toBeNull();
    expect(screen.getByRole("button", { name: "Turn this into bullets →" })).toBeDisabled();
    await userEvent.type(await screen.findByLabelText("Your answer"), "I ran the front desk");
    expect(screen.getByRole("button", { name: "Turn this into bullets →" })).toBeEnabled();
  });
});

describe("focus mode edge cases", () => {
  it("keeps the ramble through a failed brain dump and Try again", async () => {
    const thin = { ...role, bullets: [{ id: "b1", text: "Managed the office." }] };
    function Thin() {
      const [state, dispatch] = useReducer(cvReducer, { ...cv, experience: [thin] });
      return <FocusMode target={{ roleId: "r1", mode: "improve" }} cv={state} dispatch={dispatch} scores={new Map()} waitForSave={() => Promise.resolve()} onClose={() => {}} />;
    }
    api.brainDump.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ proposals: [], roleBefore: null, roleAfterAll: null });
    render(<Thin />);
    await userEvent.type(await screen.findByLabelText("Your answer"), "I ran the front desk");
    await userEvent.click(screen.getByRole("button", { name: "Turn this into bullets →" }));
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/We couldn't find new bullets in that yet/)).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveValue("I ran the front desk");
  });

  it("the ramble cannot be changed while it is being turned into bullets", async () => {
    const thin = { ...role, bullets: [{ id: "b1", text: "Managed the office." }] };
    function Thin() {
      const [state, dispatch] = useReducer(cvReducer, { ...cv, experience: [thin] });
      return <FocusMode target={{ roleId: "r1", mode: "improve" }} cv={state} dispatch={dispatch} scores={new Map()} waitForSave={() => Promise.resolve()} onClose={() => {}} />;
    }
    api.brainDump.mockReturnValue(new Promise(() => {}));
    render(<Thin />);
    await userEvent.type(await screen.findByLabelText("Your answer"), "I ran the front desk");
    await userEvent.click(screen.getByRole("button", { name: "Turn this into bullets →" }));
    expect(await screen.findByRole("button", { name: "Turning this into bullets…" })).toBeDisabled();
    expect(screen.getByLabelText("Your answer")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Answer by speaking" })).toBeNull();
  });

  it("Skip on the brain dump advances past the already shown bullet question", async () => {
    api.improveBullet.mockReturnValue(new Promise(() => {}));
    const two = { ...role, bullets: role.bullets.slice(0, 2) };
    function Two() {
      const [state, dispatch] = useReducer(cvReducer, { ...cv, experience: [two] });
      return <FocusMode target={{ roleId: "r1", mode: "improve" }} cv={state} dispatch={dispatch} scores={new Map([["r1", { state: "ready", result: { ...result, fingerprint: fingerprint(two, "en") } }]])} waitForSave={() => Promise.resolve()} onClose={() => {}} />;
    }
    render(<Two />);
    expect(screen.getByRole("heading", { name: result.questions[0]!.text })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Questions not specific enough? Describe what you did there in your own words." }));
    expect(screen.getByRole("heading", { name: "What did a normal week here look like?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: "Improving your bullet…" })).toBeInTheDocument();
    expect(screen.getByRole("dialog").querySelector('[aria-current="true"]')).toHaveTextContent("Handled calls from customers about late deliveries.");
    expect(api.brainDump).not.toHaveBeenCalled();
  });

  it("✨ on a bullet already at 100 still opens on that bullet", async () => {
    api.improveBullet.mockResolvedValue({ needsDetail: true });
    const top: RoleResult = { ...result, bullets: [grade("b1", 43), grade("b2", 56), { ...grade("b3", 100), impact: "specific" as const, issue: "none" as const }] };
    render(<FocusMode target={{ roleId: "r1", bulletId: "b3", mode: "improve" }} cv={cv} dispatch={() => {}} scores={new Map([["r1", { state: "ready", result: top }]])} waitForSave={() => Promise.resolve()} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector('[aria-current="true"]')).toHaveTextContent("Worked with the warehouse team on loading plans.");
    expect(within(dialog).getByText("Bullet 1 of 3")).toBeInTheDocument();
  });
});

describe("the ✨ improve button", () => {
  const bullets = role.bullets;

  it("in the editor, opens focus mode on that bullet", async () => {
    const open = vi.fn();
    render(
      <FocusOpenProvider value={open}>
        <BulletList owner={{ list: "experience", itemId: "r1" }} bullets={bullets} dispatch={() => {}} ownerName="Dispatcher" />
      </FocusOpenProvider>,
    );
    const buttons = screen.getAllByRole("button", { name: "Improve this bullet" });
    expect(buttons).toHaveLength(3);
    await userEvent.click(buttons[1]!);
    expect(open).toHaveBeenCalledWith({ roleId: "r1", bulletId: "b2", mode: "improve" });
  });

  it("is never in CvDocument, nor on bullets outside the editor", () => {
    render(<CvDocument content={cv} />);
    expect(screen.queryByRole("button", { name: "Improve this bullet" })).toBeNull();
    render(<BulletList owner={{ list: "experience", itemId: "r1" }} bullets={bullets} dispatch={() => {}} ownerName="Dispatcher" />);
    expect(screen.queryByRole("button", { name: "Improve this bullet" })).toBeNull();
  });
});

import { useReducer } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { BRAIN_DUMP_QUESTION, emptyCv, fingerprint, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import { en } from "../../i18n/en.ts";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";

const api = vi.hoisted(() => ({ improveBullet: vi.fn(), brainDump: vi.fn(), roleFacts: vi.fn(), scoreRole: vi.fn(), roleDescription: vi.fn(), createVoiceSession: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { BulletList } from "../edit/BulletList.tsx";
import { CvDocument } from "../page/CvDocument.tsx";
import { FocusOpenProvider } from "./focus-context.ts";
import { FocusMode, LightStop } from "./FocusMode.tsx";
import { EnrichPath } from "./EnrichPath.tsx";

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
  roleQuestions: [], thin: false,
  questions: [{ bulletId: "b1", text: "Roughly how many drivers did you plan for each day?", options: ["Under 10", "10–50"], kind: "detail" }],
};
const proposal = { proposal: { bulletId: "b1", text: "Planned daily routes for 10–50 regional drivers." }, bulletBefore: 43, bulletAfter: 80, roleBefore: 52, roleAfter: 71, cached: true };

function Harness({ onAction, onClose = () => {}, initialRole = role, pathRole, roleResult = { ...result, fingerprint: fingerprint(initialRole, "en") } }: {
  onAction?(a: CvAction): void; onClose?(): void; initialRole?: Experience; roleResult?: RoleResult; pathRole?: { n: number; total: number };
}) {
  const [state, apply] = useReducer(cvReducer, { ...cv, experience: [initialRole] });
  const dispatch = (a: CvAction) => {
    onAction?.(a);
    apply(a);
  };
  return (
    <>
      <p data-testid="saved-b1">{state.experience[0]?.bullets[0]?.text}</p>
      <FocusMode pathRole={pathRole} target={{ roleId: "r1", mode: "improve" }} cv={state} dispatch={dispatch} scores={new Map([["r1", { state: "ready", result: roleResult }]])} waitForSave={() => Promise.resolve()} onClose={onClose} />
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
  api.roleDescription.mockResolvedValue({ text: "", keywords: [] });
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
      { id: "rq1", text: "Who did you report to?", options: ["The CEO", "The owner", "A team lead"], kind: "role", topic: "other" },
      { id: "rq2", text: "Who did you work with?", options: ["Finance", "Customers", "Vendors"], kind: "role", topic: "other" },
    ];
    render(<Harness roleResult={{ ...result, roleQuestions }} onAction={(a) => actions.push(a)} />);
    expect(screen.getByText("About the role · Question 1 of 2")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-section", "role");
    expect(dialog.querySelector('li[aria-current="true"]')).toBeNull();
    expect(dialog.querySelector('[aria-current="step"]')).toHaveTextContent("About the role");
    await userEvent.click(screen.getByRole("button", { name: "The CEO" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(actions[0]).toMatchObject({ type: "setNote", note: { question: "Who did you report to?", answer: "The CEO", via: ["pick"] } });
    expect(screen.getByText("About the role · Question 2 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: result.questions[0]!.text })).toBeInTheDocument();
    expect(api.improveBullet).not.toHaveBeenCalled();
    expect(api.brainDump).not.toHaveBeenCalled();
    expect(screen.queryByText("What else can you tell us about this?")).not.toBeInTheDocument();
  });
  it.each([
    [["company", "purpose", "tools"], 2],
    [["tools", "company"], 1],
  ] as const)("counts only general role questions for topics %j", async (topics, total) => {
    const roleQuestions: RoleResult["roleQuestions"] = topics.map((topic) => ({
      id: topic, text: `Tell us about ${topic}?`, options: [], kind: "role", topic,
    }));
    render(<Harness roleResult={{ ...result, roleQuestions }} />);
    expect(screen.getByRole("heading", { name: "Tell us about company?" })).toBeInTheDocument();
    expect(screen.getByText(`About the role · Question 1 of ${total}`)).toBeInTheDocument();
    for (let i = 0; i < total + role.bullets.length; i++) {
      await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    }
    expect(screen.getByRole("heading", { name: "Tell us about tools?" })).toBeInTheDocument();
    expect(screen.getByText("Tools", { selector: ".page-note-eyebrow" })).toBeInTheDocument();
  });
  it("shows the role on the left with the weakest bullet first and its question on the right", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "Improve your Dispatcher role" });
    expect(screen.queryByRole("button", { name: "Let's start" })).toBeNull();
    expect(within(dialog).getByText("Bullet points · Bullet 1 of 3")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Roughly how many drivers did you plan for each day?" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Under 10" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "10\u201350" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Something else" })).toBeInTheDocument();
    const current = dialog.querySelector('[aria-current="true"]');
    expect(current).toHaveTextContent("Responsible for planning routes for drivers.");
    expect(current).toHaveClass("page-mark");
    expect(dialog.querySelector(".fm-right .page-note")).toBeInTheDocument();
    const tabs = dialog.querySelector<HTMLElement>(".page-tabs")!;
    expect([...tabs.children].map(tab => tab.textContent?.replace("✓ ", ""))).toEqual(["About the role", "Bullet points", "Tools", "Description"]);
    expect(tabs.querySelector('[aria-current="step"]')).toHaveTextContent("Bullet points");
    expect(within(dialog).getByText("52")).toBeInTheDocument();
  });

  it("marks only the second queued bullet while asking its question", async () => {
    render(<Harness roleResult={{ ...result, questions: [...result.questions, { ...result.questions[0]!, bulletId: "b2", text: "Who needed your delivery updates?" }] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-section", "bullets");
    expect(dialog.querySelectorAll('li[aria-current="true"]')).toHaveLength(1);
    expect(dialog.querySelector('li[aria-current="true"]')).toHaveTextContent(role.bullets[1]!.text);
    expect(dialog.querySelector('li[aria-current="true"]')).toHaveClass("page-mark");
    expect(screen.getByText("Bullet points · Bullet 2 of 3")).toBeInTheDocument();
  });

  it("shows the revisited bullet number when going Back from Tools", async () => {
    render(<Harness roleResult={{ ...result,
      questions: role.bullets.map((bullet, i) => ({ ...result.questions[0]!, bulletId: bullet.id, text: `What did you handle for bullet ${i + 1}?` })),
      roleQuestions: [{ id: "tools", text: "Which tools did you use?", options: ["Excel", "SAP"], kind: "role", topic: "tools" }],
    }} />);
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-section", "tools");
    expect(screen.getByRole("heading", { name: "Which tools did you use?" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(screen.getByText("Bullet points · Bullet 3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What did you handle for bullet 3?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(screen.getByText("Bullet points · Bullet 2 of 3")).toBeInTheDocument();
  });

  it("keeps LightStop on its existing frame without a section or paper card", () => {
    render(<LightStop section="courses" itemId="c1" cv={{ ...cv, courses: [{ id: "c1", name: "Routing", provider: "TransLog", date: "", bullets: [] }] }}
      dispatch={() => {}} waitForSave={() => Promise.resolve()} onClose={() => {}} onNext={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveAttribute("data-section");
    expect(dialog.querySelector(".page-note, .page-sheet")).toBeNull();
    expect(dialog.querySelector(".fm-right")).toHaveTextContent("Routing");
  });

  it("Use this replaces the bullet in one dispatch, then celebrates with the returned numbers", async () => {
    api.improveBullet.mockResolvedValue(proposal);
    const actions: CvAction[] = [];
    render(<Harness onAction={(a) => actions.push(a)} />);
    await answerFirstQuestion();

    const note = screen.getByRole("dialog").querySelector<HTMLElement>(".page-note")!;
    const page = screen.getByRole("dialog").querySelector<HTMLElement>(".page-sheet")!;
    expect(await within(note).findByText(proposal.proposal.text)).toBeInTheDocument();
    expect(within(note).getByText(role.bullets[0]!.text, { selector: "s" })).toBeInTheDocument();
    expect(within(page).getByText(proposal.proposal.text)).toHaveClass("page-ins");
    expect(within(page).getByText(role.bullets[0]!.text, { selector: "s" })).toHaveClass("page-del");
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
    expect(screen.getByText("Bullet points · Bullet 2 of 3")).toBeInTheDocument();
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
    expect(await screen.findByRole("heading", { name: "Tell us about your time as Dispatcher at TransLog" })).toBeInTheDocument();
    expect(screen.getByText("+ new bullets will appear here")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What did you handle every day?" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue →" })).toBeDisabled();
    await userEvent.type(await screen.findByLabelText("Your answer"), "I ran the front desk");
    expect(screen.getByRole("button", { name: "Continue →" })).toBeEnabled();
  });
  it("E1: a thin role opens on the box; after its role questions a plain working screen shows, never the box again", async () => {
    const thin = { ...role, bullets: [{ id: "b1", text: "Managed the office." }] };
    const roleQuestions: RoleResult["roleQuestions"] = [
      { id: "rq1", text: "Which tools did you use?", options: ["Excel", "SAP", "Workday"], kind: "role", topic: "tools" },
      { id: "rq2", text: "Who did you work with?", options: ["Finance", "Customers", "Vendors"], kind: "role", topic: "other" },
    ];
    let finish!: () => void;
    api.brainDump.mockImplementation(() => new Promise((done) => { finish = () => done({ proposals: [{ id: "p", text: "Ran the front desk for 30 visitors a day", score: 80 }], roleBefore: 40, roleAfterAll: 70 }); }));
    render(<Harness initialRole={thin} roleResult={{ ...result, fingerprint: fingerprint(thin, "en"), bullets: [grade("b1", 43)], roleQuestions }} />);
    const box = "Tell us about your time as Dispatcher at TransLog";
    expect(screen.getByRole("heading", { name: box })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "← Back" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("About the role · Question 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Who did you work with?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Finance" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(screen.getByRole("heading", { name: "Turning this into bullets…" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: box })).toBeNull();
    finish();
    expect(await screen.findByRole("heading", { name: "Pick the ones that are true" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(screen.getByRole("heading", { name: "Who did you work with?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveValue("Finance");
    await userEvent.click(screen.getByRole("button", { name: "Continue →" }));
    await userEvent.click(screen.getByRole("button", { name: "None of these" }));
    expect(screen.getByRole("heading", { name: result.questions[0]!.text })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-section", "tools");
    expect(screen.getByText("Tools", { selector: ".page-note-eyebrow" })).toBeInTheDocument();
    expect(screen.getByRole("dialog").querySelector('li[aria-current="true"]')).toBeNull();
    expect(screen.getByRole("heading", { name: "Which tools did you use?" })).toBeInTheDocument();
  });
});

describe("focus mode edge cases", () => {
  it("Try again after a failed ramble runs it again", async () => {
    api.brainDump.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ proposals: [{ id: "p", text: "Ran the front desk", score: 80 }], roleBefore: 52, roleAfterAll: 60 });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Questions not specific enough? Describe what you did there in your own words." }));
    await userEvent.type(await screen.findByLabelText("Your answer"), "I ran the front desk");
    await userEvent.click(screen.getByRole("button", { name: "Turn this into bullets →" }));
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Pick the ones that are true" })).toBeInTheDocument();
    expect(api.brainDump).toHaveBeenCalledTimes(2);
  });

  it("the ramble cannot be changed while it is being turned into bullets", async () => {
    api.brainDump.mockReturnValue(new Promise(() => {}));
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Questions not specific enough? Describe what you did there in your own words." }));
    await userEvent.type(await screen.findByLabelText("Your answer"), "I ran the front desk");
    await userEvent.click(screen.getByRole("button", { name: "Turn this into bullets →" }));
    expect(await screen.findByRole("button", { name: "Turning this into bullets…" })).toBeDisabled();
    expect(screen.getByLabelText("Your answer")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Answer by speaking" })).toBeNull();
  });

  it("Skip on free talk returns to the same bullet question without an AI call", async () => {
    api.improveBullet.mockReturnValue(new Promise(() => {}));
    const two = { ...role, bullets: role.bullets.slice(0, 2) };
    function Two() {
      const [state, dispatch] = useReducer(cvReducer, { ...cv, experience: [two] });
      return <FocusMode target={{ roleId: "r1", mode: "improve" }} cv={state} dispatch={dispatch} scores={new Map([["r1", { state: "ready", result: { ...result, fingerprint: fingerprint(two, "en") } }]])} waitForSave={() => Promise.resolve()} onClose={() => {}} />;
    }
    render(<Two />);
    expect(screen.getByRole("heading", { name: result.questions[0]!.text })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Questions not specific enough? Describe what you did there in your own words." }));
    expect(screen.getByRole("heading", { name: "Tell us about your time as Dispatcher at TransLog" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: result.questions[0]!.text })).toBeInTheDocument();
    expect(screen.getByRole("dialog").querySelector('[aria-current="true"]')).toHaveTextContent(role.bullets[0]!.text);
    expect(api.brainDump).not.toHaveBeenCalled();
    expect(api.improveBullet).not.toHaveBeenCalled();
  });

  it("✨ on a bullet already at 100 still opens on that bullet", async () => {
    api.improveBullet.mockResolvedValue({ needsDetail: true });
    const top: RoleResult = { ...result, bullets: [grade("b1", 43), grade("b2", 56), { ...grade("b3", 100), impact: "specific" as const, issue: "none" as const }] };
    render(<FocusMode target={{ roleId: "r1", bulletId: "b3", mode: "improve" }} cv={cv} dispatch={() => {}} scores={new Map([["r1", { state: "ready", result: top }]])} waitForSave={() => Promise.resolve()} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector('[aria-current="true"]')).toHaveTextContent("Worked with the warehouse team on loading plans.");
    expect(within(dialog).getByText("Bullet points · Bullet 1 of 3")).toBeInTheDocument();
  });
});

describe("free talk", () => {
  const link = "Questions not specific enough? Describe what you did there in your own words.";
  const roleQuestions: RoleResult["roleQuestions"] = [
    { id: "rq1", text: "Who did you report to?", options: ["The CEO", "The owner", "A team lead"], kind: "role", topic: "other" },
    { id: "rq2", text: "Who did you work with?", options: ["Finance", "Customers", "Vendors"], kind: "role", topic: "other" },
  ];

  it.each([
    [" Global Market Developer ", " Kreditech ", "Tell us about your time as Global Market Developer at Kreditech", "What did you handle as Global Market Developer?", "Who relied on you at Kreditech?"],
    ["Global Market Developer", "", "Tell us about this role", "What did you handle as Global Market Developer?", "Who relied on you there?"],
    ["", "Kreditech", "Tell us about this role", "What did you handle in this role?", "Who relied on you at Kreditech?"],
    ["  ", "  ", "Tell us about this role", "What did you handle in this role?", "Who relied on you there?"],
  ])("templates the heading and prompt-only chips for title '%s' and company '%s'", async (title, company, heading, handle, relied) => {
    render(<Harness initialRole={{ ...role, title, company }} />);
    await userEvent.click(screen.getByRole("button", { name: link }));
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByText("What did a normal week here look like?")).not.toBeInTheDocument();
    for (const prompt of [handle, relied, "Anything you fixed or set up?", "Which tools did you use?"]) {
      await userEvent.click(screen.getByText(prompt));
      expect(screen.getByLabelText("Your answer")).toHaveValue("");
    }
    expect(api.brainDump).not.toHaveBeenCalled();
    expect(api.scoreRole).not.toHaveBeenCalled();
  });

  it.each(["first role", "second role", "first bullet", "second bullet", "follow-up"])(
    "offers one free-talk link on the %s question and returns after Skip or rejected proposals",
    async (source) => {
      api.brainDump.mockResolvedValue({ proposals: [{ id: "p", text: "Built weekly reports", score: 80 }], roleBefore: 52, roleAfterAll: 60 });
      api.improveBullet.mockResolvedValue({ needsDetail: true, nextQuestion: { text: "Which tools did you use?", options: ["Excel", "SAP", "Workday"] } });
      const questions = [...result.questions, { ...result.questions[0]!, bulletId: "b2", text: "Who needed your delivery updates?" }];
      render(<Harness roleResult={{ ...result, roleQuestions, questions }} />);
      const skips = source === "first role" ? 0 : source === "second role" ? 1 : source === "second bullet" ? 3 : 2;
      for (let i = 0; i < skips; i++) await userEvent.click(screen.getByRole("button", { name: "Skip" }));
      if (source === "follow-up") {
        await answerFirstQuestion();
        await screen.findByRole("heading", { name: "Which tools did you use?" });
      }
      const heading = screen.getByRole("heading").textContent!;
      const progress = screen.getByText(/^(About the role ·|Bullet points ·)/, { selector: ".page-note-eyebrow" }).textContent!;
      const callsBefore = api.improveBullet.mock.calls.length;
      for (const finish of ["skip", "proposals"]) {
        expect(screen.getAllByRole("button", { name: link })).toHaveLength(1);
        await userEvent.click(screen.getByRole("button", { name: link }));
        expect(screen.getByRole("heading", { name: "Tell us about your time as Dispatcher at TransLog" })).toBeInTheDocument();
        if (finish === "proposals") {
          await userEvent.type(screen.getByLabelText("Your answer"), "Built weekly reports");
          await userEvent.click(screen.getByRole("button", { name: "Turn this into bullets →" }));
          await userEvent.click(await screen.findByRole("button", { name: "None of these" }));
        } else await userEvent.click(screen.getByRole("button", { name: "Skip" }));
        expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
        expect(screen.getByText(progress)).toBeInTheDocument();
        expect(api.improveBullet).toHaveBeenCalledTimes(callsBefore);
      }
      expect(api.brainDump).toHaveBeenCalledTimes(1);
    },
  );

  it("returns after an empty dump and saves the note under the unchanged key", async () => {
    api.brainDump.mockResolvedValue({ proposals: [], roleBefore: 52, roleAfterAll: null });
    const actions: CvAction[] = [];
    render(<Harness onAction={(a) => actions.push(a)} />);
    await userEvent.click(screen.getByRole("button", { name: link }));
    await userEvent.type(screen.getByLabelText("Your answer"), "Built weekly reports");
    await userEvent.click(screen.getByRole("button", { name: "Turn this into bullets →" }));
    expect(await screen.findByRole("heading", { name: result.questions[0]!.text })).toBeInTheDocument();
    expect(actions[0]).toMatchObject({ type: "setNote", note: { question: BRAIN_DUMP_QUESTION, answer: "Built weekly reports" } });
    expect(api.brainDump).toHaveBeenCalledTimes(1);
    expect(api.improveBullet).not.toHaveBeenCalled();
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

describe("the role description step (3B) on screen", () => {
  it("shows the card with ATS chips; Edit turns it into a text box and Save sets the description", async () => {
    api.roleDescription.mockResolvedValue({ text: "TransLog moves freight for retailers. The role kept regional deliveries on time.", keywords: ["freight", "deliveries"] });
    const actions: CvAction[] = [];
    render(<Harness roleResult={{ ...result, questions: [], bullets: [grade("b1", 100), grade("b2", 100), grade("b3", 100)] }} onAction={(a) => actions.push(a)} />);
    expect(await screen.findByRole("heading", { name: "How should we introduce this role?" })).toBeInTheDocument();
    expect(screen.getByText("Last thing for this role")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-section", "description");
    expect(within(dialog.querySelector<HTMLElement>(".page-note")!).getByText("TransLog moves freight for retailers. The role kept regional deliveries on time.")).toBeInTheDocument();
    expect(within(dialog.querySelector<HTMLElement>(".page-sheet")!).getByText("TransLog moves freight for retailers. The role kept regional deliveries on time.")).toHaveClass("fm-page-description", "is-proposed");
    expect(screen.getByText("Description · Last step for this role")).toBeInTheDocument();
    expect(dialog.querySelector('li[aria-current="true"]')).toBeNull();
    expect(screen.getByText("Helps ATS with:")).toBeInTheDocument();
    expect(screen.getByText("freight")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Role description");
    await userEvent.clear(box);
    await userEvent.type(box, "TransLog moves freight.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(actions).toContainEqual({ type: "setItemField", list: "experience", itemId: "r1", field: "description", value: "TransLog moves freight." });
    expect(await screen.findByRole("heading", { name: "That's all for this role" })).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-section", "done");
    expect(dialog.querySelector(".page-mark, .page-bar")).toBeNull();
  });
});

describe("focus mode inside the guided path", () => {
  it("counts within each kind and offers the next project after the last role", async () => {
    const roles = [role, { ...role, id: "r2", title: "Planner" }];
    const projects = [
      { ...role, id: "p1", title: "Routing", url: "" },
      { ...role, id: "p2", title: "Tracking", url: "" },
    ];
    const content = { ...cv, experience: roles, projects };
    const scores = new Map(roles.concat(projects).map((item) => [item.id, {
      state: "ready" as const,
      result: { ...result, roleId: item.id, fingerprint: fingerprint(item, "en"), questions: [], bullets: item.bullets.map(b => grade(b.id, 100)) },
    }]));
    render(<MemoryRouter><EnrichPath cv={content} dispatch={() => {}} scores={scores}
      waitForSave={() => Promise.resolve()} onClose={() => {}} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Start with Dispatcher →" }));
    await userEvent.click(screen.getByRole("button", { name: "Let's start" }));
    await userEvent.click(await screen.findByRole("button", { name: "Next role →" }));
    await userEvent.click(screen.getByRole("button", { name: "Let's start" }));
    expect(await screen.findByRole("heading", { name: "Congrats, you just finished updating your last role." })).toBeInTheDocument();
    expect(screen.getByText("Let's go to the next one.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByText("Project 1 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Let's start" }));
    expect(await screen.findByRole("heading", { name: "Congrats, you just finished updating your first project." })).toBeInTheDocument();
    expect(screen.getByText("Let's go to the next one.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    await userEvent.click(screen.getByRole("button", { name: "Let's start" }));
    expect(await screen.findByRole("heading", { name: "Congrats, you just finished updating your last project." })).toBeInTheDocument();
    expect(screen.queryByText("Let's go to the next one.")).toBeNull();
  });

  it("greets the first role by first name and shows its question only after Let's start", async () => {
    const roleQuestions: RoleResult["roleQuestions"] = [
      { id: "rq1", text: "Who did you report to?", options: ["The CEO"], kind: "role", topic: "other" },
    ];
    render(<FocusMode pathRole={{ n: 1, total: 3 }} target={{ roleId: "r1", mode: "improve" }}
      cv={{ ...cv, basics: { ...cv.basics, fullName: "  Andrei Munteanu " } }} dispatch={() => {}}
      scores={new Map([["r1", { state: "ready", result: { ...result, roleQuestions } }]])}
      waitForSave={() => Promise.resolve()} onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Hey Andrei, we're going to ask you a few questions to gather some ideas about this role." })).toBeInTheDocument();
    expect(screen.getByText("Role 1 of 3 \u00b7 About the role")).toBeInTheDocument();
    expect(screen.getByText("First some general questions about the role. Then we'll go through your bullet points one by one, then your tools, and finish with a short description.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).toBeNull();
    expect(screen.queryByRole("heading", { name: roleQuestions[0]!.text })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Let's start" }));
    expect(screen.getByRole("heading", { name: roleQuestions[0]!.text })).toBeInTheDocument();
  });

  it("keeps the intro and role bar visible when background scoring reaches a bullet", async () => {
    let scored!: (value: RoleResult) => void;
    api.scoreRole.mockReturnValue(new Promise<RoleResult>((resolve) => { scored = resolve; }));
    render(<FocusMode pathRole={{ n: 1, total: 3 }} target={{ roleId: "r1", mode: "improve" }} cv={cv}
      dispatch={() => {}} scores={new Map()} waitForSave={() => Promise.resolve()} onClose={() => {}} />);
    await vi.waitFor(() => expect(api.scoreRole).toHaveBeenCalledTimes(1));
    await act(async () => scored(result));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-section", "role");
    expect(dialog.querySelector(".fm-role-block")).toHaveClass("page-bar");
    expect(dialog.querySelector('[aria-current="step"]')).toHaveTextContent("About the role");
    expect(dialog.querySelector(".page-mark")).toBeNull();
    expect(screen.getByRole("heading", { name: "Hey, we're going to ask you a few questions to gather some ideas about this role." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: result.questions[0]!.text })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Let's start" }));
    expect(screen.getByRole("heading", { name: result.questions[0]!.text })).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-section", "bullets");
  });

  it("shows the usual working screen when Let's start is pressed while scoring", async () => {
    api.scoreRole.mockReturnValue(new Promise(() => {}));
    render(<FocusMode pathRole={{ n: 1, total: 3 }} target={{ roleId: "r1", mode: "improve" }} cv={cv}
      dispatch={() => {}} scores={new Map()} waitForSave={() => Promise.resolve()} onClose={() => {}} />);
    expect(screen.queryByRole("status")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Let's start" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading your questions");
  });

  it("greets the next role with Hey again", () => {
    render(<Harness pathRole={{ n: 2, total: 3 }} />);
    expect(screen.getByRole("heading", { name: "Hey again! Same rhythm for this role: a few general questions first, to gather some ideas." })).toBeInTheDocument();
    expect(screen.getByText("Role 2 of 3 \u00b7 About the role")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).toBeNull();
  });

  it("Not now closes the intro like the close button", async () => {
    const onClose = vi.fn();
    render(<Harness pathRole={{ n: 1, total: 3 }} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    [1, 3, "first role", true],
    [2, 3, "second role", true],
    [3, 4, "third role", true],
    [4, 5, "fourth role", true],
    [5, 6, "fifth role", true],
    [6, 7, "sixth role", true],
    [7, 8, "seventh role", true],
    [8, 9, "eighth role", true],
    [9, 10, "ninth role", true],
    [10, 11, "tenth role", true],
    [11, 12, "role 11", true],
    [3, 3, "last role", false],
    [2, 2, "last role", false],
  ])("congratulates role %i of %i as the %s", async (n, total, wording, hasNext) => {
    const done = { ...result, questions: [], bullets: role.bullets.map(b => grade(b.id, 100)) };
    render(<Harness pathRole={{ n, total }} roleResult={done} />);
    await userEvent.click(screen.getByRole("button", { name: "Let's start" }));
    expect(await screen.findByRole("heading", { name: `Congrats, you just finished updating your ${wording}.` })).toBeInTheDocument();
    expect(screen.getByText(`Role ${n} of ${total} \u00b7 Finished`)).toBeInTheDocument();
    expect(Boolean(screen.queryByText("Let's go to the next one."))).toBe(hasNext);
    const paper = screen.getByRole("dialog").querySelector<HTMLElement>(".page-sheet")!;
    expect(within(paper).getByText(`Role ${n} done`)).toHaveClass("page-stamp");
    expect(screen.getByRole("dialog").querySelector(".fm-done-score")).toHaveTextContent("52");
  });

  it.each([
    ["project", "project"],
    ["volunteering", "volunteering role"],
  ] as const)("uses %s wording in the intro and congratulations", async (kind, wording) => {
    const item = { ...role, name: "Routing", organization: "TransLog" };
    const content = { ...cv, experience: [], [kind === "project" ? "projects" : "volunteering"]: [item] };
    const done = { ...result, fingerprint: fingerprint(item, "en"), questions: [], bullets: role.bullets.map(b => grade(b.id, 100)) };
    render(<FocusMode pathRole={{ n: 1, total: 3 }} target={{ roleId: "r1", mode: "improve" }} cv={content}
      dispatch={() => {}} scores={new Map([["r1", { state: "ready", result: done }]])}
      waitForSave={() => Promise.resolve()} onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: `Hey, we're going to ask you a few questions to gather some ideas about this ${wording}.` })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Let's start" }));
    expect(await screen.findByRole("heading", { name: `Congrats, you just finished updating your first ${wording}.` })).toBeInTheDocument();
  });

  it("shows the path bar, and at the end of the role the button moves on after saving the role's facts", async () => {
    const onNext = vi.fn();
    const onClose = vi.fn();
    const done = { ...result, questions: [], bullets: [grade("b1", 100), grade("b2", 100), grade("b3", 100)] };
    function Path() {
      const [state, dispatch] = useReducer(cvReducer, cv);
      return <FocusMode target={{ roleId: "r1", mode: "improve" }} cv={state} dispatch={dispatch} scores={new Map([["r1", { state: "ready", result: done }]])}
        waitForSave={() => Promise.resolve()} onClose={onClose} pathRole={{ n: 1, total: 2 }} topBar={<p>Role 1 of 2</p>} next={{ label: "Next role →", onNext }} />;
    }
    render(<Path />);
    await userEvent.click(screen.getByRole("button", { name: "Let's start" }));
    expect(screen.getByText("Role 1 of 2")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Next role →" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

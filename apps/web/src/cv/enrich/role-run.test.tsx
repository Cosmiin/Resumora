import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, fingerprint, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import { cvReducer, type CvAction } from "../edit/cvReducer.ts";

const api = vi.hoisted(() => ({ improveBullet: vi.fn(), brainDump: vi.fn(), roleFacts: vi.fn(), scoreRole: vi.fn(), roleDescription: vi.fn(), createVoiceSession: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { RoleRun } from "./RoleRun.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

const role: Experience = {
  id: "r1", company: "Nordlane Logistics", title: "Operations Analyst", location: "", startDate: "2022-01", endDate: "", current: true, description: "",
  bullets: [
    { id: "b1", text: "Trained six colleagues to read and update the planning sheets." },
    { id: "b2", text: "Built the weekly delivery report." },
    { id: "b3", text: "Cut late deliveries from 9% to 4% in a year." },
  ],
  notes: [],
};
const cv: CvContent = { ...emptyCv(), experience: [role] };
const grade = (id: string, score: number) => ({
  id, score, contribution: "specific" as const, clarity: "specific" as const, specificity: "specific" as const,
  impact: score >= 80 ? ("specific" as const) : ("missing" as const), concise: "specific" as const,
  issue: score >= 80 ? ("none" as const) : ("impact" as const), tip: null, question: null,
});
const marks = { company: "applies", purpose: "shown", actions: "shown", tools: "applies", results: "shown", scale: "shown", leadership: "unknown", seniority: "na", people: "na", domain: "na" } as const;
const result: RoleResult = {
  roleId: "r1", policy: "score/7", fingerprint: fingerprint(role, "en"), score: 69, lines: 77,
  coverage: { score: 58, marks, shape: { amount: true, repeats: true, order: false } },
  bullets: [grade("b1", 70), grade("b2", 60), grade("b3", 100)], nextStep: null, thin: false,
  roleQuestions: [
    { id: "rq1", text: "What does Nordlane Logistics do?", options: [], kind: "role", topic: "company" },
    { id: "rq2", text: "Did anyone report to you in this role?", options: ["No", "1–5 people", "6–20", "20+"], kind: "role", topic: "leadership" },
  ],
  questions: [{ bulletId: "b1", text: "What changed after you trained them?", options: ["Fewer planning mistakes", "I no longer did it alone"], kind: "result" }],
};
const improved = (bulletId: string, text: string) => ({ proposal: { bulletId, text }, bulletBefore: 70, bulletAfter: 100, roleBefore: 69, roleAfter: 80, cached: false });
const NEW_B1 = "Trained six colleagues to run the planning sheets, halving weekly planning mistakes.";
const NEW_B2 = "Built the weekly delivery report 14 depot managers use to plan routes.";
const NEW_DESCRIPTION = "Nordlane delivers parcels for online shops. Analysed routes and depot data for 14 depots.";

type HarnessProps = {
  onAction?(a: CvAction): void; onClose?(): void; next?: { label: string; onNext(): void }; context?: string;
  initialRole?: Experience; roleResult?: RoleResult;
  /** The scores the editor would hold for the role as it is now. */
  scoresFor?(now: Experience): RoleScoreState | undefined;
  onScore?(r: RoleResult): void;
};
function Harness({ onAction, onClose = () => {}, next, context, initialRole = role, roleResult = result, scoresFor, onScore }: HarnessProps) {
  const [state, apply] = useReducer(cvReducer, { ...cv, experience: [initialRole] });
  const dispatch = (a: CvAction) => {
    onAction?.(a);
    apply(a);
  };
  const now = state.experience[0]!;
  const entry = scoresFor?.(now) ?? { state: "ready" as const, result: { ...roleResult, fingerprint: fingerprint(initialRole, "en") } };
  return (
    <>
      <p data-testid="page">{[now.description, ...now.bullets.map((b) => b.text)].join(" | ")}</p>
      <RoleRun target={{ roleId: "r1", mode: "improve" }} cv={state} dispatch={dispatch} scores={new Map([["r1", entry]])}
        waitForSave={() => Promise.resolve()} onClose={onClose} next={next} context={context} onScore={onScore} />
    </>
  );
}
const page = () => screen.getByTestId("page").textContent;
const answer = async (option: string) => {
  await userEvent.click(screen.getByRole("button", { name: option }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
};

beforeEach(() => {
  vi.resetAllMocks();
  api.roleFacts.mockResolvedValue({ facts: [], fromNotes: "x" });
  api.scoreRole.mockImplementation(() => Promise.reject(new Error("unavailable")));
  api.roleDescription.mockResolvedValue({ text: NEW_DESCRIPTION, keywords: [] });
  api.brainDump.mockResolvedValue({ proposals: [], roleBefore: null, roleAfterAll: null });
  api.improveBullet.mockImplementation(({ bulletId }: { bulletId: string }) => Promise.resolve(bulletId === "b1" ? improved("b1", NEW_B1) : improved("b2", NEW_B2)));
});

describe("the start of a role", () => {
  it("says how much is coming, shows the score as one number, and offers to skip the role in the path", async () => {
    const onNext = vi.fn();
    render(<Harness context="Role 1 of 2" next={{ label: "Next role", onNext }} />);
    const dialog = screen.getByRole("dialog", { name: "Improve your Operations Analyst role" });
    expect(within(dialog).getByText("Role 1 of 2")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Operations Analyst" })).toBeInTheDocument();
    expect(within(dialog).getByText(/^Nordlane Logistics · /)).toBeInTheDocument();
    expect(within(dialog).getByText("3 short questions, about 2 minutes. Then I show you what they changed.")).toBeInTheDocument();
    expect(within(dialog).getByText("69")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Skip this role" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("asks for the questions when the stored score is not for this text, and waits for them", async () => {
    let give!: (r: RoleResult) => void;
    api.scoreRole.mockReturnValue(new Promise<RoleResult>((done) => { give = done; }));
    render(<Harness scoresFor={() => ({ state: "scoring" })} />);
    expect(screen.getByText("Loading your questions…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    await act(async () => give(result));
    expect(await screen.findByText("3 short questions, about 2 minutes. Then I show you what they changed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("Understand the score opens the explanation; Esc closes it and leaves the run open", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Understand the score" }));
    expect(screen.getByRole("heading", { name: "Operations Analyst: the score" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Operations Analyst: the score" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("the run of questions", () => {
  it("asks one question per screen, saves each answer as a note, and changes nothing on the page", async () => {
    const actions: CvAction[] = [];
    render(<Harness onAction={(a) => actions.push(a)} />);
    const before = page();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Question 1 of 3 · about the role")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What does Nordlane Logistics do?" })).toBeInTheDocument();
    expect(screen.getByText("Why I ask: one line about the company helps a reader place your work.")).toBeInTheDocument();
    // No score while answering.
    expect(screen.queryByText("69")).toBeNull();
    await userEvent.type(screen.getByLabelText("Your answer"), "Parcel delivery for online shops");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(actions[0]).toMatchObject({ type: "setNote", roleId: "r1", note: { question: "What does Nordlane Logistics do?", answer: "Parcel delivery for online shops" } });

    // A quick check: "No" is the first answer offered.
    expect(screen.getByText("Question 2 of 3 · about the role")).toBeInTheDocument();
    const options = within(screen.getByRole("group", { name: "Likely answers" })).getAllByRole("button");
    expect(options[0]).toHaveTextContent("No");
    await answer("No");
    expect(actions[1]).toMatchObject({ type: "setNote", note: { question: "Did anyone report to you in this role?", answer: "No", via: ["pick"] } });

    // A question about a line shows the line.
    expect(screen.getByText("Question 3 of 3 · about a line")).toBeInTheDocument();
    expect(screen.getByText(/“Trained six colleagues to read and update the planning sheets\.”/)).toBeInTheDocument();
    expect(api.improveBullet).not.toHaveBeenCalled();
    await answer("Fewer planning mistakes");
    expect(actions.every((a) => a.type === "setNote")).toBe(true);
    expect(page()).toBe(before);
    expect(await screen.findByRole("heading", { name: "Here is the role as it will read" })).toBeInTheDocument();
    expect(page()).toBe(before);
  });

  it("Back shows the earlier answer; sending it again updates the same note", async () => {
    const actions: CvAction[] = [];
    render(<Harness onAction={(a) => actions.push(a)} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.type(screen.getByLabelText("Your answer"), "Parcels");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Your answer")).toHaveValue("Parcels");
    await userEvent.type(screen.getByLabelText("Your answer"), " for shops");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const notes = actions.filter((a) => a.type === "setNote");
    expect(notes).toHaveLength(2);
    expect(notes[1]!.note.id).toBe(notes[0]!.note.id);
    expect(notes[1]!.note.answer).toBe("Parcels for shops");
    expect(screen.getByText("Question 2 of 3 · about the role")).toBeInTheDocument();
  });

  it("an answer too thin to use brings one follow-up straight after the question on screen", async () => {
    let give!: (a: unknown) => void;
    api.improveBullet.mockImplementation(({ bulletId }: { bulletId: string }) => (bulletId === "b1"
      ? new Promise((done) => { give = done; }) : Promise.resolve({ needsDetail: true, nextQuestion: null })));
    const extra: RoleResult = { ...result, questions: [...result.questions, { bulletId: "b2", text: "Who uses the report?", options: [], kind: "detail" }], roleQuestions: [] };
    render(<Harness roleResult={extra} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await answer("Fewer planning mistakes");
    expect(screen.getByText("Question 2 of 2 · about a line")).toBeInTheDocument();
    await act(async () => give({ needsDetail: true, nextQuestion: { text: "How many mistakes a week before and after?", options: [] } }));
    expect(screen.getByText("Question 2 of 3 · about a line")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: "How many mistakes a week before and after?" })).toBeInTheDocument();
    expect(screen.getByText("We need a bit more detail to improve this one.")).toBeInTheDocument();
    expect(screen.getByText(/“Trained six colleagues/)).toBeInTheDocument();
  });

  it("a thin role opens with its box, then asks again for questions with that answer in view", async () => {
    const thin: Experience = { ...role, bullets: [role.bullets[0]!] };
    const thinResult: RoleResult = { ...result, thin: true, bullets: [grade("b1", 70)], roleQuestions: [], questions: [] };
    const print = fingerprint(thin, "en");
    api.scoreRole.mockResolvedValue({ ...thinResult, fingerprint: print, roleQuestions: [result.roleQuestions[0]!] });
    api.brainDump.mockResolvedValue({ proposals: [{ id: "new1", text: "Planned routes for 14 depots.", score: 80 }], roleBefore: 69, roleAfterAll: 75 });
    api.improveBullet.mockResolvedValue({ needsDetail: true, nextQuestion: null });
    api.roleDescription.mockResolvedValue({ text: "", keywords: [] });
    render(<Harness initialRole={thin} roleResult={thinResult} />);
    expect(screen.getByText("1 short question, about a minute. Then I show you what it changed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("heading", { name: "Tell us about your time as Operations Analyst at Nordlane Logistics" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox"), "I planned routes for 14 depots");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "What does Nordlane Logistics do?" })).toBeInTheDocument();
    expect(api.scoreRole).toHaveBeenCalledWith("r1", print, true);
    expect(screen.getByText("Question 2 of 2 · about the role")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    // The answers become a new bullet, held like every other change.
    expect(await screen.findByText("Planned routes for 14 depots.")).toBeInTheDocument();
    expect(api.brainDump).toHaveBeenCalledWith({ roleId: "r1", fingerprint: print, source: "answers" });
    expect(screen.getByRole("button", { name: "Leave it out" })).toBeInTheDocument();
  });
});

async function toApproval(props: HarnessProps = {}) {
  render(<Harness {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Start" }));
  await userEvent.type(screen.getByLabelText("Your answer"), "Parcel delivery for online shops");
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await answer("No");
  await answer("Fewer planning mistakes");
  await screen.findByRole("heading", { name: "Here is the role as it will read" });
}

describe("approve once", () => {
  it("shows the role as it will read: the description, the line asked about and the weak line not asked about", async () => {
    await toApproval();
    expect(screen.getByText("What your answers changed")).toBeInTheDocument();
    expect(screen.getByText(NEW_DESCRIPTION)).toHaveClass("rr-new");
    expect(screen.getByText(NEW_B1)).toHaveClass("rr-new");
    // b2 scores below 80 and had no question: it is rewritten with the answers in view. b3 reads clearly and is left alone.
    expect(screen.getByText(NEW_B2)).toHaveClass("rr-new");
    expect(api.improveBullet).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("dialog")).getByText("Cut late deliveries from 9% to 4% in a year.")).not.toHaveClass("rr-new");
    expect(screen.getAllByRole("button", { name: "Keep mine" })).toHaveLength(3);
  });

  it("Looks good applies everything in yellow, then the score before and after", async () => {
    const actions: CvAction[] = [];
    const after: RoleResult = { ...result, score: 88, coverage: { ...result.coverage!, marks: { ...marks, company: "shown" } } };
    await toApproval({
      onAction: (a) => actions.push(a),
      scoresFor: (now) => (now.description === "" ? { state: "ready", result } : { state: "ready", result: { ...after, fingerprint: fingerprint(now, "en") } }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Looks good" }));
    expect(actions.filter((a) => a.type !== "setNote")).toEqual([
      { type: "setItemField", list: "experience", itemId: "r1", field: "description", value: NEW_DESCRIPTION },
      { type: "replaceBullet", roleId: "r1", bulletId: "b1", text: NEW_B1 },
      { type: "replaceBullet", roleId: "r1", bulletId: "b2", text: NEW_B2 },
    ]);
    expect(page()).toBe([NEW_DESCRIPTION, NEW_B1, NEW_B2, "Cut late deliveries from 9% to 4% in a year."].join(" | "));
    expect(await screen.findByRole("heading", { name: "Score from 69 to 88" })).toBeInTheDocument();
    expect(screen.getByText("This role now says what the company does, what you did and what changed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to my CV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Understand the score" })).toBeInTheDocument();
  });

  it("Keep mine leaves one piece as it was; Edit changes its wording; See what it was before shows the old text", async () => {
    const actions: CvAction[] = [];
    await toApproval({ onAction: (a) => actions.push(a) });
    await userEvent.click(screen.getByRole("button", { name: "See what it was before" }));
    expect(screen.getByText("Built the weekly delivery report.")).toBeInTheDocument();
    const items = within(screen.getByRole("dialog")).getAllByRole("listitem");
    await userEvent.click(within(items[0]!).getByRole("button", { name: "Keep mine" }));
    expect(within(items[0]!).getByText("Trained six colleagues to read and update the planning sheets.")).not.toHaveClass("rr-new");
    expect(within(items[0]!).getByRole("button", { name: "Use the new text" })).toBeInTheDocument();
    await userEvent.click(within(items[1]!).getByRole("button", { name: "Edit" }));
    const box = within(items[1]!).getByLabelText("Edit the new text");
    await userEvent.clear(box);
    await userEvent.type(box, "Built the weekly report 14 depot managers plan routes with.");
    await userEvent.click(within(items[1]!).getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Looks good" }));
    expect(actions.filter((a) => a.type !== "setNote")).toEqual([
      { type: "setItemField", list: "experience", itemId: "r1", field: "description", value: NEW_DESCRIPTION },
      { type: "replaceBullet", roleId: "r1", bulletId: "b2", text: "Built the weekly report 14 depot managers plan routes with." },
    ]);
  });

  it("with every piece kept, nothing on the page changes and the answers still count: the score is asked for again", async () => {
    const actions: CvAction[] = [];
    const onScore = vi.fn();
    await toApproval({ onAction: (a) => actions.push(a), onScore });
    const before = page();
    api.scoreRole.mockResolvedValue({ ...result, score: 74 });
    for (const keep of screen.getAllByRole("button", { name: "Keep mine" })) await userEvent.click(keep);
    await userEvent.click(screen.getByRole("button", { name: "Looks good" }));
    expect(actions.every((a) => a.type === "setNote")).toBe(true);
    expect(page()).toBe(before);
    expect(await screen.findByRole("heading", { name: "Score from 69 to 74" })).toBeInTheDocument();
    expect(api.scoreRole).toHaveBeenLastCalledWith("r1", result.fingerprint, true);
    expect(onScore).toHaveBeenCalledWith(expect.objectContaining({ score: 74 }));
    expect(screen.getByText("Your answers are saved. They changed nothing on the page this time.")).toBeInTheDocument();
  });

  it("a role that has a description and got no answers is not given a reworded one", async () => {
    render(<Harness initialRole={{ ...role, description: "Nordlane delivers parcels." }} roleResult={{ ...result, roleQuestions: [], questions: [] }} />);
    expect(screen.getByText("No questions about this role right now.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("Nothing changed for this role.")).toBeInTheDocument();
    expect(api.roleDescription).not.toHaveBeenCalled();
    expect(api.improveBullet).not.toHaveBeenCalled();
  });

  it("when nothing could be prepared, says so and offers to try again", async () => {
    api.improveBullet.mockImplementation(() => Promise.reject(new Error("down")));
    api.roleDescription.mockImplementation(() => Promise.reject(new Error("down")));
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    await answer("Fewer planning mistakes");
    expect(await screen.findByRole("alert")).toHaveTextContent("I couldn't prepare the changes right now. Your answers are saved.");
    api.improveBullet.mockImplementation(({ bulletId }: { bulletId: string }) => Promise.resolve(improved(bulletId, bulletId === "b1" ? NEW_B1 : NEW_B2)));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(NEW_B1)).toBeInTheDocument();
  });
});

describe("role done", () => {
  it("in the path: Next role moves on, Finish for now closes, and the role's facts are refreshed from the answers", async () => {
    const onNext = vi.fn();
    const onClose = vi.fn();
    await toApproval({ next: { label: "Next role", onNext }, onClose });
    await userEvent.click(screen.getByRole("button", { name: "Looks good" }));
    expect(screen.getByRole("button", { name: "Finish for now" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next role" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(api.roleFacts).toHaveBeenCalledWith("r1"));
  });

  it("offers A few more questions when some remain, and starts another run with them", async () => {
    const many: RoleResult = { ...result, roleQuestions: [], questions: ["b1", "b2", "b3"].flatMap((b, i) => [
      { bulletId: b, text: `Question ${i * 2 + 1}?`, options: [], kind: "detail" as const },
    ]).concat([4, 5, 6, 7].map((n) => ({ bulletId: "b3", text: `Extra ${n}?`, options: [], kind: "detail" as const }))) };
    api.improveBullet.mockResolvedValue({ needsDetail: true, nextQuestion: null });
    api.roleDescription.mockResolvedValue({ text: "", keywords: [] });
    render(<Harness roleResult={many} />);
    expect(screen.getByText("6 short questions, about 3 minutes. Then I show you what they changed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    for (let i = 0; i < 6; i++) await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("Nothing changed for this role.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "A few more questions" }));
    expect(screen.getByText("Question 1 of 1 · about a line")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Extra 7?" })).toBeInTheDocument();
  });
});

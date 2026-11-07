import { useReducer, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, fingerprint, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import { ApiClientError } from "../../lib/api-error.ts";
import type { SaveStatus } from "../useAutosave.ts";

const api = vi.hoisted(() => ({ getScores: vi.fn(), scoreRole: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { useRoleScores } from "./useRoleScores.ts";
import { RoleItem } from "../edit/sections/RoleItem.tsx";
import { CvDocument } from "../page/CvDocument.tsx";
import { cvReducer } from "../edit/cvReducer.ts";
import { ScorePill } from "./ScorePill.tsx";

function role(n: number, texts: string[] = ["Ran the weekly rota", "Cut waiting time"]): Experience {
  return {
    id: `r${n}`,
    company: `Company ${n}`,
    title: `Title ${n}`,
    location: "",
    startDate: "2020-01",
    endDate: "2021-01",
    current: false,
    description: "",
    bullets: texts.map((text, i) => ({ id: `r${n}-b${i}`, text })),
    notes: [],
  };
}
const cvOf = (...roles: Experience[]): CvContent => ({ ...emptyCv(), experience: roles });
const print = (r: Experience) => fingerprint(r, "en");
function result(r: Experience, score: number | null = 80, fp = print(r)): RoleResult {
  return { roleId: r.id, policy: "score/2", fingerprint: fp, score, bullets: [], nextStep: null, questions: [], roleQuestions: [] };
}
const conflict = () => new ApiClientError(409, "not_saved", "not saved");

type HookProps = { cv: CvContent; status: SaveStatus };
async function mount(cv: CvContent, status: SaveStatus = "saved") {
  const view = renderHook((p: HookProps) => useRoleScores(p), { initialProps: { cv, status } });
  await act(async () => {}); // let GET /scores settle
  return view;
}
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("useRoleScores", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.getScores.mockResolvedValue([]);
    api.scoreRole.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("loads the saved scores once and shows them as ready", async () => {
    const r1 = role(1);
    api.getScores.mockResolvedValue([result(r1, 62)]);
    const { result: hook, rerender } = await mount(cvOf(r1));
    rerender({ cv: cvOf(r1), status: "saved" });
    expect(api.getScores).toHaveBeenCalledTimes(1);
    expect(hook.current.scores.get("r1")).toMatchObject({ state: "ready", result: { score: 62 } });
    await wait(5000);
    expect(api.scoreRole).not.toHaveBeenCalled();
  });

  it("scores stale roles one at a time, in order, 2 s after a save", async () => {
    const r1 = role(1);
    const r2 = role(2);
    const gates: Array<(r: RoleResult) => void> = [];
    api.scoreRole.mockImplementation(() => new Promise<RoleResult>((res) => gates.push(res)));
    const { rerender } = await mount(cvOf(r1, r2), "dirty");
    rerender({ cv: cvOf(r1, r2), status: "saved" });
    await wait(1900);
    expect(api.scoreRole).not.toHaveBeenCalled();
    await wait(200);
    expect(api.scoreRole).toHaveBeenCalledTimes(1);
    expect(api.scoreRole).toHaveBeenLastCalledWith("r1", print(r1));
    await wait(5000);
    expect(api.scoreRole).toHaveBeenCalledTimes(1); // r1 still in flight: never two at once
    await act(async () => gates[0]!(result(r1, 70)));
    expect(api.scoreRole).toHaveBeenCalledTimes(2);
    expect(api.scoreRole).toHaveBeenLastCalledWith("r2", print(r2));
  });

  it("does not request while the CV is unsaved", async () => {
    await mount(cvOf(role(1)), "dirty");
    await wait(5000);
    expect(api.scoreRole).not.toHaveBeenCalled();
  });

  it("a result for older text shows as previous and is not current (edit during a request)", async () => {
    const r1 = role(1);
    let finish!: (r: RoleResult) => void;
    api.scoreRole.mockImplementationOnce(() => new Promise<RoleResult>((res) => (finish = res)));
    const { result: hook, rerender } = await mount(cvOf(r1));
    await wait(2100);
    expect(hook.current.scores.get("r1")!.state).toBe("scoring");
    const edited = { ...r1, bullets: [{ id: "r1-b0", text: "Ran the weekly rota for 30 people" }, r1.bullets[1]!] };
    rerender({ cv: cvOf(edited), status: "dirty" });
    await act(async () => finish(result(r1, 90)));
    expect(hook.current.scores.get("r1")).toMatchObject({ state: "previous", result: { score: 90 } });
    expect(api.scoreRole).toHaveBeenCalledTimes(1); // nothing new until the edit is saved
    api.scoreRole.mockResolvedValueOnce(result(edited, 55));
    rerender({ cv: cvOf(edited), status: "saved" });
    await wait(2100);
    expect(api.scoreRole).toHaveBeenLastCalledWith("r1", print(edited));
    expect(hook.current.scores.get("r1")).toMatchObject({ state: "ready", result: { score: 55 } });
  });

  it("a 409 shows no error and the role is retried after the next save", async () => {
    const r1 = role(1);
    api.scoreRole.mockRejectedValueOnce(conflict());
    const { result: hook, rerender } = await mount(cvOf(r1));
    await wait(2100);
    expect(api.scoreRole).toHaveBeenCalledTimes(1);
    expect(hook.current.scores.get("r1")!.state).toBe("scoring"); // not an error
    await wait(10000);
    expect(api.scoreRole).toHaveBeenCalledTimes(1);
    api.scoreRole.mockResolvedValueOnce(result(r1, 70));
    rerender({ cv: cvOf(r1), status: "dirty" });
    rerender({ cv: cvOf(r1), status: "saved" });
    await wait(2100);
    expect(api.scoreRole).toHaveBeenCalledTimes(2);
    expect(hook.current.scores.get("r1")!.state).toBe("ready");
  });

  it("a late 409 for older text does not park a role whose newer text was already saved", async () => {
    const r1 = role(1);
    let reject!: (e: unknown) => void;
    api.scoreRole.mockImplementationOnce(() => new Promise<RoleResult>((_, rej) => (reject = rej)));
    const { rerender } = await mount(cvOf(r1));
    await wait(2100);
    const edited = { ...r1, bullets: [{ id: "r1-b0", text: "Ran the weekly rota for 30 people" }, r1.bullets[1]!] };
    rerender({ cv: cvOf(edited), status: "dirty" });
    rerender({ cv: cvOf(edited), status: "saved" }); // this save happens before the 409 comes back
    api.scoreRole.mockResolvedValueOnce(result(edited, 55));
    await act(async () => reject(conflict()));
    await wait(2100);
    expect(api.scoreRole).toHaveBeenCalledTimes(2);
    expect(api.scoreRole).toHaveBeenLastCalledWith("r1", print(edited));
  });

  it.each([503, 502])("a %i keeps the last score, says unavailable, and retry asks again", async (status) => {
    const r1 = role(1);
    const old = result(r1, 60, "older-print");
    api.getScores.mockResolvedValue([old]);
    api.scoreRole.mockRejectedValueOnce(new ApiClientError(status, "ai_down", "down"));
    const { result: hook } = await mount(cvOf(r1));
    await wait(2100);
    expect(hook.current.scores.get("r1")).toMatchObject({ state: "unavailable", result: old });
    await wait(10000);
    expect(api.scoreRole).toHaveBeenCalledTimes(1); // no automatic loop
    api.scoreRole.mockResolvedValueOnce(result(r1, 66));
    await act(async () => hook.current.retry("r1"));
    expect(api.scoreRole).toHaveBeenCalledTimes(2);
    expect(hook.current.scores.get("r1")).toMatchObject({ state: "ready", result: { score: 66 } });
  });

  it("a role with no bullets is not requested", async () => {
    const { result: hook } = await mount(cvOf(role(1, ["", "  "])));
    await wait(5000);
    expect(api.scoreRole).not.toHaveBeenCalled();
    expect(hook.current.scores.get("r1")!.state).toBe("none");
  });

  it("a deleted role is dropped from the queue", async () => {
    const r1 = role(1);
    const r2 = role(2);
    let finish!: (r: RoleResult) => void;
    api.scoreRole.mockImplementationOnce(() => new Promise<RoleResult>((res) => (finish = res)));
    api.scoreRole.mockResolvedValue(result(r2, 50));
    const { result: hook, rerender } = await mount(cvOf(r1, r2));
    await wait(2100);
    rerender({ cv: cvOf(r2), status: "saved" });
    await act(async () => finish(result(r1, 90)));
    expect(api.scoreRole).toHaveBeenCalledTimes(2);
    expect(api.scoreRole).toHaveBeenLastCalledWith("r2", print(r2));
    expect([...hook.current.scores.keys()]).toEqual(["r2"]);
  });

  it("keeps the same Map and entries when no score changed", async () => {
    const [r1, r2, r3] = [role(1), role(2), role(3)] as [Experience, Experience, Experience];
    api.getScores.mockResolvedValue([result(r1), result(r2), result(r3)]);
    const { result: hook, rerender } = await mount(cvOf(r1, r2, r3));
    const before = hook.current.scores;
    const e1 = before.get("r1");
    rerender({ cv: { ...cvOf(r1, r2, r3), basics: { ...emptyCv().basics, fullName: "Ana" } }, status: "dirty" });
    expect(hook.current.scores).toBe(before);
    const edited = { ...r2, bullets: [{ id: "r2-b0", text: "Changed" }, r2.bullets[1]!] };
    rerender({ cv: cvOf(r1, edited, r3), status: "dirty" });
    expect(hook.current.scores).not.toBe(before);
    expect(hook.current.scores.get("r1")).toBe(e1);
    expect(hook.current.scores.get("r3")).toBe(before.get("r3"));
    expect(hook.current.scores.get("r2")!.state).toBe("previous");
    const after = hook.current.scores;
    const again = { ...edited, bullets: [{ id: "r2-b0", text: "Changed again" }, r2.bullets[1]!] };
    rerender({ cv: cvOf(r1, again, r3), status: "dirty" });
    expect(hook.current.scores).toBe(after); // still "previous": nothing visible changed
  });
});

describe("ScorePill on the page", () => {
  function Harness({ cv, score }: { cv: CvContent; score: ComponentProps<typeof RoleItem>["score"] }) {
    const [state, dispatch] = useReducer(cvReducer, cv);
    return <RoleItem role={state.experience[0]!} list="experience" locale="en" dispatch={dispatch} score={score} />;
  }

  it("shows the number and band, and clicking it focuses the role title", async () => {
    const r1 = role(1);
    render(<Harness cv={cvOf(r1)} score={{ state: "ready", result: result(r1, 62) }} />);
    const pill = screen.getByRole("button", { name: "Score 62 of 100, A good start. Open tips" });
    expect(pill).toHaveTextContent("62");
    await userEvent.click(pill);
    expect(screen.getByRole("textbox", { name: "Role title" })).toHaveFocus();
  });

  it("fades an older score, and shows … while scoring", () => {
    const r1 = role(1);
    const { rerender } = render(<Harness cv={cvOf(r1)} score={{ state: "previous", result: result(r1, 30, "old") }} />);
    expect(screen.getByRole("button", { name: /Score 30 of 100, Needs work/ })).toHaveClass("is-previous");
    rerender(<Harness cv={cvOf(r1)} score={{ state: "scoring" }} />);
    expect(screen.getByRole("button", { name: "Scoring this role" })).toHaveTextContent("…");
  });

  it("tells a role without bullets to add some", () => {
    render(<ScorePill roleId="r1" state={{ state: "none" }} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: "Add bullets to get a score" })).toBeInTheDocument();
  });

  it("the read-only CvDocument never draws it", () => {
    render(<CvDocument content={cvOf(role(1))} />);
    expect(document.querySelector("[data-score-for]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Score|Add bullets/ })).toBeNull();
  });
});

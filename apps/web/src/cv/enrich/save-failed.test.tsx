import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CategoryKey, type CvContent, type RoleResult } from "@resumora/shared";
import { cvReducer } from "../edit/cvReducer.ts";
import { SaveNotDoneError, useWaitForSave, type SaveStatus } from "../useAutosave.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

const api = vi.hoisted(() => ({ streamRewrite: vi.fn(), getSkillSuggestions: vi.fn(), createVoiceSession: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { SectionTools } from "../panel/SectionTools.tsx";

beforeEach(() => {
  vi.resetAllMocks();
  api.streamRewrite.mockImplementation(() => new AbortController());
});
afterEach(() => vi.useRealTimers());

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

  it("rejects after 15 s without a save", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWaitForSave("dirty"));
    let outcome: unknown = "pending";
    result.current.waitForSave().then(
      () => (outcome = "resolved"),
      (err: unknown) => (outcome = err),
    );
    await act(async () => vi.advanceTimersByTimeAsync(14_999));
    expect(outcome).toBe("pending");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(outcome).toBeInstanceOf(SaveNotDoneError);
  });

  it.each(["error", "conflict", "invalid"] as const)("rejects when autosave reports %s, and at once while it does", async (bad) => {
    const { result, rerender } = renderHook(({ status }: { status: SaveStatus }) => useWaitForSave(status), {
      initialProps: { status: "dirty" },
    });
    const waiting = result.current.waitForSave();
    rerender({ status: bad });
    await expect(waiting).rejects.toBeInstanceOf(SaveNotDoneError);
    await expect(result.current.waitForSave()).rejects.toBeInstanceOf(SaveNotDoneError);
  });
});

const role = {
  id: "r1",
  company: "Acme",
  title: "Operations Coordinator",
  location: "",
  startDate: "2020-03",
  endDate: "",
  current: false,
  description: "",
  bullets: [{ id: "b1", text: "Built churn reports in SQL" }],
  notes: [],
};
const cv: CvContent = { ...emptyCv(), experience: [role], unclearSkills: [{ id: "u1", name: "Docker" }] };
const score: RoleScoreState = {
  state: "ready",
  result: { roleId: "r1", policy: "score/2", fingerprint: "x", score: 40, bullets: [], nextStep: null, questions: [] } satisfies RoleResult,
};
const failedSave = () => Promise.reject(new SaveNotDoneError());

function Tools({ focus }: { focus: { key: CategoryKey; itemId?: string } }) {
  const [state, setState] = useState(cv);
  return (
    <SectionTools
      cv={state}
      dispatch={(a) => setState((c) => cvReducer(c, a))}
      focus={focus}
      onBack={() => {}}
      onFocusPage={() => {}}
      scores={new Map([["r1", score]])}
      waitForSave={failedSave}
    />
  );
}

describe("when the save before an AI step fails", () => {
  it("Suggest skills does not ask the server and shows a short message", async () => {
    render(<Tools focus={{ key: "skills" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Suggest skills from my experience" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your changes first.");
    expect(screen.getByRole("button", { name: "Suggest skills from my experience" })).toBeEnabled();
    expect(api.getSkillSuggestions).not.toHaveBeenCalled();
  });
});

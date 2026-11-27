import { describe, expect, it, vi } from "vitest";
import { emptyCv, TAILOR_SECTIONS, type MatchScore, type TailorRun, type TailorSection } from "@resumora/shared";
import { ApiClientError } from "../lib/api.ts";
import { runAll, stepsOf } from "./run-all.ts";

const at = "2026-11-27T10:00:00Z";
const role = (id: string) => ({ id, company: "Emedi", title: id, location: "", startDate: "2021-03", endDate: "", current: true, description: "", notes: [], bullets: [] });
const cv = { ...emptyCv("en"), experience: [role("r1"), role("r2"), role("r3")], projects: [{ ...role("p1"), url: "" }] };
const sections: TailorSection[] = ["experience", "projects", "skills", "summary", "languages", "layout"];
const run = (over: Partial<TailorRun> = {}): TailorRun => ({
  id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor", sections, status: "running", currentSection: "experience",
  errorCode: null, roleOrder: ["r1", "r2", "r3", "p1"], currentRoleId: "r1", createdAt: at, updatedAt: at, questions: [], answers: [], proposals: null, ...over,
});
const score: MatchScore = { policy: "match/1", total: 93, band: "excellent", capped: false, labels: [], parts: { requirements: null, keywords: null, seniority: null, langEdu: null } };
const name = (section: TailorSection, roleId?: string) => roleId ?? section;

describe("the steps of a run", () => {
  it("are every role and project, then the other sections; the layout step is not among them", () => {
    expect(stepsOf(run(), cv).map((step) => name(step.section, step.roleId))).toEqual(["r1", "r2", "r3", "p1", "skills", "summary", "languages"]);
    // Only the sections the run has (a re-tailor of one section), and only the roles still in the CV.
    expect(stepsOf(run({ sections: ["skills"] }), cv)).toEqual([{ section: "skills" }]);
    expect(stepsOf(run({ roleOrder: ["r1", "gone"] }), cv).map((step) => name(step.section, step.roleId))).toEqual(["r1", "skills", "summary", "languages"]);
    expect(TAILOR_SECTIONS).toContain("layout");
  });
});

describe("running every step at once", () => {
  function api(fail: (step: string, attempt: number) => unknown = () => null) {
    const order: string[] = [];
    const attempts = new Map<string, number>();
    let flying = 0;
    let most = 0;
    const writeStep = vi.fn(async (_id: string, section: TailorSection, roleId?: string) => {
      const step = name(section, roleId);
      order.push(step);
      const attempt = (attempts.get(step) ?? 0) + 1;
      attempts.set(step, attempt);
      most = Math.max(most, ++flying);
      await new Promise((resolve) => setTimeout(resolve, 1));
      flying--;
      const error = fail(step, attempt);
      if (error) throw error;
      return { changed: 1, removed: 0 };
    });
    const finishRun = vi.fn(async () => { order.push("finish"); return { run: run({ status: "done", currentSection: null }), score }; });
    return { writeStep, finishRun, order, most: () => most };
  }

  it("writes the steps a few at a time, the layout step after them, then finishes with one score", async () => {
    const calls = api();
    const seen: string[] = [];
    const result = await runAll(calls, run(), cv, (progress) => seen.push(`${progress.done}/${progress.total}`), 3);
    expect(calls.most()).toBe(3);
    expect(calls.order.slice(0, 7).sort()).toEqual(["languages", "p1", "r1", "r2", "r3", "skills", "summary"]);
    expect(calls.order.slice(7)).toEqual(["layout", "finish"]);
    expect(seen).toEqual(["1/8", "2/8", "3/8", "4/8", "5/8", "6/8", "7/8", "8/8"]);
    expect(result).toMatchObject({ run: { status: "done" }, score: { total: 93 }, failed: [] });
    expect(calls.finishRun).toHaveBeenCalledTimes(1);
  });

  it("tries a failed step once more, and finishes without a step that fails twice", async () => {
    const calls = api((step, attempt) => (step === "r2" && attempt === 1) || step === "summary" ? new Error("ai") : null);
    const result = await runAll(calls, run(), cv, () => {});
    expect(calls.order.filter((step) => step === "r2")).toHaveLength(2);
    expect(calls.order.filter((step) => step === "summary")).toHaveLength(2);
    expect(result.failed).toEqual([{ section: "summary" }]);
    expect(calls.order.at(-1)).toBe("finish");
  });

  it("stops at once when the job is gone or the CV was replaced", async () => {
    const gone = new ApiClientError(404, "job_not_found", "This job was deleted.");
    const calls = api((step) => (step === "r1" ? gone : null));
    await expect(runAll(calls, run(), cv, () => {}, 2)).rejects.toBe(gone);
    expect(calls.finishRun).not.toHaveBeenCalled();
    expect(calls.order.filter((step) => step === "r1")).toHaveLength(1);
    // The step that was in flight beside it ends; no further step is started.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.order).toEqual(["r1", "r2"]);
  });

  it("a run with no layout step goes straight to the finish", async () => {
    const calls = api();
    const seen: string[] = [];
    await runAll(calls, run({ sections: ["skills"] }), cv, (progress) => seen.push(`${progress.done}/${progress.total}`));
    expect(calls.order).toEqual(["skills", "finish"]);
    expect(seen).toEqual(["1/1"]);
  });
});

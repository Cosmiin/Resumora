import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { emptyCv, type Experience, type Job, type JobListPage, type MatchScore } from "@resumora/shared";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() }));
vi.mock("../lib/supabase.ts", () => ({ supabase: { auth } }));
vi.mock("./jobs-api.ts", () => ({ getJob: vi.fn(), getJobScore: vi.fn(), patchJob: vi.fn(), deleteJob: vi.fn(), listJobs: vi.fn(), createJob: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
vi.mock("../cv/enrich/useRoleScores.ts", () => ({ useRoleScores: vi.fn() }));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
import { getCv } from "../cv/cv-api.ts";
import { useRoleScores } from "../cv/enrich/useRoleScores.ts";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { AuthProvider } from "../auth/AuthProvider.tsx";
import { routes } from "../router.tsx";
import { ApiClientError } from "../lib/api.ts";
import { deleteJob, getJob, getJobScore, listJobs, patchJob } from "./jobs-api.ts";
import { JobThoughts } from "./JobThoughts.tsx";

const job: Job = {
  id: "one", title: "Engineer", company: "Acme", location: "London", status: "ready",
  errorCode: null, source: "link", url: "https://example.com/jobs/1", createdAt: "2026-11-05T10:00:00Z",
  updatedAt: "2026-11-05T10:00:00Z", version: 1, editedByUser: false,
  userThoughts: null, applicationStatus: "saved",
  rawText: "We need Strong SQL skills.\nGerman is welcome.\n<b>Plain text</b>",
  extracted: {
    title: "Engineer", company: "Acme", location: "London", workMode: "hybrid", employmentType: "full_time",
    seniority: "unknown", salary: { min: 7000, max: 9000, currency: "RON", period: "month" },
    summary: "Build useful tools.", requirements: [
      { text: "Strong SQL skills", kind: "must", category: "skill" },
      { text: "German", kind: "nice", category: "language" },
    ], responsibilities: ["Build reports"], benefits: ["Meal allowance"], applyBy: "2026-12-01", isJobPosting: true,
  },
};
function renderJob(path = "/jobs/one") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/jobs/:id/tailor", element: <p>Tailoring</p> }, ...routes], { initialEntries: [path] });
  render(<QueryClientProvider client={client}><AuthProvider><RouterProvider router={router} /></AuthProvider></QueryClientProvider>);
  return { router, client };
}
const role: Experience = { id: "role", company: "Acme", title: "Engineer", location: "", startDate: "2024", endDate: "",
  current: true, description: "", bullets: [], notes: [], facts: { items: ["Built reports"], fromNotes: "", updatedAt: "2026-11-05T10:00:00Z" } };
const match: MatchScore = { policy: "match/1", total: 80, band: "strong", capped: false, labels: [],
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } };
const roleScores = (score: number) => ({ scores: new Map([["role", { state: "ready" as const,
  result: { roleId: "role", policy: "score/2", fingerprint: "x", score, bullets: [], nextStep: null, questions: [], roleQuestions: [] } }]]), retry: vi.fn() });
const ready = () => screen.findByRole("heading", { name: "Engineer", level: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u1", email: "ana@example.com" } } } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  vi.mocked(getJob).mockResolvedValue(job);
  vi.mocked(getJobScore).mockResolvedValue({ base: null, tailored: null });
  vi.mocked(patchJob).mockImplementation(async (_id, version, extracted, changes) => ({ ...job, extracted, ...changes, version: version + 1 }));
  vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv(), experience: [role] }, version: 1, updatedAt: job.updatedAt });
  vi.mocked(useRoleScores).mockReturnValue(roleScores(80));
  vi.mocked(useVoice).mockReturnValue({ state: "idle", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
    interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
  vi.mocked(listJobs).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(deleteJob).mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("job page", () => {
  it("keeps the newest queued thoughts visible when their save fails after an earlier response", async () => {
    let finishFirst!: (value: Job) => void, failNext!: (cause: Error) => void;
    const first = new Promise<Job>((resolve) => { finishFirst = resolve; });
    const next = new Promise<Job>((_resolve, reject) => { failNext = reject; });
    vi.mocked(patchJob).mockReturnValueOnce(first).mockReturnValueOnce(next);
    const { client } = renderJob(); await ready();
    const field = screen.getByRole("textbox", { name: "Your thoughts on this role" });
    fireEvent.change(field, { target: { value: "First thoughts" } }); fireEvent.blur(field);
    await waitFor(() => expect(patchJob).toHaveBeenCalledTimes(1));
    fireEvent.change(field, { target: { value: "Intermediate thoughts" } }); fireEvent.blur(field);
    fireEvent.change(field, { target: { value: "Newest thoughts" } }); fireEvent.blur(field);
    await act(async () => { finishFirst({ ...job, userThoughts: "First thoughts", version: 2 }); });
    await waitFor(() => expect(patchJob).toHaveBeenCalledTimes(2));
    expect(field).toHaveValue("Newest thoughts");
    expect(patchJob).toHaveBeenLastCalledWith("one", 2, job.extracted, { userThoughts: "Newest thoughts" });
    await act(async () => { failNext(new ApiClientError(409, "version_conflict", "Changed elsewhere")); });
    expect(await screen.findByRole("alert")).toHaveTextContent("This job changed elsewhere.");
    expect(field).toHaveValue("Newest thoughts");
    expect(client.getQueryData(["job", "u1", "one"])).toMatchObject({ userThoughts: "First thoughts", version: 2 });
    expect(patchJob).toHaveBeenCalledTimes(2);
  });
  it("does not retry failed thoughts on unmount when opening Edit", async () => {
    vi.mocked(patchJob).mockRejectedValueOnce(new ApiClientError(409, "version_conflict", "Changed elsewhere"));
    renderJob(); await ready();
    const field = screen.getByRole("textbox", { name: "Your thoughts on this role" });
    await userEvent.type(field, "Unsaved thoughts"); await userEvent.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent("This job changed elsewhere.");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Job title" })).toBeInTheDocument();
    expect(patchJob).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Save" })); await ready();
    expect(patchJob).toHaveBeenCalledTimes(2);
    expect(patchJob).toHaveBeenLastCalledWith("one", 1, job.extracted);
  });
  it("refreshes clean unfocused thoughts while keeping focused or unsaved text", async () => {
    const onSave = vi.fn(async () => undefined);
    const { rerender } = render(<JobThoughts value="Original thoughts" onSave={onSave} />);
    const field = screen.getByRole("textbox", { name: "Your thoughts on this role" });
    rerender(<JobThoughts value="Refetched thoughts" onSave={onSave} />);
    expect(field).toHaveValue("Refetched thoughts");
    await userEvent.click(field);
    rerender(<JobThoughts value="Changed while focused" onSave={onSave} />);
    expect(field).toHaveValue("Refetched thoughts");
    await userEvent.tab();
    fireEvent.change(field, { target: { value: "Unsaved thoughts" } });
    rerender(<JobThoughts value="Changed elsewhere again" onSave={onSave} />);
    expect(field).toHaveValue("Unsaved thoughts");
  });
  it("keeps Edit disabled until thoughts and status saves settle, then edits the current version", async () => {
    let finishThoughts!: (value: Job) => void, finishStatus!: (value: Job) => void;
    const thoughts = new Promise<Job>((resolve) => { finishThoughts = resolve; });
    const status = new Promise<Job>((resolve) => { finishStatus = resolve; });
    vi.mocked(patchJob).mockReturnValueOnce(thoughts).mockReturnValueOnce(status);
    renderJob(); await ready();
    const edit = screen.getByRole("button", { name: "Edit" });
    fireEvent.change(screen.getByRole("textbox", { name: "Your thoughts on this role" }), { target: { value: "My thoughts" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Your thoughts on this role" }));
    await waitFor(() => expect(edit).toBeDisabled());
    await userEvent.click(edit);
    expect(screen.queryByRole("textbox", { name: "Job title" })).not.toBeInTheDocument();
    await act(async () => { finishThoughts({ ...job, userThoughts: "My thoughts", version: 2 }); });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Application status" }), "applied");
    expect(edit).toBeDisabled();
    await userEvent.click(edit);
    expect(screen.queryByRole("textbox", { name: "Job title" })).not.toBeInTheDocument();
    await act(async () => { finishStatus({ ...job, userThoughts: "My thoughts", applicationStatus: "applied", version: 3 }); });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await ready();
    expect(patchJob).toHaveBeenLastCalledWith("one", 3, job.extracted);
  });
  it("saves thoughts reverted to their original value while the earlier save is pending", async () => {
    let finishFirst!: (value: Job) => void;
    const first = new Promise<Job>((resolve) => { finishFirst = resolve; });
    vi.mocked(getJob).mockResolvedValue({ ...job, userThoughts: "Original thoughts" });
    vi.mocked(patchJob).mockImplementationOnce(() => first);
    const { client } = renderJob(); await ready();
    const field = screen.getByRole("textbox", { name: "Your thoughts on this role" });
    fireEvent.change(field, { target: { value: "Changed thoughts" } }); fireEvent.blur(field);
    await waitFor(() => expect(patchJob).toHaveBeenCalledTimes(1));
    fireEvent.change(field, { target: { value: "Original thoughts" } }); fireEvent.blur(field);
    await act(async () => { finishFirst({ ...job, userThoughts: "Changed thoughts", version: 2 }); });
    await waitFor(() => expect(client.getQueryData(["job", "u1", "one"])).toMatchObject({ userThoughts: "Original thoughts", version: 3 }));
    expect(patchJob).toHaveBeenLastCalledWith("one", 2, job.extracted, { userThoughts: "Original thoughts" });
  });
  it("blocks Edit during dictation and saves transcribed thoughts when leaving", async () => {
    const { router } = renderJob(); await ready();
    const voice = vi.mocked(useVoice).mock.results[0]!.value;
    await userEvent.click(screen.getByRole("button", { name: "Speak your thoughts" }));
    vi.mocked(useVoice).mockReturnValue({ ...voice, state: "recording" });
    act(() => vi.mocked(voice.onFinal).mock.calls.at(-1)![0]("Spoken thoughts"));
    const edit = screen.getByRole("button", { name: "Edit" });
    expect(edit).toBeDisabled();
    await userEvent.click(edit);
    expect(screen.getByRole("textbox", { name: "Your thoughts on this role" })).toHaveValue("Spoken thoughts");
    await userEvent.click(screen.getByRole("link", { name: /All jobs/ }));
    expect(router.state.location.pathname).toBe("/jobs");
    expect(voice.stop).toHaveBeenCalled();
    await waitFor(() => expect(patchJob).toHaveBeenCalledWith("one", 1, job.extracted, { userThoughts: "Spoken thoughts" }));
  });
  it("shows the gate for stale or loading role scores despite an earlier high score", async () => {
    const { router } = renderJob(); await ready();
    for (const state of ["previous", "scoring"] as const) {
      vi.mocked(useRoleScores).mockReturnValue({ scores: new Map([["role", { state, result: roleScores(80).scores.get("role")!.result }]]), retry: vi.fn() });
      await userEvent.click(screen.getByRole("button", { name: "Tailor my CV" }));
      expect(await screen.findByRole("button", { name: "Enrich first" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Tailor anyway" })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/jobs/one");
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    }
  });
  it.each([false, true])("warns about tailored CV deletion only when one exists: %s", async (tailored) => {
    vi.mocked(getJobScore).mockResolvedValue({ base: match, tailored: tailored ? match : null });
    renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = within(screen.getByRole("dialog", { name: "Delete this job?" }));
    expect(!!dialog.queryByText("This also deletes its tailored CVs, translations and cover letters.")).toBe(tailored);
  });
  it.each(["queued", "processing", "needs_text", "failed"] as const)("explains why a %s job cannot be tailored", async (status) => {
    vi.mocked(getJob).mockResolvedValue({ ...job, status, extracted: null });
    renderJob();
    const button = await screen.findByRole("button", { name: "Tailor my CV" });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(screen.getByRole("status")).toHaveTextContent(status === "failed" ? "This job couldn't be read."
      : status === "needs_text" ? "This job needs its description" : "This job isn't ready yet.");
    expect(getCv).not.toHaveBeenCalled();
  });
  it.each(["score", "facts"])("shows the weak-CV gate for missing %s and allows tailoring anyway", async (reason) => {
    if (reason === "score") vi.mocked(useRoleScores).mockReturnValue(roleScores(59));
    else vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv(), experience: [{ ...role, facts: null }] }, version: 1, updatedAt: job.updatedAt });
    const { router } = renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Tailor my CV" }));
    expect(await screen.findByRole("button", { name: "Enrich first" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tailor anyway" }));
    expect(router.state.location.pathname).toBe("/jobs/one/tailor");
  });
  it("opens My CV when Enrich first is chosen", async () => {
    vi.mocked(useRoleScores).mockReturnValue(roleScores(40));
    const { router } = renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Tailor my CV" }));
    await userEvent.click(await screen.findByRole("button", { name: "Enrich first" }));
    expect(router.state.location.pathname).toBe("/cv");
  });
  it("uses the average and the newest role even when roles are out of order", async () => {
    const scored = roleScores(80);
    scored.scores.set("older", { state: "ready", result: { ...scored.scores.get("role")!.result, roleId: "older", score: 40 } });
    vi.mocked(useRoleScores).mockReturnValue(scored);
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv(), experience: [
      { ...role, id: "older", current: false, startDate: "2020", endDate: "2022", facts: null }, role,
    ] }, version: 1, updatedAt: job.updatedAt });
    const { router } = renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Tailor my CV" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/jobs/one/tailor"));
    expect(screen.queryByRole("button", { name: "Tailor anyway" })).not.toBeInTheDocument();
  });
  it("saves thoughts on blur, refreshes the cached job and preserves the selected tab", async () => {
    const { client } = renderJob(); await ready();
    const field = screen.getByRole("textbox", { name: "Your thoughts on this role" });
    expect(field).toHaveAttribute("maxlength", "2000");
    await userEvent.type(field, "I enjoy reporting.");
    expect(patchJob).not.toHaveBeenCalled();
    await userEvent.tab();
    await waitFor(() => expect(client.getQueryData(["job", "u1", "one"])).toMatchObject({ userThoughts: "I enjoy reporting.", version: 2 }));
    expect(patchJob).toHaveBeenCalledWith("one", 1, job.extracted, { userThoughts: "I enjoy reporting." });
    expect(screen.getByRole("tab", { name: "Job ad" })).toHaveAttribute("aria-selected", "true");
  });
  it("keeps thoughts visible and warns when their save has a version conflict", async () => {
    vi.mocked(patchJob).mockRejectedValue(new ApiClientError(409, "version_conflict", "Changed elsewhere"));
    renderJob(); await ready();
    const field = screen.getByRole("textbox", { name: "Your thoughts on this role" });
    await userEvent.type(field, "My thoughts"); await userEvent.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent("This job changed elsewhere.");
    expect(field).toHaveValue("My thoughts");
  });
  it("appends voice to typed thoughts, caps it at 2000 and saves on blur", async () => {
    renderJob(); await ready();
    const field = screen.getByRole("textbox", { name: "Your thoughts on this role" });
    await userEvent.type(field, "Interested");
    await userEvent.click(screen.getByRole("button", { name: "Speak your thoughts" }));
    const voice = vi.mocked(useVoice).mock.results[0]!.value;
    expect(voice.start).toHaveBeenCalled();
    const final = vi.mocked(voice.onFinal).mock.calls.at(-1)![0];
    act(() => final("in reporting " + "x".repeat(2000)));
    expect(field).toHaveValue(("Interested in reporting " + "x".repeat(2000)).slice(0, 2000));
    fireEvent.blur(field);
    await waitFor(() => expect(patchJob).toHaveBeenCalledWith("one", 1, job.extracted, { userThoughts: expect.any(String) }));
  });
  it("offers all six statuses and saves the selected status", async () => {
    const { client } = renderJob(); await ready();
    const select = screen.getByRole("combobox", { name: "Application status" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Saved", "Tailored", "Applied", "Interview", "Offer", "Rejected"]);
    await userEvent.selectOptions(select, "applied");
    await waitFor(() => expect(client.getQueryData(["job", "u1", "one"])).toMatchObject({ applicationStatus: "applied", version: 2 }));
    expect(patchJob).toHaveBeenCalledWith("one", 1, job.extracted, { applicationStatus: "applied" });
  });
  it("keeps both tabs free of the editor panel class", async () => {
    renderJob(); await ready();
    expect(screen.getByRole("tabpanel", { name: "Job ad" })).not.toHaveClass("panel");
    await userEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(screen.getByRole("tabpanel", { name: "Summary" })).not.toHaveClass("panel");
  });
  it("shows facts, an enabled Tailor button and the exact ad with requirement marks", async () => {
    const { client } = renderJob(); await ready();
    expect(getJob).toHaveBeenCalledWith("one");
    expect(client.getQueryData(["job", "u1", "one"])).toEqual(job);
    for (const text of ["Acme · London", "Hybrid", "Full time", "7,000–9,000 RON / month", "Apply by 1 Dec 2026"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.queryByText(/2026-12-01/)).not.toBeInTheDocument();
    expect(screen.queryByText("Not stated")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tailor my CV" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "Job ad" })).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: "Job ad" });
    expect(panel.querySelector(".doc")?.textContent).toBe(job.rawText);
    expect(panel.querySelector("b")).toBeNull();
    expect(within(panel).getByTitle("Must have")).toHaveTextContent("Strong SQL skills");
    expect(within(panel).getByTitle("Nice to have")).toHaveTextContent("German");
    expect(screen.getByRole("link", { name: "View original posting" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "View original posting" })).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Summary read by AI. Check it against the ad.")).toBeInTheDocument();
  });

  it("switches summary tabs by click and both arrow keys, moving focus", async () => {
    renderJob(); await ready();
    const ad = screen.getByRole("tab", { name: "Job ad" });
    const summary = screen.getByRole("tab", { name: "Summary" });
    await userEvent.click(summary);
    for (const name of ["Must have (1)", "Nice to have (1)", "What you would do", "Benefits"]) {
      expect(within(screen.getByRole("tabpanel")).getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Skill")).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(ad).toHaveFocus(); expect(ad).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(summary).toHaveFocus(); expect(summary).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Build useful tools.")).toBeInTheDocument();
  });

  it("shows missing text, empty requirement boxes, and user-edited attribution", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job, rawText: null, editedByUser: true,
      extracted: { ...job.extracted!, requirements: [], benefits: [] } });
    renderJob(); await ready();
    expect(screen.getByText("The original text isn't available for this job.")).toBeInTheDocument();
    expect(screen.getByText("Summary edited by you")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(screen.getByRole("heading", { name: "Must have (0)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nice to have (0)" })).toBeInTheDocument();
    expect(screen.getAllByText("None listed.")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Benefits" })).not.toBeInTheDocument();
  });

  it.each([
    [{ min: 0, max: null, currency: null, period: null }, "0"],
    [{ min: null, max: 9000, currency: null, period: "year" }, "9,000 / year"],
  ] as const)("formats partial salaries including zero: %j", async (salary, text) => {
    vi.mocked(getJob).mockResolvedValue({ ...job, extracted: { ...job.extracted!, salary } });
    renderJob(); await ready(); expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("keeps the back link while loading", async () => {
    vi.mocked(getJob).mockReturnValue(new Promise(() => {}));
    renderJob();
    expect(await screen.findByRole("link", { name: "← All jobs" })).toHaveAttribute("href", "/jobs");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it.each(["queued", "processing"] as const)("polls %s jobs every three seconds until ready", async (status) => {
    vi.mocked(getJob).mockResolvedValueOnce({ ...job, status, extracted: null }).mockResolvedValue(job);
    vi.useFakeTimers();
    await act(async () => { renderJob(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole("heading", { name: "Reading this job" })).toBeInTheDocument();
    expect(screen.getByText("Reading job…")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View original posting" })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2998); });
    expect(getJob).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole("heading", { name: "Engineer" })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(getJob).toHaveBeenCalledTimes(2);
  });

  it("stops polling after two minutes and explains how to check again", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job, status: "queued", extracted: null });
    vi.useFakeTimers();
    await act(async () => { renderJob(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole("heading", { name: "Reading this job" })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(screen.getByText("Still reading. Reload the page to check again.")).toBeInTheDocument();
    const calls = vi.mocked(getJob).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(getJob).toHaveBeenCalledTimes(calls);
  });

  it.each([["not_a_job", "This page doesn't look like a job posting."], [null, "We couldn't read this job."],
    ["fetch_blocked", "We couldn't read this job."]] as const)("shows the failed message for %s", async (errorCode, message) => {
    vi.mocked(getJob).mockResolvedValue({ ...job, status: "failed", errorCode, extracted: null });
    renderJob(); expect(await screen.findByRole("heading", { name: message })).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(errorCode === "not_a_job"
      ? "Check that you pasted a single job ad, then delete this and add it again." : "Delete it and add it again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("shows a missing job with a back link", async () => {
    vi.mocked(getJob).mockRejectedValue(new ApiClientError(404, "not_found", "Missing"));
    renderJob(); expect(await screen.findByText("This job isn't in your list.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← All jobs" })).toHaveAttribute("href", "/jobs");
  });

  it("retries other loading failures", async () => {
    vi.mocked(getJob).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(job);
    renderJob(); expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong loading your jobs.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" })); await ready();
  });

  it("confirms deletion, removes the job from every cached page and returns to jobs", async () => {
    const { client, router } = renderJob(); await ready();
    const other = { ...job, id: "two", title: "Designer" };
    const cached: InfiniteData<JobListPage> = {
      pages: [{ items: [job, other], nextCursor: "next" }, { items: [job], nextCursor: null }], pageParams: [undefined, "next"],
    };
    client.setQueryData(["jobs", "u1"], cached);
    client.setQueryData(["jobs", "u2"], cached);
    vi.mocked(listJobs).mockReturnValue(new Promise(() => {}));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this job?")).toBeInTheDocument();
    expect(deleteJob).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/jobs"));
    expect(deleteJob).toHaveBeenCalledWith("one");
    expect(client.getQueryData(["jobs", "u1"])).toEqual({ ...cached,
      pages: [{ items: [other], nextCursor: "next" }, { items: [], nextCursor: null }] });
    expect(client.getQueryData(["jobs", "u2"])).toEqual(cached);
    expect(screen.queryByRole("link", { name: /Engineer/ })).not.toBeInTheDocument();
  });

  it("warns about tailored CVs when the score could not be loaded", async () => {
    vi.mocked(getJobScore).mockRejectedValue(new Error("down"));
    renderJob(); await ready();
    await screen.findByText("Couldn't load your match score.");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("This also deletes its tailored CVs, translations and cover letters.")).toBeInTheDocument();
  });

  it("does not warn about tailored CVs for a failed job", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job, status: "failed", errorCode: "ai_failed", extracted: null });
    renderJob(); await screen.findByRole("button", { name: "Delete" });
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(within(screen.getByRole("dialog")).queryByText("This also deletes its tailored CVs, translations and cover letters.")).toBeNull();
  });

  it("saves on unmount again after a failed save is followed by a successful one", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined);
    const { unmount } = render(<JobThoughts value="" onSave={onSave} />);
    const field = screen.getByRole("textbox", { name: "Your thoughts on this role" });
    fireEvent.change(field, { target: { value: "One" } }); fireEvent.blur(field);
    await screen.findByRole("alert");
    fireEvent.change(field, { target: { value: "Two" } }); fireEvent.blur(field);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    fireEvent.change(field, { target: { value: "Three" } });
    unmount();
    expect(onSave).toHaveBeenCalledTimes(3);
    expect(onSave).toHaveBeenLastCalledWith("Three");
  });

  it("cancels deletion and keeps the job", async () => {
    const { router } = renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Delete this job?")).not.toBeInTheDocument();
    expect(deleteJob).not.toHaveBeenCalled(); expect(router.state.location.pathname).toBe("/jobs/one");
  });

  it("keeps the job and reports a failed delete", async () => {
    vi.mocked(deleteJob).mockRejectedValue(new Error("Can't delete this job."));
    const { router } = renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't delete this job.");
    expect(router.state.location.pathname).toBe("/jobs/one"); expect(await ready()).toBeInTheDocument();
  });

  it("opens the job page from its list row", async () => {
    vi.mocked(listJobs).mockResolvedValue({ items: [job], nextCursor: null });
    const { router } = renderJob("/jobs");
    fireEvent.click(await screen.findByRole("link", { name: /Engineer/ }));
    await ready(); expect(router.state.location.pathname).toBe("/jobs/one");
  });
});

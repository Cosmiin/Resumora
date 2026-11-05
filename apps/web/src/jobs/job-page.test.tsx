import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import type { Job, JobListPage } from "@resumora/shared";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() }));
vi.mock("../lib/supabase.ts", () => ({ supabase: { auth } }));
vi.mock("./jobs-api.ts", () => ({ getJob: vi.fn(), deleteJob: vi.fn(), listJobs: vi.fn(), createJob: vi.fn() }));
import { AuthProvider } from "../auth/AuthProvider.tsx";
import { routes } from "../router.tsx";
import { ApiClientError } from "../lib/api.ts";
import { deleteJob, getJob, listJobs } from "./jobs-api.ts";

const job: Job = {
  id: "one", title: "Engineer", company: "Acme", location: "London", status: "ready",
  errorCode: null, source: "link", url: "https://example.com/jobs/1", createdAt: "2026-11-05T10:00:00Z",
  updatedAt: "2026-11-05T10:00:00Z", version: 1, editedByUser: false,
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
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<QueryClientProvider client={client}><AuthProvider><RouterProvider router={router} /></AuthProvider></QueryClientProvider>);
  return { router, client };
}
const ready = () => screen.findByRole("heading", { name: "Engineer", level: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u1", email: "ana@example.com" } } } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  vi.mocked(getJob).mockResolvedValue(job);
  vi.mocked(listJobs).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(deleteJob).mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("job page", () => {
  it("keeps both tabs free of the editor panel class", async () => {
    renderJob(); await ready();
    expect(screen.getByRole("tabpanel", { name: "Job ad" })).not.toHaveClass("panel");
    await userEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(screen.getByRole("tabpanel", { name: "Summary" })).not.toHaveClass("panel");
  });
  it("shows facts, a disabled Tailor button and the exact ad with requirement marks", async () => {
    const { client } = renderJob(); await ready();
    expect(getJob).toHaveBeenCalledWith("one");
    expect(client.getQueryData(["job", "u1", "one"])).toEqual(job);
    for (const text of ["Acme · London", "Hybrid", "Full time", "7,000–9,000 RON / month", "Apply by 1 Dec 2026"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.queryByText(/2026-12-01/)).not.toBeInTheDocument();
    expect(screen.queryByText("Not stated")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tailor your CV →" })).toBeDisabled();
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

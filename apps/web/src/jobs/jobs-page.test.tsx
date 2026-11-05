import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { JobListItem } from "@resumora/shared";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() }));
vi.mock("../lib/supabase.ts", () => ({ supabase: { auth } }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: () => new Promise(() => {}) }));
vi.mock("./jobs-api.ts", () => ({ listJobs: vi.fn(), createJob: vi.fn() }));
import { AuthProvider } from "../auth/AuthProvider.tsx";
import { routes } from "../router.tsx";
import { setUnsavedChanges } from "../cv/unsaved.ts";
import { ApiClientError } from "../lib/api.ts";
import { createJob, listJobs } from "./jobs-api.ts";

const job: JobListItem = {
  id: "one", title: "Engineer", company: "Acme", location: "London", status: "ready",
  errorCode: null, source: "link", url: "https://www.example.com/jobs/1", createdAt: "2026-11-05T10:00:00Z",
};
const page = (items: JobListItem[], nextCursor: string | null = null) => ({ items, nextCursor });
function renderJobs(path = "/jobs") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AuthProvider><RouterProvider router={router} /></AuthProvider>
  </QueryClientProvider>);
  return router;
}
async function openDialog() {
  const opener = (await screen.findAllByRole("button", { name: "+ Add job" }))[0]!;
  await userEvent.click(opener);
  return opener;
}
function fillDialog(url = "https://example.com/jobs/2", text = "x".repeat(200)) {
  fireEvent.change(screen.getByLabelText("Link to the job ad"), { target: { value: url } });
  fireEvent.change(screen.getByLabelText("Job description"), { target: { value: text } });
}
const submit = () => userEvent.click(screen.getByRole("button", { name: "Add job" }));

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u1", email: "ana@example.com" } } } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  vi.mocked(listJobs).mockResolvedValue(page([job]));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); setUnsavedChanges(false); });

describe.each([["/cv", "Jobs", "/jobs"], ["/jobs", "My CV", "/cv"]])("navigation from %s", (from, link, to) => {
  it.each([[true, false], [true, true], [false, false]])("handles unsaved=%s and confirmation=%s", async (unsaved, accepted) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(accepted);
    const router = renderJobs(from);
    const target = await screen.findByRole("link", { name: link });
    setUnsavedChanges(unsaved);
    await userEvent.click(target);
    expect(router.state.location.pathname).toBe(unsaved && !accepted ? from : to);
    if (unsaved) expect(confirm).toHaveBeenCalledWith("You have unsaved changes. Leave this page anyway?");
    else expect(confirm).not.toHaveBeenCalled();
  });
});
describe("jobs list", () => {
  it("lists jobs, hosts, dates and badges with the active Jobs navigation", async () => {
    vi.mocked(listJobs).mockResolvedValue(page([job,
      { ...job, id: "two", title: null, company: null, location: null, status: "queued" },
      { ...job, id: "three", title: "Designer", status: "processing" },
      { ...job, id: "four", title: "Writer", status: "failed" },
    ]));
    renderJobs();
    expect(await screen.findByRole("link", { name: /Engineer/ })).toHaveAttribute("href", "/jobs/one");
    expect(within(screen.getByRole("link", { name: /Engineer/ })).getByText("Acme · London")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example.com/ })).toHaveAttribute("href", "/jobs/two");
    expect(screen.getAllByText("Reading job…")).toHaveLength(2);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getAllByText("5 Nov")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
    expect(listJobs).toHaveBeenCalledWith(undefined);
  });

  it("appends more jobs, deduplicates against refreshed first-page rows and ends pagination", async () => {
    vi.mocked(listJobs).mockResolvedValueOnce(page([job], "next"))
      .mockResolvedValueOnce(page([{ ...job, title: "Old title" }, { ...job, id: "two", title: "Designer" }]));
    renderJobs();
    await userEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: /Designer/ })).toBeInTheDocument();
    expect(listJobs).toHaveBeenLastCalledWith("next");
    expect(screen.getAllByRole("link", { name: /Engineer/ })).toHaveLength(1);
    expect(screen.queryByText("Old title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("keeps loaded jobs across the 50th row when adding shifts page boundaries", async () => {
    const old = Array.from({ length: 60 }, (_, i) => ({ ...job, id: `old-${i}`, title: `Job ${i + 1}` }));
    const added = { ...job, id: "new", title: "Newest job", status: "queued" as const };
    let finish!: (value: ReturnType<typeof page>) => void;
    vi.mocked(listJobs).mockResolvedValueOnce(page(old.slice(0, 50), "old-cursor"))
      .mockResolvedValueOnce(page(old.slice(50)))
      .mockResolvedValueOnce(page([added, ...old.slice(0, 49)], "new-cursor"))
      .mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    vi.mocked(createJob).mockResolvedValue({ id: "new", existing: false });
    renderJobs();
    await userEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByText("Job 60");
    await openDialog(); fillDialog(); await submit();
    await waitFor(() => expect(listJobs).toHaveBeenCalledWith("new-cursor"));
    for (const item of old) expect(screen.getByText(item.title)).toBeInTheDocument();
    await act(async () => finish(page([...old.slice(49), { ...added, title: "Outdated title" }])));
    await screen.findByText("Newest job");
    for (const item of [...old, added]) expect(screen.getAllByText(item.title)).toHaveLength(1);
    expect(screen.queryByText("Outdated title")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(61);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("waits for a running refetch before loading more with the new cursor", async () => {
    const old = Array.from({ length: 60 }, (_, i) => ({ ...job, id: `old-${i}`, title: `Job ${i + 1}` }));
    const added = { ...job, id: "new", title: "Newest job" };
    let finish!: (value: ReturnType<typeof page>) => void;
    vi.mocked(listJobs).mockResolvedValueOnce(page(old.slice(0, 50), "old-cursor"))
      .mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(page(old.slice(49)));
    vi.mocked(createJob).mockResolvedValue({ id: "new", existing: false });
    renderJobs(); await screen.findByText("Job 50");
    await openDialog(); fillDialog(); await submit();
    await waitFor(() => expect(listJobs).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(listJobs).toHaveBeenCalledTimes(2);
    await act(async () => finish(page([added, ...old.slice(0, 49)], "new-cursor")));
    await screen.findByText("Job 60");
    expect(listJobs).toHaveBeenLastCalledWith("new-cursor");
    for (const item of [...old, added]) expect(screen.getAllByText(item.title)).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(61);
  });
  it("searches all displayed fields and hides Load more during search", async () => {
    vi.mocked(listJobs).mockResolvedValue(page([job], "next"));
    renderJobs();
    const search = await screen.findByRole("searchbox", { name: "Search your jobs" });
    await screen.findByRole("link", { name: /Engineer/ });
    for (const value of ["ENGINEER", "acme", "LONDON", "example.com"]) {
      fireEvent.change(search, { target: { value } });
      expect(screen.getByRole("link", { name: /Engineer/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    }
    fireEvent.change(search, { target: { value: "missing" } });
    expect(screen.getByText('No jobs match "missing".')).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Engineer/ })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("shows an empty state and lets its Add button open the dialog", async () => {
    vi.mocked(listJobs).mockResolvedValue(page([]));
    renderJobs();
    expect(await screen.findByText("No jobs yet")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "+ Add job" });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[1]!);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(buttons[1]).toHaveFocus();
  });

  it("shows a list error and retries", async () => {
    vi.mocked(listJobs).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page([job]));
    renderJobs();
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong loading your jobs. Reload the page.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Engineer/ })).toBeInTheDocument();
  });

  it("drops extra pages when the signed-in user changes", async () => {
    vi.mocked(listJobs).mockResolvedValueOnce(page([job], "next"))
      .mockResolvedValueOnce(page([{ ...job, id: "two", title: "Private old job" }]))
      .mockResolvedValue(page([{ ...job, id: "new", title: "New account job" }]));
    renderJobs();
    await userEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByText("Private old job");
    act(() => auth.onAuthStateChange.mock.calls[0]![0]("SIGNED_IN", { user: { id: "u2", email: "other@example.com" } }));
    expect(await screen.findByText("New account job")).toBeInTheDocument();
    expect(screen.queryByText("Private old job")).not.toBeInTheDocument();
  });
});

describe("jobs polling", () => {
  it.each([0, 1])("polls all loaded pages while page %i has busy jobs, then stops when ready", async (busyPage) => {
    vi.useFakeTimers();
    let ready = false;
    vi.mocked(listJobs).mockImplementation(async (cursor) => cursor
      ? page([{ ...job, id: "older", title: "Older job", status: busyPage === 1 && !ready ? "processing" : "ready" }])
      : page([{ ...job, status: busyPage === 0 && !ready ? "queued" : "ready" }], "next"));
    await act(async () => { renderJobs(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load more" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText("Reading job…")).toBeInTheDocument();
    ready = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(listJobs).toHaveBeenCalledTimes(4);
    expect(screen.queryByText("Reading job…")).not.toBeInTheDocument();
    expect(screen.getByText("Older job")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(listJobs).toHaveBeenCalledTimes(4);
  });

  it("stops after two minutes and restarts its window after adding", async () => {
    vi.useFakeTimers();
    vi.mocked(listJobs).mockResolvedValue(page([{ ...job, status: "processing" }]));
    await act(async () => { renderJobs(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(120001); });
    expect(screen.getByText("Still reading. Reload the page to check again.")).toBeInTheDocument();
    const calls = vi.mocked(listJobs).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(listJobs).toHaveBeenCalledTimes(calls);
    fireEvent.click(screen.getByRole("button", { name: "+ Add job" }));
    fillDialog();
    vi.mocked(createJob).mockResolvedValue({ id: "new", existing: false });
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Add job" }).closest("form")!); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.queryByText("Still reading. Reload the page to check again.")).not.toBeInTheDocument();
    const afterAdd = vi.mocked(listJobs).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(listJobs).toHaveBeenCalledTimes(afterAdd + 1);
  });
});

describe("Add job dialog", () => {
  it("focuses the link, makes the page inert, traps focus and returns it on Escape", async () => {
    renderJobs();
    const opener = await openDialog();
    const dialog = screen.getByRole("dialog", { name: "Add a job" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Link to the job ad")).toHaveFocus();
    expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert");
    screen.getByRole("button", { name: "Add job" }).focus();
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it.each(["not a link", "ftp://example.com/jobs"]) ("rejects an invalid URL: %s", async (url) => {
    renderJobs(); await openDialog(); fillDialog(url); await submit();
    expect(screen.getByText("This doesn't look like a job link.")).toBeInTheDocument();
    expect(screen.getByLabelText("Link to the job ad")).toHaveAttribute("aria-invalid", "true");
    expect(createJob).not.toHaveBeenCalled();
  });

  it("counts trimmed characters and rejects short text", async () => {
    renderJobs(); await openDialog(); fillDialog(undefined, `  ${"x".repeat(150)}  `); await submit();
    expect(screen.getByText("150 of at least 200 characters")).toBeInTheDocument();
    expect(screen.getByText("Not enough text on this page. Select the job description and try again.")).toBeInTheDocument();
    expect(createJob).not.toHaveBeenCalled();
    fillDialog(undefined, "x".repeat(1000));
    expect(screen.getByText("1,000 characters")).toBeInTheDocument();
  });

  it("adds, disables submit while sending, refetches and clears the dialog", async () => {
    let finish!: (value: { id: string; existing: boolean }) => void;
    vi.mocked(createJob).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderJobs(); const opener = await openDialog(); fillDialog(undefined, ` ${"x".repeat(200)} `);
    await submit();
    expect(createJob).toHaveBeenCalledWith("https://example.com/jobs/2", ` ${"x".repeat(200)} `);
    expect(screen.getByRole("button", { name: "Add job" })).toBeDisabled();
    vi.mocked(listJobs).mockResolvedValue(page([job, { ...job, id: "new", title: null, status: "queued" }]));
    await act(async () => finish({ id: "new", existing: false }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Reading job…")).toBeInTheDocument();
    expect(opener).toHaveFocus();
    await userEvent.click(opener);
    expect(screen.getByLabelText("Link to the job ad")).toHaveValue("");
    expect(screen.getByLabelText("Job description")).toHaveValue("");
  });

  it("shows a newly added job when the initial list request is still pending", async () => {
    let finishList!: (value: ReturnType<typeof page>) => void;
    let finishAdd!: (value: { id: string; existing: boolean }) => void;
    vi.mocked(listJobs).mockReturnValueOnce(new Promise((resolve) => { finishList = resolve; }))
      .mockResolvedValue(page([{ ...job, id: "new", title: "New job", status: "queued" }, job]));
    vi.mocked(createJob).mockReturnValueOnce(new Promise((resolve) => { finishAdd = resolve; }));
    renderJobs();
    await openDialog(); fillDialog(); await submit();
    expect(createJob).toHaveBeenCalledTimes(1);
    expect(listJobs).toHaveBeenCalledTimes(1);
    await act(async () => finishAdd({ id: "new", existing: false }));
    await act(async () => finishList(page([job])));
    expect(await screen.findByRole("link", { name: /New job/ })).toHaveAttribute("href", "/jobs/new");
    expect(listJobs).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Reading job…")).toBeInTheDocument();
  });

  it("keeps focus on Add job when a successful first add removes the empty state", async () => {
    vi.mocked(listJobs).mockResolvedValueOnce(page([])).mockResolvedValue(page([job]));
    vi.mocked(createJob).mockResolvedValue({ id: "one", existing: false });
    renderJobs(); await screen.findByText("No jobs yet");
    await userEvent.click(screen.getAllByRole("button", { name: "+ Add job" })[1]!);
    fillDialog(); await submit();
    await screen.findByRole("link", { name: /Engineer/ });
    expect(screen.getByRole("button", { name: "+ Add job" })).toHaveFocus();
  });
  it("keeps a duplicate open with a link to the existing job", async () => {
    vi.mocked(createJob).mockResolvedValue({ id: "one", existing: true });
    renderJobs(); await openDialog(); fillDialog(); await submit();
    expect(await screen.findByRole("status")).toHaveTextContent("Already in your list.");
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute("href", "/jobs/one");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it.each([
    ["invalid_url", "This doesn't look like a job link."],
    ["text_too_short", "Not enough text on this page. Select the job description and try again."],
    ["payload_too_large", "This page is too large to send."], ["job_limit", "You can add up to 30 jobs per day."],
    ["network", "Can't reach Resumora. Check your connection."], ["unknown", "Something went wrong. Please try again."],
  ])("shows a %s error without losing the fields", async (code, message) => {
    vi.mocked(createJob).mockRejectedValue(new ApiClientError(400, code, "server message"));
    renderJobs(); await openDialog(); fillDialog(); await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Job description")).toHaveValue("x".repeat(200));
    expect(screen.getByLabelText("Link to the job ad")).toHaveValue("https://example.com/jobs/2");
  });

  it.each(["Close", "backdrop"]) ("closes with %s", async (method) => {
    renderJobs(); const opener = await openDialog();
    if (method === "Close") await userEvent.click(screen.getByRole("button", { name: "Close" }));
    else fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

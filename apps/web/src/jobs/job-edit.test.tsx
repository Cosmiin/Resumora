import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import type { Job, JobExtraction, JobListPage } from "@resumora/shared";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() }));
vi.mock("../lib/supabase.ts", () => ({ supabase: { auth } }));
vi.mock("./jobs-api.ts", () => ({ getJob: vi.fn(), patchJob: vi.fn(), deleteJob: vi.fn() }));
import { AuthProvider } from "../auth/AuthProvider.tsx";
import { routes } from "../router.tsx";
import { ApiClientError } from "../lib/api.ts";
import { getJob, patchJob } from "./jobs-api.ts";

const extracted: JobExtraction = {
  title: "Engineer", company: "Acme", location: "London", workMode: "hybrid", employmentType: "full_time",
  seniority: "senior", salary: { min: 7000, max: 9000, currency: "RON", period: "month" },
  summary: "Build useful tools.", requirements: [
    { text: "SQL", kind: "must", category: "skill" },
    { text: "German", kind: "nice", category: "language" },
  ], responsibilities: ["Build reports"], benefits: ["Meal allowance"], applyBy: "2026-12-01", isJobPosting: true,
};
const job: Job = {
  id: "one", title: "Engineer", company: "Acme", location: "London", status: "ready",
  errorCode: null, source: "link", url: "https://example.com/jobs/1", createdAt: "2026-11-05T10:00:00Z",
  updatedAt: "2026-11-05T10:00:00Z", version: 1, editedByUser: false, rawText: "Original job ad", extracted,
  applicationStatus: "saved",
};
function renderJob() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: ["/jobs/one"] });
  render(<QueryClientProvider client={client}><AuthProvider><RouterProvider router={router} /></AuthProvider></QueryClientProvider>);
  return client;
}
async function edit() {
  await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
  await screen.findByRole("textbox", { name: "Job title" });
}
const change = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
const save = () => userEvent.click(screen.getByRole("button", { name: "Save" }));

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u1", email: "ana@example.com" } } } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  vi.mocked(getJob).mockResolvedValue(job);
  vi.mocked(patchJob).mockImplementation(async (_id, _version, value) => ({
    ...job, title: value.title, company: value.company, location: value.location,
    extracted: value, version: 2, editedByUser: true,
  }));
});

describe("edit job summary", () => {
  it("prefills all fields and saves a Must requirement as Nice with updated summary counts", async () => {
    renderJob(); await edit();
    expect(screen.queryByRole("heading", { name: "Must-haves" })).not.toBeInTheDocument();
    for (const [name, value] of Object.entries({
      "Job title": "Engineer", Company: "Acme", Location: "London", "Work mode": "hybrid", Type: "full_time",
      Seniority: "senior", Summary: "Build useful tools.", Currency: "RON", Per: "month", "Apply by": "2026-12-01",
      "Requirement 1": "SQL", "Requirement 2": "German", "What you would do": "Build reports", Benefits: "Meal allowance",
    })) expect(screen.getByLabelText(name)).toHaveValue(value);
    expect(screen.getByLabelText("Salary from")).toHaveValue(7000);
    expect(screen.getByLabelText("Salary to")).toHaveValue(9000);
    expect(screen.getByLabelText("Apply by")).toHaveAttribute("type", "date");
    expect(screen.getAllByLabelText("Category").map((select) => (select as HTMLSelectElement).value)).toEqual(["skill", "language"]);
    expect(screen.getByLabelText("Requirement 1")).toHaveAttribute("maxlength", "500");
    expect(screen.getByLabelText("What you would do")).toHaveAccessibleDescription("One per line.");
    expect(screen.getByLabelText("Benefits")).toHaveAccessibleDescription("One per line.");
    const group = screen.getAllByRole("group", { name: "Must or nice" })[0]!;
    expect(within(group).getByRole("button", { name: "Must" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(group).getByRole("button", { name: "Nice" }));
    expect(within(group).getByRole("button", { name: "Nice" })).toHaveAttribute("aria-pressed", "true");
    await save();
    expect(patchJob).toHaveBeenCalledWith("one", 1, { ...extracted,
      requirements: [{ text: "SQL", kind: "nice", category: "skill" }, extracted.requirements[1]],
    });
    const nice = (await screen.findByRole("heading", { name: "Nice to have" })).closest("section")!;
    expect(within(nice).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["SQL", "German"]);
    expect(within(screen.getByRole("heading", { name: "Must-haves" }).closest("section")!).getByText("None listed.")).toBeInTheDocument();
    expect(screen.getByText("Summary edited by you")).toBeInTheDocument();
  });

  it("uses the returned job to update every cached list page for the current user", async () => {
    const client = renderJob(); await edit();
    const other = { ...job, id: "two", title: "Designer" };
    const cached: InfiniteData<JobListPage> = {
      pages: [{ items: [job, other], nextCursor: "next" }, { items: [job], nextCursor: null }], pageParams: [undefined, "next"],
    };
    client.setQueryData(["jobs", "u1"], cached);
    client.setQueryData(["jobs", "u2"], cached);
    const returned = { ...job, title: "Lead", company: "New company", location: "Paris", version: 2, editedByUser: true,
      extracted: { ...extracted, title: "Lead", company: "New company", location: "Paris" } };
    vi.mocked(patchJob).mockResolvedValue(returned);
    change("Job title", " Lead "); await save();
    expect(await screen.findByRole("heading", { name: "Lead", level: 1 })).toBeInTheDocument();
    expect(client.getQueryData(["job", "u1", "one"])).toEqual(returned);
    const updated = { ...job, title: "Lead", company: "New company", location: "Paris" };
    expect(client.getQueryData(["jobs", "u1"])).toEqual({ ...cached, pages: [
      { items: [updated, other], nextCursor: "next" }, { items: [updated], nextCursor: null },
    ] });
    expect(client.getQueryData(["jobs", "u2"])).toEqual(cached);
  });

  it("removes requirements, adds a must/skill row and drops blank added rows", async () => {
    renderJob(); await edit();
    await userEvent.click(screen.getByRole("button", { name: "Remove requirement 1" }));
    expect(screen.getByLabelText("Requirement 1")).toHaveValue("German");
    await userEvent.click(screen.getByRole("button", { name: "+ Add requirement" }));
    change("Requirement 2", "  Python  ");
    await userEvent.click(screen.getByRole("button", { name: "+ Add requirement" }));
    change("Requirement 3", "   "); await save();
    expect(patchJob).toHaveBeenCalledWith("one", 1, { ...extracted, requirements: [
      extracted.requirements[1], { text: "Python", kind: "must", category: "skill" },
    ] });
  });

  it("keeps the saved job when a pending detail refetch returns the old job", async () => {
    const client = renderJob(); await edit();
    let finish!: (value: Job) => void;
    vi.mocked(getJob).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    let refetch!: Promise<void>;
    await act(async () => {
      refetch = client.refetchQueries({ queryKey: ["job", "u1", "one"], exact: true });
    });
    expect(getJob).toHaveBeenCalledTimes(2);
    change("Job title", "Lead engineer"); await save();
    expect(await screen.findByRole("heading", { name: "Lead engineer", level: 1 })).toBeInTheDocument();
    await act(async () => { finish(job); await refetch; });
    expect(client.getQueryData(["job", "u1", "one"])).toMatchObject({ title: "Lead engineer", version: 2 });
    expect(screen.getByRole("heading", { name: "Lead engineer", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Summary edited by you")).toBeInTheDocument();
  });

  it.each([
    new ApiClientError(0, "network", "Offline"),
    new ApiClientError(404, "not_found", "Missing"),
  ])("keeps the open form and unsaved values when a background refetch fails: %s", async (error) => {
    const client = renderJob(); await edit();
    change("Job title", "Unsaved title"); change("Company", "Unsaved company");
    change("Requirement 1", "Unsaved requirement");
    vi.mocked(getJob).mockRejectedValueOnce(error);
    await act(async () => {
      await client.refetchQueries({ queryKey: ["job", "u1", "one"], exact: true });
    });
    await userEvent.type(screen.getByLabelText("Company"), " updated");
    expect(getJob).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Job title")).toHaveValue("Unsaved title");
    expect(screen.getByLabelText("Company")).toHaveValue("Unsaved company updated");
    expect(screen.getByLabelText("Requirement 1")).toHaveValue("Unsaved requirement");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(patchJob).not.toHaveBeenCalled();
  });

  it("stops adding at 60 requirements and allows adding again after removal", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job, extracted: { ...extracted,
      requirements: Array.from({ length: 60 }, () => ({ text: "SQL", kind: "must", category: "skill" })),
    } });
    renderJob(); await edit();
    expect(screen.getByRole("button", { name: "+ Add requirement" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Remove requirement 60" }));
    expect(screen.getByRole("button", { name: "+ Add requirement" })).toBeEnabled();
  });

  it("trims text and turns nonblank lines into separate responsibilities and benefits", async () => {
    renderJob(); await edit();
    change("Job title", "  Lead engineer  "); change("Company", "   "); change("Location", " ");
    change("Summary", "  Build tools  "); change("Apply by", "");
    change("What you would do", "  Build reports  \n\n Test tools \nShip changes\n");
    change("Benefits", " Lunch \n\n Pension \n");
    await save();
    expect(patchJob).toHaveBeenCalledWith("one", 1, { ...extracted,
      title: "Lead engineer", company: null, location: null, summary: "Build tools", applyBy: null,
      responsibilities: ["Build reports", "Test tools", "Ship changes"], benefits: ["Lunch", "Pension"],
    });
  });

  it("caps responsibilities at 40 and benefits at 30", async () => {
    renderJob(); await edit();
    change("What you would do", Array.from({ length: 41 }, () => "Build").join("\n"));
    change("Benefits", Array.from({ length: 31 }, () => "Lunch").join("\n"));
    await save();
    expect(vi.mocked(patchJob).mock.calls[0]![2].responsibilities).toHaveLength(40);
    expect(vi.mocked(patchJob).mock.calls[0]![2].benefits).toHaveLength(30);
  });

  it("rejects a blank title without a request", async () => {
    renderJob(); await edit(); change("Job title", "   "); await save();
    expect(screen.getByRole("alert")).toHaveTextContent("Give the job a title.");
    expect(patchJob).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Job title")).toHaveValue("   ");
  });

  it.each(["What you would do", "Benefits"])("rejects long %s lines without truncating or losing edits", async (name) => {
    renderJob(); await edit();
    const value = `First line\n  ${"x".repeat(501)}  \nLast line`;
    change(name, value); change("Company", "Unsaved company"); await save();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Each line can be up to 500 characters. Shorten the long ones and save again.",
    );
    expect(patchJob).not.toHaveBeenCalled();
    expect(screen.getByLabelText(name)).toHaveValue(value);
    expect(screen.getByLabelText("Company")).toHaveValue("Unsaved company");
    change(name, `  ${"x".repeat(500)}  `); await save();
    const key = name === "Benefits" ? "benefits" : "responsibilities";
    expect(patchJob).toHaveBeenCalledWith("one", 1, { ...extracted, company: "Unsaved company", [key]: ["x".repeat(500)] });
    expect(await screen.findByText("Summary edited by you")).toBeInTheDocument();
  });

  it.each([
    ["", "", "", "", null],
    ["7000", "", " RON ", "month", { min: 7000, max: null, currency: "RON", period: "month" }],
    ["0", "", " ", "", { min: 0, max: null, currency: null, period: null }],
  ] as const)("saves salary fields %s / %s / %s / %s", async (min, max, currency, period, salary) => {
    renderJob(); await edit();
    change("Salary from", min); change("Salary to", max); change("Currency", currency); change("Per", period);
    await save(); expect(patchJob).toHaveBeenCalledWith("one", 1, { ...extracted, salary });
  });

  it("keeps the form while saving and disables Save and Cancel until completion", async () => {
    let finish!: (value: Job) => void;
    vi.mocked(patchJob).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderJob(); await edit(); await save();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => { finish({ ...job, editedByUser: true, version: 2 }); });
    expect(await screen.findByRole("heading", { name: "Must-haves" })).toBeInTheDocument();
  });

  it.each([
    [new ApiClientError(0, "network", "Offline"), "Can't reach Resumora. Check your connection."],
    [new ApiClientError(500, "internal", "Server detail"), "Something went wrong. Please try again."],
    [new Error("Unexpected detail"), "Something went wrong. Please try again."],
  ])("keeps edits after a failed conflict reload, then reloads the latest job: %s", async (error, message) => {
    vi.mocked(patchJob).mockRejectedValue(new ApiClientError(409, "version_conflict", "Changed in another tab."));
    renderJob(); await edit(); change("Job title", "Unsaved title"); await save();
    expect(await screen.findByRole("alert")).toHaveTextContent("Changed in another tab.");
    expect(screen.getByLabelText("Job title")).toHaveValue("Unsaved title");
    change("Company", "Unsaved company"); change("Requirement 1", "Unsaved requirement");
    vi.mocked(getJob).mockRejectedValueOnce(error);
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Job title")).toHaveValue("Unsaved title");
    expect(screen.getByLabelText("Company")).toHaveValue("Unsaved company");
    expect(screen.getByLabelText("Requirement 1")).toHaveValue("Unsaved requirement");
    expect(screen.queryByRole("heading", { name: "Must-haves" })).not.toBeInTheDocument();
    vi.mocked(getJob).mockResolvedValue({ ...job, title: "Latest title", version: 3,
      extracted: { ...extracted, title: "Latest title" } });
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(await screen.findByRole("heading", { name: "Latest title" })).toBeInTheDocument();
    expect(getJob).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("textbox", { name: "Job title" })).not.toBeInTheDocument();
    await edit(); expect(screen.getByLabelText("Job title")).toHaveValue("Latest title");
  });

  it.each([
    [new ApiClientError(409, "wrong_status", "This job is still processing."), "This job is still processing."],
    [new ApiClientError(0, "network", "Offline"), "Can't reach Resumora. Check your connection."],
    [new ApiClientError(500, "internal", "Server detail"), "Something went wrong. Please try again."],
    [new Error("Unexpected detail"), "Something went wrong. Please try again."],
  ])("keeps edits when saving fails: %s", async (error, message) => {
    vi.mocked(patchJob).mockRejectedValue(error);
    renderJob(); await edit(); change("Company", "Unsaved company"); await save();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Company")).toHaveValue("Unsaved company");
    expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("cancels without saving and discards changes when reopened", async () => {
    renderJob(); await edit(); change("Job title", "Unsaved title");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Must-haves" })).toBeInTheDocument());
    expect(patchJob).not.toHaveBeenCalled();
    await edit(); expect(screen.getByLabelText("Job title")).toHaveValue("Engineer");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { emptyCv, type TailoredCv } from "@resumora/shared";

const account = vi.hoisted(() => ({ getPreferences: vi.fn(), savePreferences: vi.fn(), preferencesKey: (id?: string) => ["account", "preferences", id] }));
vi.mock("../account/account-api.ts", () => account);
const cvApi = vi.hoisted(() => ({ getCv: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => cvApi);
const tailoredApi = vi.hoisted(() => ({ listTailored: vi.fn(), getTailored: vi.fn(), setTemplate: vi.fn() }));
vi.mock("../tailor/tailored-api.ts", () => tailoredApi);
vi.mock("../jobs/jobs-api.ts", () => ({ getJob: vi.fn(async () => ({ extracted: { title: "Payroll Lead", company: "Beta" } })) }));
vi.mock("../lib/supabase.ts", () => ({ supabase: {} }));
vi.mock("../auth/AuthProvider.tsx", () => ({ useAuth: () => ({ loading: false, session: { user: { id: "user-a" } } }) }));
const files = vi.hoisted(() => ({ exportFile: vi.fn() }));
vi.mock("../export/export-files.ts", async (original) => ({ ...(await original<typeof import("../export/export-files.ts")>()), exportFile: files.exportFile }));
const list = vi.hoisted(() => ({ listAllTailored: vi.fn() }));
vi.mock("./useCvDoc.ts", async (original) => ({ ...(await original<typeof import("./useCvDoc.ts")>()), listAllTailored: list.listAllTailored }));

import { ExportPage } from "./ExportPage.tsx";
import { MyCvsPage } from "./MyCvsPage.tsx";
import { TemplatePage } from "./TemplatePage.tsx";

const content = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop", summary: "Payroll lead." } };
const guess = { kept: true, inferred: true, reviewed: false, text: "works abroad" };
const tailored = (over: Partial<TailoredCv> = {}): TailoredCv => ({
  id: "tc-1", userId: "user-a", jobId: "job-1", language: "en", translatedFrom: null, content, baseSnapshot: content,
  baseSnapshotAt: "2026-11-08T09:00:00Z", template: "modern", tone: "neutral", instruction: null, review: null, score: null,
  coverLetter: null, version: 3, createdAt: "2026-11-08T09:00:00Z", updatedAt: "2026-11-08T09:30:00Z", ...over,
});
const item = (over = {}) => ({ id: "tc-1", jobId: "job-1", language: "en", template: "modern", translatedFrom: null,
  updatedAt: "2026-11-10T09:30:00Z", inProgress: false, jobTitle: "Payroll Lead", company: "Beta", ...over });

function open(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: "/cvs", element: <MyCvsPage /> },
    { path: "/cv/template", element: <TemplatePage /> },
    { path: "/cv/export", element: <ExportPage /> },
    { path: "/jobs/:id/cv/template", element: <TemplatePage /> },
    { path: "/jobs/:id/cv/export", element: <ExportPage /> },
    { path: "*", element: <p>Elsewhere</p> },
  ], { initialEntries: [entry] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}
const at = (router: ReturnType<typeof open>) => router.state.location.pathname + router.state.location.search;

beforeEach(() => {
  vi.resetAllMocks();
  account.getPreferences.mockResolvedValue({ defaultTemplate: "classic", tailoringLanguage: "job" });
  account.savePreferences.mockImplementation(async (patch: object) => ({ defaultTemplate: "classic", tailoringLanguage: "job", ...patch }));
  cvApi.getCv.mockResolvedValue({ content, version: 4, updatedAt: "2026-11-09T08:00:00Z" });
  tailoredApi.listTailored.mockResolvedValue([{ id: "tc-1", language: "en", translatedFrom: null, updatedAt: "2026-11-10T09:30:00Z" }]);
  tailoredApi.getTailored.mockResolvedValue(tailored());
  tailoredApi.setTemplate.mockImplementation(async (_id: string, template: string) => ({ template }));
  list.listAllTailored.mockResolvedValue([item(), item({ id: "tc-2", jobId: "job-2", language: "ro", jobTitle: "Analist", company: null, inProgress: true })]);
  files.exportFile.mockResolvedValue({ name: "Ana_Pop_Beta_Payroll_Lead.pdf", pages: 1, fits: true, tightened: false });
});

describe("My CVs", () => {
  it("lists the base CV and every tailored CV, each with its next steps", async () => {
    open("/cvs");
    const base = await screen.findByRole("region", { name: "Base CV" });
    expect(within(base).getByText("Ana Pop")).toBeInTheDocument();
    expect(within(base).getByText("English · Classic · updated Nov 9, 2026")).toBeInTheDocument();
    expect(within(base).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/cv");
    expect(within(base).getByRole("link", { name: "Template" })).toHaveAttribute("href", "/cv/template");
    expect(within(base).getByRole("link", { name: "Export" })).toHaveAttribute("href", "/cv/export");

    const rows = within(screen.getByRole("list", { name: "Tailored to a job" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Payroll Lead, Beta")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Ready")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("English · Modern · updated Nov 10, 2026")).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/jobs/job-1/cv?cv=tc-1");
    expect(within(rows[0]!).getByRole("link", { name: "Template" })).toHaveAttribute("href", "/jobs/job-1/cv/template?cv=tc-1");
    expect(within(rows[0]!).getByRole("link", { name: "Export" })).toHaveAttribute("href", "/jobs/job-1/cv/export?cv=tc-1");
    // Still being tailored: one step, to go on with it.
    expect(within(rows[1]!).getByText("Analist")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("In progress")).toBeInTheDocument();
    expect(within(rows[1]!).getByRole("link", { name: "Continue tailoring" })).toHaveAttribute("href", "/jobs/job-2/tailor");
    expect(within(rows[1]!).queryByRole("link", { name: "Export" })).toBeNull();
  });

  it("says so when nothing is tailored yet, and points to Jobs", async () => {
    list.listAllTailored.mockResolvedValue([]);
    open("/cvs");
    expect(await screen.findByText(/Nothing tailored yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Jobs" })).toHaveAttribute("href", "/jobs");
  });

  it("starts with an upload when there is no CV at all", async () => {
    cvApi.getCv.mockResolvedValue({ content: emptyCv("en"), version: 1, updatedAt: "2026-11-09T08:00:00Z" });
    list.listAllTailored.mockResolvedValue([]);
    open("/cvs");
    expect(await screen.findByRole("heading", { name: "No CVs yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload my CV" })).toHaveAttribute("href", "/cv");
  });

  it("keeps the list on screen when a later refresh fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter([{ path: "/cvs", element: <MyCvsPage /> }], { initialEntries: ["/cvs"] });
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
    await screen.findByRole("region", { name: "Base CV" });
    list.listAllTailored.mockRejectedValue(new Error("offline"));
    await client.refetchQueries();
    expect(screen.getByRole("region", { name: "Base CV" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers a retry when the list cannot be loaded", async () => {
    list.listAllTailored.mockRejectedValueOnce(new Error("offline"));
    open("/cvs");
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Base CV" })).toBeInTheDocument();
  });
});

describe("the template page", () => {
  it("shows the person's own CV in the picked template; Use this template saves it on the tailored CV and goes to the download", async () => {
    const user = userEvent.setup();
    const router = open("/jobs/job-1/cv/template?cv=tc-1");
    expect(await screen.findByRole("radio", { name: /Modern/ })).toBeChecked();
    expect(screen.getByRole("link", { name: "Payroll Lead, Beta" })).toHaveAttribute("href", "/jobs/job-1/cv?cv=tc-1");
    expect(within(screen.getByRole("radio", { name: /Classic/ }).closest("label")!).getByText("Your default")).toBeInTheDocument();
    const page = () => document.querySelector(".cvs-preview .cv-page");
    expect(page()).toHaveClass("cv-template-modern");
    expect(page()).toHaveTextContent("Ana Pop");
    await user.click(screen.getByRole("radio", { name: /Compact/ }));
    expect(page()).toHaveClass("cv-template-compact");
    // Nothing is saved until the template is used.
    expect(tailoredApi.setTemplate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use this template" }));
    expect(tailoredApi.setTemplate).toHaveBeenCalledWith("tc-1", "compact");
    expect(account.savePreferences).not.toHaveBeenCalled();
    await waitFor(() => expect(at(router)).toBe("/jobs/job-1/cv/export?cv=tc-1"));
  });

  it("also makes it the default when asked", async () => {
    const user = userEvent.setup();
    open("/jobs/job-1/cv/template?cv=tc-1");
    await user.click(await screen.findByRole("checkbox", { name: "Also make this my default template" }));
    await user.click(screen.getByRole("button", { name: "Use this template" }));
    await waitFor(() => expect(account.savePreferences).toHaveBeenCalledWith({ defaultTemplate: "modern" }));
  });

  it("for the base CV, using a template makes it the default", async () => {
    const user = userEvent.setup();
    const router = open("/cv/template");
    expect(await screen.findByRole("radio", { name: /Classic/ })).toBeChecked();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Modern/ }));
    await user.click(screen.getByRole("button", { name: "Use this template" }));
    expect(account.savePreferences).toHaveBeenCalledWith({ defaultTemplate: "modern" });
    expect(tailoredApi.setTemplate).not.toHaveBeenCalled();
    await waitFor(() => expect(at(router)).toBe("/cv/export"));
  });

  it("stays on the page and says so when the template cannot be saved", async () => {
    tailoredApi.setTemplate.mockRejectedValue(new Error("offline"));
    const router = open("/jobs/job-1/cv/template?cv=tc-1");
    await userEvent.click(await screen.findByRole("button", { name: "Use this template" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't change the template");
    expect(at(router)).toBe("/jobs/job-1/cv/template?cv=tc-1");
  });

  it("says when the job has no tailored CV", async () => {
    tailoredApi.listTailored.mockResolvedValue([]);
    open("/jobs/job-1/cv/template");
    expect(await screen.findByRole("alert")).toHaveTextContent("This job has no tailored CV yet.");
  });
});

describe("the download page", () => {
  it("downloads the tailored CV as PDF in its template, and names the file", async () => {
    const user = userEvent.setup();
    open("/jobs/job-1/cv/export?cv=tc-1");
    await user.click(await screen.findByRole("button", { name: "Download PDF" }));
    expect(files.exportFile).toHaveBeenCalledWith("cv", "pdf", { cv: tailored(), job: { title: "Payroll Lead", company: "Beta" }, template: "modern" });
    expect(await screen.findByText("Downloaded: Ana_Pop_Beta_Payroll_Lead.pdf")).toBeInTheDocument();
    expect(screen.getByText("Good luck with this one. Your tailored CV stays in My CVs.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to My CVs" })).toHaveAttribute("href", "/cvs");
    expect(screen.getByRole("link", { name: "Change template" })).toHaveAttribute("href", "/jobs/job-1/cv/template?cv=tc-1");
    // No cover letter yet: no cover letter files.
    expect(screen.queryByText("Cover letter")).toBeNull();
  });

  it("downloads the base CV as Word, with the default template and no job", async () => {
    open("/cv/export");
    await userEvent.click(await screen.findByRole("button", { name: "Download Word" }));
    expect(files.exportFile).toHaveBeenCalledWith("cv", "docx", { cv: { content, language: "en", coverLetter: null }, job: null, template: "classic" });
    expect(await screen.findByText("Done. Your base CV stays in My CVs.")).toBeInTheDocument();
  });

  it("says when the spacing was tightened to fit, and when even that left it over two pages", async () => {
    const user = userEvent.setup();
    files.exportFile.mockResolvedValueOnce({ name: "a.pdf", pages: 2, fits: true, tightened: true })
      .mockResolvedValueOnce({ name: "a.pdf", pages: 3, fits: false, tightened: true });
    open("/cv/export");
    await user.click(await screen.findByRole("button", { name: "Download PDF" }));
    expect(await screen.findByText(/we tightened the spacing a little to fit/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByText("Your CV is still 3 pages at the smallest text size. Shorten it to fit 2 pages.")).toBeInTheDocument();
    expect(screen.queryByText(/we tightened the spacing/)).toBeNull();
  });

  it("says the file could not be made and that the CV is safe", async () => {
    files.exportFile.mockRejectedValue(new Error("boom"));
    open("/cv/export");
    await userEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The file couldn't be created. Your CV is safe.");
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  });

  it("warns about AI guesses not checked yet, with the way to check them, and offers the cover letter's files when there is one", async () => {
    tailoredApi.getTailored.mockResolvedValue(tailored({ review: { summary: { "summary#0": guess } },
      coverLetter: { body: "Dear team", hiringManager: "", whyCompany: "", generatedAt: "2026-11-08T09:00:00Z" } as TailoredCv["coverLetter"] }));
    open("/jobs/job-1/cv/export?cv=tc-1");
    expect(await screen.findByText(/1 AI guess not checked yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review 1 item" })).toHaveAttribute("href", "/jobs/job-1/cv?cv=tc-1&review=1");
    expect(screen.getByText("Cover letter")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Word" })[0]!);
    expect(files.exportFile).toHaveBeenCalledWith("letter", "docx", expect.objectContaining({ template: "modern" }));
  });
});

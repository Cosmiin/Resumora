import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { emptyCv, type CvContent, type MatchScore, type TailoredCv } from "@resumora/shared";

const tailoredApi = vi.hoisted(() => ({ listTailored: vi.fn(), getTailored: vi.fn(), saveTailored: vi.fn(), setTemplate: vi.fn() }));
vi.mock("./tailored-api.ts", () => tailoredApi);
const tailorApi = vi.hoisted(() => ({ getScores: vi.fn() }));
vi.mock("./tailor-api.ts", () => tailorApi);
vi.mock("../jobs/jobs-api.ts", () => ({ getJob: vi.fn(() => new Promise(() => {})) }));
const cvApi = vi.hoisted(() => ({ getCv: vi.fn(), saveCv: vi.fn(), listHistory: vi.fn(), getHistoryItem: vi.fn(), restoreHistory: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => cvApi);
const enrichApi = vi.hoisted(() => ({
  getScores: vi.fn(async () => []), scoreRole: vi.fn(() => new Promise(() => {})),
  createVoiceSession: vi.fn(), streamRewrite: vi.fn(), getSkillSuggestions: vi.fn(),
}));
vi.mock("../cv/enrich/enrich-api.ts", () => enrichApi);
vi.mock("../auth/AuthProvider.tsx", () => ({ useAuth: () => ({ loading: false, session: { user: { id: "user-a" } } }) }));

import { TailoredCvPage } from "./TailoredCvPage.tsx";

const role = {
  id: "r1", company: "Acme", title: "Engineer", location: "", startDate: "2020-01", endDate: "", current: true,
  description: "Built payroll reports for clients", bullets: [{ id: "b1", text: "Led the payroll migration for 40 clients" }],
  notes: [], facts: null,
} as unknown as CvContent["experience"][number];
const base: CvContent = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop", summary: "Original summary." },
  experience: [{ ...role, description: "Made reports", bullets: [{ id: "b1", text: "Moved payroll" }] }] };
const content: CvContent = { ...base, basics: { ...base.basics, summary: "Tailored summary." }, experience: [role] };
const score = (total: number, band: MatchScore["band"]) => ({ policy: "v1", labels: [], parts: {}, total, band, capped: false }) as unknown as MatchScore;
const tailored: TailoredCv = {
  id: "tc-1", userId: "user-a", jobId: "job-1", language: "en", translatedFrom: null, content, baseSnapshot: base,
  baseSnapshotAt: "2026-11-08T09:00:00Z", template: "classic", tone: "neutral", instruction: null,
  review: {
    summary: { summary: { kept: true, inferred: false, reviewed: false, text: "Tailored summary." } },
    experience: { b1: { kept: true, inferred: true, reviewed: false, text: "Led the payroll migration for 40 clients" } },
  },
  score: null, coverLetter: null, version: 3, createdAt: "2026-11-08T09:00:00Z", updatedAt: "2026-11-08T09:30:00Z",
};

function renderPage(entry = "/jobs/job-1/cv") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes><Route path="/jobs/:id/cv" element={<TailoredCvPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  enrichApi.getScores.mockResolvedValue([]);
  enrichApi.scoreRole.mockReturnValue(new Promise(() => {}));
  tailoredApi.listTailored.mockResolvedValue([{ id: "tc-1", language: "en", translatedFrom: null, updatedAt: tailored.updatedAt }]);
  tailoredApi.getTailored.mockResolvedValue(tailored);
  tailoredApi.saveTailored.mockResolvedValue({ version: 4, updatedAt: "2026-11-08T10:00:00Z" });
  tailorApi.getScores.mockResolvedValue({ base: score(62, "fair"), tailored: score(71, "strong") });
  tailoredApi.setTemplate.mockImplementation(async (_id: string, template: string) => ({ template }));
});

const changesView = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Show changes" }));
};
/** The page as shown, in whichever view is open. */
const cvPage = () => document.querySelector(".editor-page .cv-page");
const editView = async () => {
  await screen.findByRole("textbox", { name: "Summary" });
};

describe("TailoredCvPage", () => {
  it("opens on the Cover letter tab with ?tab=letter", async () => {
    renderPage("/jobs/job-1/cv?cv=tc-1&tab=letter");
    expect(await screen.findByRole("tab", { name: "Cover letter" })).toHaveAttribute("aria-selected", "true");
  });

  it("links to this CV's template page and download page, naming the template it has", async () => {
    renderPage();
    const bar = await screen.findByRole("group", { name: "This tailored CV" });
    expect(within(bar).getByRole("link", { name: "Template: Classic" })).toHaveAttribute("href", "/jobs/job-1/cv/template?cv=tc-1");
    expect(within(bar).getByRole("link", { name: "Export" })).toHaveAttribute("href", "/jobs/job-1/cv/export?cv=tc-1");
    expect(screen.queryByText(/Score/)).toBeNull();
  });

  it("opens editable by clicking, like the base CV, with Show changes as an option", async () => {
    renderPage();
    expect(await screen.findByRole("textbox", { name: "Summary" })).toHaveTextContent("Tailored summary.");
    await changesView();
    expect(screen.queryByRole("textbox", { name: "Summary" })).not.toBeInTheDocument();
    expect(screen.getByText("Tailored summary.")).toHaveClass("cv-mark-changed");
    await userEvent.click(screen.getByRole("button", { name: "Edit text" }));
    expect(screen.getByRole("textbox", { name: "Summary" })).toBeInTheDocument();
  });

  it("shows the tabs, and highlights changed and inferred items", async () => {
    renderPage();
    await changesView();
    expect(screen.getByRole("tab", { name: "CV", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cover letter" })).toBeInTheDocument();
    expect(screen.getByText("Tailored summary.")).toHaveClass("cv-mark-changed");
    expect(screen.getByText("Led the payroll migration for 40 clients")).toHaveClass("cv-mark-inferred");
    expect(screen.getByText("Built payroll reports for clients")).not.toHaveClass("cv-mark-changed");
    expect(cvApi.getCv).not.toHaveBeenCalled();
  });

  it("marks a skill the tailoring added (its review key is new-skill:<name>)", async () => {
    tailoredApi.getTailored.mockResolvedValue({ ...tailored,
      content: { ...content, technicalSkills: [{ id: "s1", name: "Excel" }, { id: "s9", name: "Payroll" }] },
      review: { skills: { "new-skill:Payroll": { kept: true, inferred: true, reviewed: false, text: "Payroll" } } } });
    renderPage();
    await changesView();
    expect(await screen.findByText("Payroll")).toHaveClass("cv-mark-inferred");
    expect(screen.getByText("Excel")).not.toHaveClass("cv-mark-inferred");
  });

  it("has no enrichment tools or History", async () => {
    renderPage();
    await editView();
    expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("textbox", { name: "Summary" }));
    expect(screen.queryByText("Improve with AI")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("textbox", { name: "Role title" }));
    expect(screen.queryByText("Improve with AI")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Improve this role/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Improve this bullet/ })).not.toBeInTheDocument();
    expect(enrichApi.scoreRole).not.toHaveBeenCalled();
  });

  it("Use original wording restores the Base wording and autosaves to the tailored CV", async () => {
    renderPage();
    await editView();
    await userEvent.click(screen.getByRole("textbox", { name: "Role title" }));
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Was:")).toBeInTheDocument();
    expect(within(panel).getByText("Moved payroll")).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Use original wording" }));
    await waitFor(() => expect(tailoredApi.saveTailored).toHaveBeenCalled(), { timeout: 3000 });
    const [id, saved, version] = tailoredApi.saveTailored.mock.lastCall!;
    expect([id, version]).toEqual(["tc-1", 3]);
    expect(saved.experience[0]).toMatchObject({ description: "Made reports", bullets: [{ id: "b1", text: "Moved payroll" }] });
    expect(saved.basics.summary).toBe("Tailored summary.");
    expect(cvApi.saveCv).not.toHaveBeenCalled();
  });

  it("autosaves typing to the tailored save", async () => {
    renderPage();
    await editView();
    await userEvent.type(screen.getByRole("textbox", { name: "Summary" }), " More");
    await waitFor(() => expect(tailoredApi.saveTailored).toHaveBeenCalled(), { timeout: 3000 });
    expect(tailoredApi.saveTailored.mock.lastCall![1].basics.summary).toBe("Tailored summary. More");
  });

  it("offers the summary's original wording", async () => {
    renderPage();
    await editView();
    await userEvent.click(screen.getByRole("textbox", { name: "Summary" }));
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Original summary.")).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Use original wording" }));
    expect(screen.getByRole("textbox", { name: "Summary" })).toHaveTextContent("Original summary.");
  });

  it("shows the CV in the template it was saved with", async () => {
    tailoredApi.getTailored.mockResolvedValue({ ...tailored, template: "compact" });
    renderPage();
    await screen.findByRole("link", { name: "Template: Compact" });
    expect(cvPage()).toHaveClass("cv-template-compact");
    expect(tailoredApi.setTemplate).not.toHaveBeenCalled();
  });
});

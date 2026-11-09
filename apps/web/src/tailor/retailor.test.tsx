import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { emptyCv, type CvContent, type Job, type TailoredCv } from "@resumora/shared";

const tailoredApi = vi.hoisted(() => ({ listTailored: vi.fn(), getTailored: vi.fn(), saveTailored: vi.fn(), retailor: vi.fn() }));
vi.mock("./tailored-api.ts", () => tailoredApi);
const tailorApi = vi.hoisted(() => ({ getScores: vi.fn() }));
vi.mock("./tailor-api.ts", () => tailorApi);
const jobsApi = vi.hoisted(() => ({ getJob: vi.fn() }));
vi.mock("../jobs/jobs-api.ts", () => jobsApi);
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn(), saveCv: vi.fn(), listHistory: vi.fn(), getHistoryItem: vi.fn(), restoreHistory: vi.fn() }));
vi.mock("../cv/enrich/enrich-api.ts", () => ({
  getScores: vi.fn(async () => []), scoreRole: vi.fn(() => new Promise(() => {})),
  createVoiceSession: vi.fn(), streamRewrite: vi.fn(), getSkillSuggestions: vi.fn(),
}));
vi.mock("../auth/AuthProvider.tsx", () => ({ useAuth: () => ({ loading: false, session: { user: { id: "user-a" } } }) }));

import { TailoredCvPage } from "./TailoredCvPage.tsx";

const content: CvContent = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop", summary: "Payroll lead." },
  technicalSkills: [{ id: "s1", name: "Excel" }] };
const tailored: TailoredCv = {
  id: "tc-1", userId: "user-a", jobId: "job-1", language: "en", translatedFrom: null, content, baseSnapshot: content,
  baseSnapshotAt: "2026-11-08T09:00:00Z", template: "classic", tone: "neutral", instruction: null, review: null,
  score: null, coverLetter: null, version: 2, createdAt: "2026-11-08T09:00:00Z", updatedAt: "2026-11-08T09:30:00Z",
};
const job = (over: Partial<Job>) => ({ id: "job-1", editedByUser: false, updatedAt: "2026-11-08T08:00:00Z", ...over }) as Job;

function renderPage(path = "/jobs/job-1/cv") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/jobs/:id/cv" element={<TailoredCvPage />} />
          <Route path="/jobs/:id/tailor" element={<p>Tailor flow</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  tailoredApi.listTailored.mockResolvedValue([{ id: "tc-1", language: "en", translatedFrom: null, updatedAt: tailored.updatedAt }]);
  tailoredApi.getTailored.mockResolvedValue(tailored);
  tailoredApi.retailor.mockResolvedValue({ run: { id: "run-2" } });
  tailorApi.getScores.mockResolvedValue({ base: null, tailored: null });
  jobsApi.getJob.mockResolvedValue(job({}));
});

describe("re-tailor", () => {
  it("opens with the dialog already open when reached through Tailor again (?retailor=1)", async () => {
    renderPage("/jobs/job-1/cv?retailor=1");
    expect(await screen.findByRole("dialog", { name: "Re-tailor sections" })).toBeInTheDocument();
  });

  it("picks sections in the dialog and opens the tailoring flow on the new run", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Re-tailor…" }));
    const dialog = screen.getByRole("dialog", { name: "Re-tailor sections" });
    expect(within(dialog).getByRole("button", { name: "Re-tailor" })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Summary" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Skills" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Re-tailor" }));
    expect(tailoredApi.retailor).toHaveBeenCalledWith("tc-1", ["skills", "summary"]);
    expect(await screen.findByText("Tailor flow")).toBeInTheDocument();
    expect(localStorage.getItem("resumora.tailorRun.job-1")).toBe("run-2");
  });

  it("re-tailors one section from its ↻ without the dialog", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Re-tailor Skills" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tailoredApi.retailor).toHaveBeenCalledWith("tc-1", ["skills"]);
    expect(await screen.findByText("Tailor flow")).toBeInTheDocument();
  });

  it("shows the job-changed notice only after the user edited the job", async () => {
    jobsApi.getJob.mockResolvedValue(job({ editedByUser: true, updatedAt: "2026-11-08T08:30:00Z" }));
    renderPage();
    await screen.findByRole("button", { name: "Re-tailor…" });
    expect(screen.queryByText("The job changed.")).not.toBeInTheDocument();
  });

  it("offers to re-tailor when the job was edited after tailoring", async () => {
    jobsApi.getJob.mockResolvedValue(job({ editedByUser: true, updatedAt: "2026-11-08T10:00:00Z" }));
    renderPage();
    expect(await screen.findByText("The job changed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Re-tailor?" }));
    expect(screen.getByRole("dialog", { name: "Re-tailor sections" })).toBeInTheDocument();
  });
});

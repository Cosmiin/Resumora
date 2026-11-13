import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { emptyCv, type Experience, type Job, type JobListPage, type JobScore, type MatchScore, type TailoredCv } from "@resumora/shared";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() }));
vi.mock("../lib/supabase.ts", () => ({ supabase: { auth } }));
vi.mock("./jobs-api.ts", () => ({ getJob: vi.fn(), getJobScore: vi.fn(), scoreJob: vi.fn(), recheckScore: vi.fn(), patchJob: vi.fn(), deleteJob: vi.fn(), listJobs: vi.fn(), createJob: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: vi.fn() }));
vi.mock("../tailor/tailor-api.ts", async (original) => ({ ...(await original<object>()), getRun: vi.fn() }));
import { getRun } from "../tailor/tailor-api.ts";
vi.mock("../tailor/tailored-api.ts", async (original) => ({ ...(await original<object>()), listTailored: vi.fn(), getTailored: vi.fn() }));
vi.mock("../account/account-api.ts", async (original) => ({ ...(await original<object>()), getPreferences: vi.fn() }));
import { getTailored, listTailored } from "../tailor/tailored-api.ts";
vi.mock("../export/export-files.ts", async (original) => ({ ...(await original<object>()), exportFile: vi.fn() }));
import { exportFile } from "../export/export-files.ts";
import { getPreferences } from "../account/account-api.ts";
vi.mock("../cv/enrich/useRoleScores.ts", () => ({ useRoleScores: vi.fn() }));
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
import { getCv } from "../cv/cv-api.ts";
import { useRoleScores } from "../cv/enrich/useRoleScores.ts";
import { useVoice } from "../cv/enrich/useVoice.ts";
import { AuthProvider } from "../auth/AuthProvider.tsx";
import { routes } from "../router.tsx";
import { ApiClientError } from "../lib/api.ts";
import { deleteJob, getJob, getJobScore, listJobs, patchJob, recheckScore, scoreJob } from "./jobs-api.ts";

const job: Job = {
  id: "one", title: "Engineer", company: "Acme", location: "London", status: "ready",
  errorCode: null, source: "link", url: "https://example.com/jobs/1", createdAt: "2026-11-05T10:00:00Z",
  updatedAt: "2026-11-05T10:00:00Z", version: 1, editedByUser: false,
  applicationStatus: "saved",
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
/** The score answer: nothing scored and not tailored, unless the test says otherwise. */
const scores = (over: Partial<JobScore> = {}): JobScore => ({ base: null, tailored: null, tailoredCvId: null, stale: false, hasTailoredCv: false, ...over });
const roleScores = (score: number) => ({ scores: new Map([["role", { state: "ready" as const,
  result: { roleId: "role", policy: "score/2", fingerprint: "x", score, bullets: [], nextStep: null, questions: [], roleQuestions: [], thin: false } }]]), retry: vi.fn(), put: vi.fn() });
const ready = () => screen.findByRole("heading", { name: "Engineer", level: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "t", user: { id: "u1", email: "ana@example.com" } } } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  vi.mocked(getJob).mockResolvedValue(job);
  vi.mocked(getJobScore).mockResolvedValue(scores());
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
  it("shows no thoughts box or voice button for a ready job", async () => {
    renderJob(); await ready();
    expect(screen.queryByRole("textbox", { name: "Your thoughts on this role" })).not.toBeInTheDocument();
    expect(screen.queryByText("Your thoughts on this role")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Speak your thoughts" })).not.toBeInTheDocument();
    expect(document.querySelector("button.mic")).toBeNull();
  });
  it("keeps Edit disabled until the status save finishes, then edits the current version", async () => {
    let finishStatus!: (value: Job) => void;
    vi.mocked(patchJob).mockReturnValueOnce(new Promise<Job>((resolve) => { finishStatus = resolve; }));
    renderJob(); await ready();
    const edit = screen.getByRole("button", { name: "Edit" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Application status" }), "applied");
    expect(edit).toBeDisabled();
    await userEvent.click(edit);
    expect(screen.queryByRole("textbox", { name: "Job title" })).not.toBeInTheDocument();
    await act(async () => { finishStatus({ ...job, applicationStatus: "applied", version: 2 }); });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await ready();
    expect(patchJob).toHaveBeenLastCalledWith("one", 2, job.extracted);
  });
  it("shows a closed-position notice near the top while keeping job actions available", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job, extracted: { ...job.extracted!, positionClosed: true } });
    renderJob(); await ready();
    const notice = screen.getByText("This position is no longer open, according to the ad. You can still read it and tailor a CV to it.");
    expect(notice).toBeVisible();
    expect(notice.compareDocumentPosition(screen.getByRole("heading", { name: "In short" }))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tailor my CV" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Application status" })).toBeEnabled();
  });
  it.each([{}, { positionClosed: false }])("shows no closed-position notice for extraction flag %j", async (flag) => {
    vi.mocked(getJob).mockResolvedValue({ ...job, extracted: { ...job.extracted!, ...flag } });
    renderJob(); await ready();
    expect(screen.queryByText("This position is no longer open, according to the ad. You can still read it and tailor a CV to it.")).not.toBeInTheDocument();
  });
  it("keeps positionClosed true when editing and saving a closed job", async () => {
    const extracted = { ...job.extracted!, positionClosed: true };
    vi.mocked(getJob).mockResolvedValue({ ...job, extracted });
    renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), { target: { value: "Build better tools." } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await ready();
    expect(patchJob).toHaveBeenCalledExactlyOnceWith("one", 1, { ...extracted, summary: "Build better tools." });
    expect(screen.getByText("Build better tools.")).toBeInTheDocument();
    expect(screen.getByText("This position is no longer open, according to the ad. You can still read it and tailor a CV to it.")).toBeVisible();
  });
  it("an enriched CV goes straight into tailoring, with no dialog", async () => {
    vi.mocked(useRoleScores).mockReturnValue(roleScores(40));
    vi.mocked(getCv).mockResolvedValue({ content: { ...emptyCv(), experience: [role], enrichedAt: "2026-11-09T12:00:00.000Z" }, version: 1, updatedAt: job.updatedAt });
    const { router } = renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Tailor my CV" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/jobs/one/tailor"));
    expect(screen.queryByRole("button", { name: "Enrich first" })).not.toBeInTheDocument();
  });
  it("computes a missing Score 1 when Try again is clicked, and says so when that fails", async () => {
    vi.mocked(scoreJob).mockRejectedValueOnce(new Error("ai")).mockResolvedValueOnce(scores({ base: match }));
    renderJob(); await ready();
    await screen.findByText("Your match score isn't available yet.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Couldn't work out your match score. Try again.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("Couldn't work out your match score. Try again.")).toBeNull());
    expect(scoreJob).toHaveBeenCalledWith("one");
    expect(scoreJob).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Your match score isn't available yet.")).toBeNull();
    expect(screen.getByText("Your match: 80 of 100")).toBeInTheDocument();
  });

  describe("reopening a tailored CV", () => {
    const box = async () => (await screen.findByRole("link", { name: /Open tailored CV|Continue tailoring/ })).closest(".job-tailor") as HTMLElement;
    /** C5: the action sits in the page's head, above the must-haves, the ad and application status. */
    const expectAtTop = (tailor: HTMLElement) => {
      for (const below of [screen.getByRole("heading", { name: "Must-haves" }),
        screen.getByRole("button", { name: "Show original ad" }), screen.getByRole("combobox", { name: "Application status" })]) {
        expect(tailor.compareDocumentPosition(below) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    };

    it("offers Open tailored CV and Tailor again once a tailored CV exists", async () => {
      vi.mocked(getJobScore).mockResolvedValue(scores({ base: { ...match, total: 62, band: "fair" }, tailored: { ...match, total: 78 } }));
      renderJob(); await ready();
      const tailor = await box();
      expect(tailor).toHaveTextContent("62 → 78");
      expectAtTop(tailor);
      expect(within(tailor).getByRole("link", { name: "Open tailored CV" })).toHaveAttribute("href", "/jobs/one/cv");
      expect(within(tailor).getByRole("link", { name: "Tailor again" })).toHaveAttribute("href", "/jobs/one/cv?retailor=1");
      expect(within(tailor).queryByRole("button", { name: "Tailor my CV" })).toBeNull();
    });

    it("offers Continue for an unfinished run, at the step it stopped", async () => {
      localStorage.setItem("resumora.tailorRun.one", "run1");
      vi.mocked(getRun).mockResolvedValue({ id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "tailor",
        sections: ["experience", "skills", "summary", "achievements", "languages", "layout"], status: "waiting_user",
        currentSection: "summary", questions: null, answers: null, proposals: null, errorCode: null,
        createdAt: job.createdAt, updatedAt: job.updatedAt });
      vi.mocked(getJobScore).mockResolvedValue(scores({ base: match, tailored: match }));
      const { router } = renderJob(); await ready();
      const tailor = await box();
      expect(tailor).toHaveTextContent("Tailoring in progress: step 3 of 6, Summary");
      expectAtTop(tailor);
      expect(getRun).toHaveBeenCalledWith("run1");
      await userEvent.click(within(tailor).getByRole("link", { name: "Continue tailoring" }));
      expect(router.state.location.pathname).toBe("/jobs/one/tailor");
      localStorage.clear();
    });

    it("keeps the Tailor button when nothing was tailored, or the remembered run is finished or gone", async () => {
      localStorage.setItem("resumora.tailorRun.one", "gone");
      vi.mocked(getRun).mockRejectedValue(new ApiClientError(404, "not_found", "Gone"));
      renderJob(); await ready();
      expect(await screen.findByRole("button", { name: "Tailor my CV" })).toBeInTheDocument();
      expect(screen.queryByText(/Tailoring in progress/)).toBeNull();
      localStorage.clear();
    });
  });

  describe("a tailored job", () => {
    const seven = Array.from({ length: 7 }, (_, index) => ({ text: `Must ${index + 1}`, kind: "must" as const, category: "skill" as const }));
    const marks = (met: number): MatchScore["labels"] => seven.map((_, index) => (
      { ref: `r${index}`, kind: "requirement", status: index < met ? "met" : "missing", evidence: null, inferred: false }));
    const content = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Pop" },
      experience: [{ ...role, bullets: [{ id: "b1", text: "Ran payroll for 40 staff" }] }] };
    const tailoredCv: TailoredCv = {
      id: "cv1", userId: "u1", jobId: "one", language: "en", translatedFrom: null, content, baseSnapshot: content,
      baseSnapshotAt: job.updatedAt, template: "modern", tone: null, instruction: null, review: null, score: null, coverLetter: null,
      version: 3, createdAt: job.createdAt, updatedAt: job.updatedAt,
    };
    const tailored = (met = 6) => scores({ base: { ...match, total: 69, labels: marks(3) }, tailored: { ...match, total: 84, labels: marks(met) },
      tailoredCvId: "cv1", hasTailoredCv: true });
    /** The score strip of the tailored layout, once the score answer has arrived. */
    const band = async () => (await screen.findByText("Latest score, from your tailored CV")).closest("section") as HTMLElement;

    beforeEach(() => {
      vi.mocked(getJob).mockResolvedValue({ ...job, extracted: { ...job.extracted!, requirements: seven } });
      vi.mocked(getJobScore).mockResolvedValue(tailored());
      vi.mocked(getPreferences).mockResolvedValue({ displayName: null, defaultTemplate: "classic", tailoringLanguage: "job" } as Awaited<ReturnType<typeof getPreferences>>);
      vi.mocked(listTailored).mockResolvedValue([{ id: "cv1", language: "en", translatedFrom: null, updatedAt: job.updatedAt }]);
      vi.mocked(getTailored).mockResolvedValue(tailoredCv);
    });

    it("shows the tailored CV's score, never the base one, with the CV's four links", async () => {
      renderJob(); await ready();
      const strip = within(await band());
      expect(strip.getByText("Your match: 84 of 100")).toBeInTheDocument();
      expect(strip.getByText("Latest score, from your tailored CV")).toBeInTheDocument();
      expect(screen.queryByText(/69/)).toBeNull();
      expect(screen.getByText("Tailored CV")).toHaveClass("ui-pill");
      expect(strip.getByRole("link", { name: "Edit CV" })).toHaveAttribute("href", "/jobs/one/cv?cv=cv1");
      expect(strip.getByRole("button", { name: "Export" })).toBeInTheDocument();
      expect(strip.queryByRole("link", { name: "Export" })).toBeNull();
      expect(strip.getByRole("link", { name: "Tailor again" })).toHaveAttribute("href", "/jobs/one/cv?cv=cv1&retailor=1");
      expect(await screen.findByText(/Template: Modern/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Change template" })).toHaveAttribute("href", "/jobs/one/cv/template?cv=cv1");
      // The old main action of a tailored job is gone with the old layout.
      expect(screen.queryByRole("link", { name: "Open tailored CV" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Tailor my CV" })).toBeNull();
    });

    it("keeps the job folded behind one row, and opens it with the must-haves ticked from the tailored score", async () => {
      renderJob(); await ready();
      const fold = await screen.findByRole("button", { name: /^The job: must-haves, nice-to-haves, keywords and the full ad/ });
      expect(fold).toHaveAttribute("aria-expanded", "false");
      expect(fold).toHaveTextContent("Show");
      expect(screen.queryByRole("heading", { name: "Must-haves" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "About this job" })).toBeNull();
      await userEvent.click(fold);
      expect(fold).toHaveAttribute("aria-expanded", "true");
      expect(fold).toHaveTextContent("Hide");
      // Six are met in the tailored score; the base score had three.
      expect(within(screen.getByRole("list", { name: "Already on your CV · 6" })).getByText("Must 6")).toBeInTheDocument();
      expect(within(screen.getByRole("list", { name: "Not on your CV yet · 1" })).getByText("Must 7")).toBeInTheDocument();
      const about = screen.getByRole("heading", { name: "About this job" }).closest("section")!;
      expect(within(about).getByRole("button", { name: "Edit" })).toBeInTheDocument();
      // The application status lives in the header in this layout, not in About this job.
      expect(within(about).queryByRole("combobox")).toBeNull();
    });

    it.each([
      [6, "6 of 7 must-haves covered. Still open: Must 7."],
      [7, "All 7 must-haves covered."],
      [3, "3 of 7 must-haves covered. Still open: Must 4, Must 5 and 2 more."],
    ])("says what the tailored CV covers: %s of 7", async (met, line) => {
      vi.mocked(getJobScore).mockResolvedValue(tailored(met));
      renderJob(); await ready();
      expect(within(await band()).getByText(line)).toBeInTheDocument();
    });

    it("shows the tailored CV itself, read-only", async () => {
      renderJob(); await ready();
      const cv = (await screen.findByText("Ran payroll for 40 staff")).closest(".cvs-preview") as HTMLElement;
      expect(within(cv).getByText("Ana Pop")).toBeInTheDocument();
      expect(cv.querySelector("input, textarea, select, button, [contenteditable]")).toBeNull();
      expect(getTailored).toHaveBeenCalledWith("cv1");
    });

    it("saves a change of the application status from the header", async () => {
      renderJob(); await ready(); await band();
      const select = screen.getByRole("combobox", { name: "Application status" });
      expect(select.closest(".jobs-head")).not.toBeNull();
      await userEvent.selectOptions(select, "applied");
      await waitFor(() => expect(patchJob).toHaveBeenCalledWith("one", 1, expect.anything(), { applicationStatus: "applied" }));
      await waitFor(() => expect(select).toHaveValue("applied"));
    });

    it("keeps the score and the buttons when the CV fails to load, with a way to try again", async () => {
      vi.mocked(getTailored).mockRejectedValueOnce(new Error("down"));
      renderJob(); await ready();
      expect(await screen.findByText("We couldn't load your tailored CV. Nothing has changed.")).toBeInTheDocument();
      const strip = within(await band());
      expect(strip.getByText("Your match: 84 of 100")).toBeInTheDocument();
      expect(strip.getByRole("link", { name: "Edit CV" })).toHaveAttribute("href", "/jobs/one/cv?cv=cv1");
      expect(screen.getByRole("button", { name: /^The job:/ })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Ran payroll for 40 staff")).toBeInTheDocument();
    });

    describe("with a copy in a second language", () => {
      const roCv: TailoredCv = { ...tailoredCv, id: "cv2", language: "ro", translatedFrom: "cv1",
        content: { ...content, experience: [{ ...role, bullets: [{ id: "b1", text: "A făcut salarizarea pentru 40 de angajați" }] }] } };
      beforeEach(() => {
        vi.mocked(listTailored).mockResolvedValue([{ id: "cv1", language: "en", translatedFrom: null, updatedAt: job.updatedAt },
          { id: "cv2", language: "ro", translatedFrom: "cv1", updatedAt: job.updatedAt }]);
        vi.mocked(getTailored).mockImplementation(async (id) => (id === "cv2" ? roCv : tailoredCv));
        vi.mocked(getJobScore).mockImplementation(async (_id, cvId) => (cvId === "cv2"
          ? { ...tailored(), tailored: { ...match, total: 80, labels: marks(5) }, tailoredCvId: "cv2" } : tailored()));
      });

      it("switches the copy: ?cv=, the score, the CV and the links follow", async () => {
        const { router } = renderJob(); await ready();
        const group = within(await screen.findByRole("group", { name: "CV language" }));
        expect(group.getAllByRole("button").map((button) => button.textContent)).toEqual(["English", "Romanian"]);
        expect(group.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
        expect(group.getByRole("button", { name: "Romanian" })).toHaveAttribute("aria-pressed", "false");
        expect(await screen.findByText("Ran payroll for 40 staff")).toBeInTheDocument();

        await userEvent.click(group.getByRole("button", { name: "Romanian" }));
        expect(router.state.location.search).toBe("?cv=cv2");
        expect(router.state.historyAction).toBe("REPLACE");
        expect(screen.getByRole("button", { name: "Romanian" })).toHaveAttribute("aria-pressed", "true");
        expect(await screen.findByText("Your match: 80 of 100")).toBeInTheDocument();
        expect(getJobScore).toHaveBeenLastCalledWith("one", "cv2");
        expect(await screen.findByText("A făcut salarizarea pentru 40 de angajați")).toBeInTheDocument();
        expect(screen.queryByText("Ran payroll for 40 staff")).toBeNull();
        const strip = within(await band());
        expect(strip.getByText("5 of 7 must-haves covered. Still open: Must 6, Must 7.")).toBeInTheDocument();
        expect(strip.getByRole("link", { name: "Edit CV" })).toHaveAttribute("href", "/jobs/one/cv?cv=cv2");
        expect(strip.getByRole("button", { name: "Export" })).toBeEnabled();
        expect(strip.getByRole("link", { name: "Tailor again" })).toHaveAttribute("href", "/jobs/one/cv?cv=cv2&retailor=1");
        expect(screen.getByRole("link", { name: "Change template" })).toHaveAttribute("href", "/jobs/one/cv/template?cv=cv2");
      });

      it("never shows one copy's Re-check answer under the other copy's address", async () => {
        // English was edited since its score. Its Re-check starts in the moment after Romanian was chosen, while Romanian's score is still on the way.
        let roArrives: (score: JobScore) => void = () => {};
        let checked: (score: JobScore) => void = () => {};
        const ro: JobScore = { ...tailored(), tailored: { ...match, total: 80, labels: marks(5) }, tailoredCvId: "cv2" };
        vi.mocked(getJobScore).mockImplementation((_id, cvId) => (cvId === "cv2"
          ? new Promise<JobScore>((resolve) => { roArrives = resolve; }) : Promise.resolve({ ...tailored(), stale: true })));
        vi.mocked(recheckScore).mockReturnValue(new Promise((resolve) => { checked = resolve; }));
        const { router } = renderJob(); await ready();
        await userEvent.click(await screen.findByRole("button", { name: "Romanian" }));
        expect(router.state.location.search).toBe("?cv=cv2");
        await userEvent.click(within(await band()).getByRole("button", { name: "Re-check" }));
        expect(recheckScore).toHaveBeenCalledWith("cv1");
        await act(async () => { roArrives(ro); });
        expect(await screen.findByText("Your match: 80 of 100")).toBeInTheDocument();
        await act(async () => { checked({ ...tailored(7), tailored: { ...match, total: 88, labels: marks(7) } }); });
        expect(screen.getByText("Your match: 80 of 100")).toBeInTheDocument();
        expect(screen.queryByText("Your match: 88 of 100")).toBeNull();
        expect(await screen.findByText("A făcut salarizarea pentru 40 de angajați")).toBeInTheDocument();
      });

      it("opens on the copy ?cv= names", async () => {
        renderJob("/jobs/one?cv=cv2"); await ready();
        expect(await screen.findByText("A făcut salarizarea pentru 40 de angajați")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Romanian" })).toHaveAttribute("aria-pressed", "true");
        expect(within(await band()).getByText("Your match: 80 of 100")).toBeInTheDocument();
      });
    });

    describe("exporting from the job page", () => {
      const file = { name: "Ana_Pop_Acme_Engineer.pdf", pages: 1, fits: true, tightened: false };
      /** The dialog, opened once the CV has loaded. */
      const openExport = async () => {
        await screen.findByText("Ran payroll for 40 staff");
        await userEvent.click(within(await band()).getByRole("button", { name: "Export" }));
        return within(screen.getByRole("dialog", { name: "Download your CV" }));
      };

      it("opens a small dialog with the two downloads, and Download PDF makes the file from the copy on screen", async () => {
        vi.mocked(exportFile).mockResolvedValue(file);
        renderJob(); await ready();
        const dialog = await openExport();
        expect(dialog.getAllByRole("button").map((button) => button.textContent)).toEqual(["Download PDF", "Download Word", "Close"]);
        expect(dialog.queryByRole("link")).toBeNull();
        await userEvent.click(dialog.getByRole("button", { name: "Download PDF" }));
        expect(exportFile).toHaveBeenCalledWith("cv", "pdf", { cv: tailoredCv, job: expect.objectContaining({ title: "Engineer", requirements: seven }), template: "modern" });
        expect(await dialog.findByText("Downloaded: Ana_Pop_Acme_Engineer.pdf")).toBeInTheDocument();
        await userEvent.click(dialog.getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog", { name: "Download your CV" })).toBeNull();
      });

      it("exports the language copy that was chosen", async () => {
        const roCv: TailoredCv = { ...tailoredCv, id: "cv2", language: "ro", translatedFrom: "cv1",
          content: { ...content, experience: [{ ...role, bullets: [{ id: "b1", text: "A făcut salarizarea pentru 40 de angajați" }] }] } };
        vi.mocked(listTailored).mockResolvedValue([{ id: "cv1", language: "en", translatedFrom: null, updatedAt: job.updatedAt },
          { id: "cv2", language: "ro", translatedFrom: "cv1", updatedAt: job.updatedAt }]);
        vi.mocked(getTailored).mockImplementation(async (id) => (id === "cv2" ? roCv : tailoredCv));
        vi.mocked(getJobScore).mockImplementation(async (_id, cvId) => (cvId === "cv2" ? { ...tailored(), tailoredCvId: "cv2" } : tailored()));
        vi.mocked(exportFile).mockResolvedValue({ ...file, name: "Ana_Pop_Acme_Engineer.docx" });
        renderJob(); await ready();
        await userEvent.click(await screen.findByRole("button", { name: "Romanian" }));
        await screen.findByText("A făcut salarizarea pentru 40 de angajați");
        await userEvent.click(within(await band()).getByRole("button", { name: "Export" }));
        await userEvent.click(within(screen.getByRole("dialog", { name: "Download your CV" })).getByRole("button", { name: "Download Word" }));
        expect(exportFile).toHaveBeenCalledWith("cv", "docx", expect.objectContaining({ cv: roCv, template: "modern" }));
      });

      it("disables both downloads while a file is being made; a second click sends nothing", async () => {
        let made: (result: typeof file) => void = () => {};
        vi.mocked(exportFile).mockReturnValue(new Promise((resolve) => { made = resolve; }));
        renderJob(); await ready();
        const dialog = await openExport();
        await userEvent.click(dialog.getByRole("button", { name: "Download PDF" }));
        const busy = dialog.getByRole("button", { name: "Preparing the PDF…" });
        expect(busy).toBeDisabled();
        expect(dialog.getByRole("button", { name: "Download Word" })).toBeDisabled();
        fireEvent.click(busy);
        fireEvent.click(dialog.getByRole("button", { name: "Download Word" }));
        expect(exportFile).toHaveBeenCalledTimes(1);
        await act(async () => { made(file); });
        expect(await dialog.findByText("Downloaded: Ana_Pop_Acme_Engineer.pdf")).toBeInTheDocument();
        expect(dialog.getByRole("button", { name: "Download Word" })).toBeEnabled();
      });

      it("says so when the file can't be made, and the downloads work again", async () => {
        vi.mocked(exportFile).mockRejectedValueOnce(new Error("no fonts")).mockResolvedValue(file);
        renderJob(); await ready();
        const dialog = await openExport();
        await userEvent.click(dialog.getByRole("button", { name: "Download Word" }));
        expect(await dialog.findByRole("alert")).toHaveTextContent("The file couldn't be created. Your CV is safe. Try again, or try the other format.");
        await userEvent.click(dialog.getByRole("button", { name: "Download PDF" }));
        expect(await dialog.findByText("Downloaded: Ana_Pop_Acme_Engineer.pdf")).toBeInTheDocument();
        expect(dialog.queryByRole("alert")).toBeNull();
      });

      it("keeps Export disabled until the CV has loaded, and when it failed to load", async () => {
        let arrives: (cv: TailoredCv) => void = () => {};
        vi.mocked(getTailored).mockReturnValueOnce(new Promise((resolve) => { arrives = resolve; }));
        renderJob(); await ready();
        const strip = within(await band());
        expect(strip.getByRole("button", { name: "Export" })).toBeDisabled();
        await act(async () => { arrives(tailoredCv); });
        await waitFor(() => expect(strip.getByRole("button", { name: "Export" })).toBeEnabled());
      });

      it("keeps Export disabled when the CV failed to load", async () => {
        vi.mocked(getTailored).mockRejectedValue(new Error("down"));
        renderJob(); await ready();
        expect(await screen.findByText("We couldn't load your tailored CV. Nothing has changed.")).toBeInTheDocument();
        expect(within(await band()).getByRole("button", { name: "Export" })).toBeDisabled();
      });
    });

    it("shows no language switch for a job with one copy", async () => {
      renderJob(); await ready();
      expect(await screen.findByText("Ran payroll for 40 staff")).toBeInTheDocument();
      await waitFor(() => expect(listTailored).toHaveBeenCalled());
      expect(screen.queryByRole("group", { name: "CV language" })).toBeNull();
    });

    describe("edited since the last score", () => {
      const rechecked: JobScore = { ...tailored(7), tailored: { ...match, total: 88, labels: marks(7) } };
      beforeEach(() => { vi.mocked(getJobScore).mockResolvedValue({ ...tailored(), stale: true }); });

      it("says so next to the number, and Re-check puts the new score on the page", async () => {
        vi.mocked(recheckScore).mockResolvedValue(rechecked);
        renderJob(); await ready();
        const strip = within(await band());
        expect(strip.getByText("Your match: 84 of 100")).toBeInTheDocument();
        expect(strip.getByText("Edited since last score")).toBeInTheDocument();
        await userEvent.click(strip.getByRole("button", { name: "Re-check" }));
        expect(recheckScore).toHaveBeenCalledWith("cv1");
        expect(await strip.findByText("Your match: 88 of 100")).toBeInTheDocument();
        expect(strip.getByText("All 7 must-haves covered.")).toBeInTheDocument();
        expect(strip.queryByText("Edited since last score")).toBeNull();
        expect(strip.queryByRole("button", { name: "Re-check" })).toBeNull();
        expect(screen.queryByText(/84/)).toBeNull();
      });

      it("keeps the old number when the check fails, and Try again repeats it", async () => {
        vi.mocked(recheckScore).mockRejectedValueOnce(new ApiClientError(502, "ai_failed", "down")).mockResolvedValue(rechecked);
        renderJob(); await ready();
        const strip = within(await band());
        await userEvent.click(strip.getByRole("button", { name: "Re-check" }));
        expect(await strip.findByText("Couldn't check the score.")).toBeInTheDocument();
        expect(strip.getByText("Your match: 84 of 100")).toBeInTheDocument();
        await userEvent.click(strip.getByRole("button", { name: "Try again" }));
        expect(await strip.findByText("Your match: 88 of 100")).toBeInTheDocument();
        expect(recheckScore).toHaveBeenCalledTimes(2);
        expect(strip.queryByText("Couldn't check the score.")).toBeNull();
      });

      it("disables the button and reads Checking while the check runs; a second click sends nothing", async () => {
        let finish: (score: JobScore) => void = () => {};
        vi.mocked(recheckScore).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        renderJob(); await ready();
        const strip = within(await band());
        await userEvent.click(strip.getByRole("button", { name: "Re-check" }));
        const busy = strip.getByRole("button", { name: "Checking" });
        expect(busy).toBeDisabled();
        fireEvent.click(busy);
        expect(recheckScore).toHaveBeenCalledTimes(1);
        await act(async () => { finish(rechecked); });
        expect(await strip.findByText("Your match: 88 of 100")).toBeInTheDocument();
      });

      it("a copy with no score shows a dash, No score yet and Re-check", async () => {
        vi.mocked(getJobScore).mockResolvedValue(scores({ base: { ...match, total: 69, labels: marks(3) }, tailored: null,
          tailoredCvId: "cv1", stale: true, hasTailoredCv: true }));
        renderJob(); await ready();
        const strip = within(await band());
        expect(strip.getByText("–")).toBeInTheDocument();
        expect(strip.getByText("No score yet")).toBeInTheDocument();
        expect(strip.queryByText("Edited since last score")).toBeNull();
        expect(strip.getByRole("button", { name: "Re-check" })).toBeEnabled();
        expect(screen.queryByText(/69/)).toBeNull();
      });
    });

    it("shows no edited notice or Re-check while the score is current", async () => {
      renderJob(); await ready();
      const strip = within(await band());
      expect(strip.queryByText("Edited since last score")).toBeNull();
      expect(strip.queryByRole("button", { name: "Re-check" })).toBeNull();
    });

    it("tailoring again in progress: Continue tailoring is the main button, Edit CV stays, Tailor again goes", async () => {
      localStorage.setItem("resumora.tailorRun.one", "run1");
      vi.mocked(getRun).mockResolvedValue({ id: "run1", userId: "u1", jobId: "one", tailoredCvId: "cv1", kind: "retailor",
        sections: ["experience", "skills", "summary", "achievements", "languages", "layout"], status: "waiting_user",
        currentSection: "summary", questions: null, answers: null, proposals: null, errorCode: null,
        createdAt: job.createdAt, updatedAt: job.updatedAt });
      const { router } = renderJob(); await ready();
      const strip = within(await band());
      const go = await strip.findByRole("link", { name: "Continue tailoring" });
      expect(go).toHaveClass("ui-btn--primary");
      expect(strip.getByText("Tailoring in progress: step 3 of 6, Summary")).toBeInTheDocument();
      const edit = strip.getByRole("link", { name: "Edit CV" });
      expect(edit).toHaveAttribute("href", "/jobs/one/cv?cv=cv1");
      expect(edit).not.toHaveClass("ui-btn--primary");
      expect(strip.getByRole("button", { name: "Export" })).toBeInTheDocument();
      expect(strip.queryByRole("link", { name: "Tailor again" })).toBeNull();
      await userEvent.click(go);
      expect(router.state.location.pathname).toBe("/jobs/one/tailor");
      localStorage.clear();
    });
  });

  it.each([false, true])("warns about tailored CV deletion only when one exists: %s", async (tailored) => {
    vi.mocked(getJobScore).mockResolvedValue(scores({ base: match, tailored: tailored ? match : null }));
    renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Remove this job" }));
    const dialog = within(screen.getByRole("dialog", { name: "Remove this job?" }));
    expect(!!dialog.queryByText("This also deletes its tailored CVs, translations and cover letters.")).toBe(tailored);
  });
  // These states no longer carry a Tailor button that explains itself when pressed: the page says what is going on instead.
  it.each(["queued", "processing", "needs_text", "failed"] as const)("a %s job says where it stands and offers no tailoring", async (status) => {
    vi.mocked(getJob).mockResolvedValue({ ...job, status, extracted: null });
    renderJob();
    expect(await screen.findByText(status === "failed" ? "We couldn't read this job."
      : status === "needs_text" ? "This job needs its description before you can tailor your CV." : "Reading the ad…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tailor my CV" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open the original ad" })).toBeInTheDocument();
    expect(getCv).not.toHaveBeenCalled();
  });
  it("a CV that isn't enriched shows Before you tailor with its average, even at 80 or more, and Tailor anyway tailors", async () => {
    vi.mocked(useRoleScores).mockReturnValue(roleScores(84));
    const { router } = renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Tailor my CV" }));
    expect(await screen.findByRole("heading", { name: "Before you tailor" })).toBeInTheDocument();
    expect(screen.getByText("Your CV isn't enriched yet. Tailoring works much better when your roles have more detail.")).toBeInTheDocument();
    expect(screen.getByText("Average role score 84; a CV counts as enriched from 80")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Average role score" })).toHaveAttribute("aria-valuenow", "84");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tailor anyway" }));
    expect(router.state.location.pathname).toBe("/jobs/one/tailor");
  });
  it("opens My CV when Enrich first is chosen", async () => {
    vi.mocked(useRoleScores).mockReturnValue(roleScores(40));
    const { router } = renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Tailor my CV" }));
    await userEvent.click(await screen.findByRole("button", { name: "Enrich first" }));
    expect(router.state.location.pathname).toBe("/cv");
    expect(await screen.findByRole("heading", { name: "What should we focus on?" })).toBeInTheDocument();
  });
  it("with no scores yet the dialog says Not scored yet", async () => {
    vi.mocked(useRoleScores).mockReturnValue({ scores: new Map([["role", { state: "scoring" as const }]]), retry: vi.fn(), put: vi.fn() });
    renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Tailor my CV" }));
    expect(await screen.findByText("Not scored yet")).toBeInTheDocument();
  });
  it("offers the five application statuses and saves the selected status", async () => {
    const { client } = renderJob(); await ready();
    const select = screen.getByRole("combobox", { name: "Application status" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Not applied", "Applied", "Interview", "Offer", "Rejected"]);
    await userEvent.selectOptions(select, "applied");
    await waitFor(() => expect(client.getQueryData(["job", "u1", "one"])).toMatchObject({ applicationStatus: "applied", version: 2 }));
    expect(patchJob).toHaveBeenCalledWith("one", 1, job.extracted, { applicationStatus: "applied" });
  });
  it("has no Ad / Summary tabs", async () => {
    renderJob(); await ready();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tabpanel")).toBeNull();
  });
  it("shows facts, an enabled Tailor button and the exact ad with requirement marks behind Show original ad", async () => {
    const { client } = renderJob(); await ready();
    expect(getJob).toHaveBeenCalledWith("one");
    expect(client.getQueryData(["job", "u1", "one"])).toEqual(job);
    for (const text of ["Acme, London", "Hybrid", "Full time", "7,000–9,000 RON / month", "Apply by 1 Dec 2026"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.queryByText(/2026-12-01/)).not.toBeInTheDocument();
    expect(screen.queryByText("Not stated")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tailor my CV" })).toBeEnabled();
    expect(document.querySelector(".doc")).toBeNull();
    const show = screen.getByRole("button", { name: "Show original ad" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(show);
    expect(show).toHaveAttribute("aria-expanded", "true");
    expect(show).toHaveAccessibleName("Hide original ad");
    const ad = document.getElementById(show.getAttribute("aria-controls")!)!;
    expect(ad.querySelector(".doc")?.textContent).toBe(job.rawText);
    expect(ad.querySelector("b")).toBeNull();
    expect(within(ad).getByTitle("Must have")).toHaveTextContent("Strong SQL skills");
    expect(within(ad).getByTitle("Nice to have")).toHaveTextContent("German");
    await userEvent.click(show);
    expect(show).toHaveAccessibleName("Show original ad");
    expect(document.querySelector(".doc")).toBeNull();
    expect(screen.getByRole("link", { name: "Open the original ad" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Open the original ad" })).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Summary read by AI. Check it against the ad.")).toBeInTheDocument();
  });

  it("shows the must-haves, the nice-to-haves, then In short, duties, benefits and the counts line, in that order", async () => {
    renderJob(); await ready();
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(
      ["Engineer", "Must-haves", "Nice to have", "About this job", "In short", "What you'll do (1)", "Benefits (1)"]);
    expect(screen.getByText("Build useful tools.")).toBeInTheDocument();
    expect(screen.getAllByText("Strong SQL skills")).toHaveLength(1);
    expect(within(screen.getByRole("list", { name: "Must-haves" })).getAllByRole("listitem").map((line) => line.textContent)).toEqual(["Strong SQL skills"]);
    expect(screen.getByText("German").closest("section")).toContainElement(screen.getByRole("heading", { name: "Nice to have" }));
    expect(screen.getByText("Meal allowance")).toBeInTheDocument();
    expect(screen.getByText("Read from the ad: 2 requirements, 1 duty, 1 benefit, salary stated")).toBeInTheDocument();
    // No score yet: no keywords and no sentence about how much the CV covers.
    expect(screen.queryByRole("heading", { name: "ATS keywords" })).toBeNull();
    expect(screen.queryByText(/must-haves/)).toBeNull();
  });

  it("marks the must-haves and nice-to-haves from the base match, shows the keywords and says how much the CV covers", async () => {
    vi.mocked(getJobScore).mockResolvedValue(scores({ base: { ...match, total: 62, band: "fair", labels: [
      { ref: "r0", kind: "requirement", status: "met", evidence: "Wrote SQL daily", inferred: false },
      { ref: "r1", kind: "requirement", status: "missing", evidence: null, inferred: false },
      { ref: "k:SQL", kind: "keyword", status: "met", evidence: "SQL", inferred: false },
      { ref: "k:dbt", kind: "keyword", status: "missing", evidence: null, inferred: false },
    ] } }));
    renderJob(); await ready();
    expect(await screen.findByText("Your match: 62 of 100")).toBeInTheDocument();
    expect(screen.getByText("Fair")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Already on your CV · 1" })).getByText("Strong SQL skills")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Missing" })).toBeNull();
    // The match, the coach's sentence and the main action share the strip under the title.
    const band = screen.getByRole("region", { name: "Your match with this job" });
    expect(within(band).getByText("Your match: 62 of 100")).toBeInTheDocument();
    expect(within(band).getByRole("button", { name: "How is this scored?" })).toBeInTheDocument();
    expect(within(band).getByRole("button", { name: "Tailor my CV" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Strong SQL skills/ }));
    expect(screen.getByText("Wrote SQL daily")).toBeInTheDocument();
    expect(screen.getByText("German").closest("li")).toHaveTextContent("German (not on your CV yet)");
    const keywords = screen.getByRole("heading", { name: "ATS keywords" }).closest("section")!;
    expect(within(keywords).getByRole("progressbar", { name: "On your CV" })).toHaveAttribute("aria-valuetext", "1 of 2");
    expect(within(keywords).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["SQL (on your CV)", "dbt (not on your CV yet)"]);
    expect(screen.getByText("Your CV already shows every must-have. Tailoring will bring them out in this ad's words.")).toBeInTheDocument();
    expect(screen.queryByText("Base CV match")).toBeNull();
  });

  it("shows the first three duties, then Show N more", async () => {
    const responsibilities = ["Build reports", "Run audits", "Train staff", "Write specs", "Lead reviews"];
    vi.mocked(getJob).mockResolvedValue({ ...job, extracted: { ...job.extracted!, responsibilities } });
    renderJob(); await ready();
    const duties = () => within(screen.getByRole("list", { name: "What you'll do (5)" })).getAllByRole("listitem").map((item) => item.textContent);
    expect(duties()).toEqual(responsibilities.slice(0, 3));
    await userEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(duties()).toEqual(responsibilities);
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).toBeNull();
  });

  it("shows each benefit as a tag and counts several of each", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job, extracted: { ...job.extracted!, salary: null,
      responsibilities: ["Build reports", "Run audits"], benefits: ["Meal allowance", "Private medical care"] } });
    renderJob(); await ready();
    expect(screen.getByText("Meal allowance").closest("ul")).toContainElement(screen.getByText("Private medical care"));
    expect(screen.getByText("Read from the ad: 2 requirements, 2 duties, 2 benefits, salary not stated")).toBeInTheDocument();
  });

  it("shows missing text, no benefits, an empty requirements list, and user-edited attribution", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job, rawText: null, editedByUser: true,
      extracted: { ...job.extracted!, requirements: [], benefits: [] } });
    renderJob(); await ready();
    expect(screen.getByText("Summary edited by you")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Must-haves" })).toBeInTheDocument();
    expect(screen.getByText("None listed.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nice to have" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Benefits/ })).not.toBeInTheDocument();
    expect(screen.getByText("Read from the ad: 0 requirements, 1 duty, 0 benefits, salary stated")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show original ad" }));
    expect(screen.getByText("The original text isn't available for this job.")).toBeInTheDocument();
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
    expect(await screen.findByRole("link", { name: "All jobs" })).toHaveAttribute("href", "/jobs");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it.each(["queued", "processing"] as const)("polls %s jobs every three seconds until ready", async (status) => {
    vi.mocked(getJob).mockResolvedValueOnce({ ...job, status, extracted: null }).mockResolvedValue(job);
    vi.useFakeTimers();
    await act(async () => { renderJob(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole("heading", { name: "Reading the ad…" })).toBeInTheDocument();
    expect(screen.getByText("We're picking out what the ad asks for. About a minute.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the original ad" })).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "Reading the ad…" })).toBeInTheDocument();
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
    expect(screen.getByRole("alert")).toHaveTextContent(errorCode === "not_a_job"
      ? "Check that it is a single job ad, then remove this job and add it again."
      : "Remove this job, open the ad again and save it once it has fully loaded.");
    expect(screen.getByRole("button", { name: "Remove this job" })).toBeInTheDocument();
  });

  it("shows a missing job with a back link", async () => {
    vi.mocked(getJob).mockRejectedValue(new ApiClientError(404, "not_found", "Missing"));
    renderJob(); expect(await screen.findByText("This job isn't in your list.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All jobs" })).toHaveAttribute("href", "/jobs");
  });

  it("retries other loading failures", async () => {
    vi.mocked(getJob).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(job);
    renderJob(); expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your jobs.");
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
    await userEvent.click(screen.getByRole("button", { name: "Remove this job" }));
    const confirm = screen.getByRole("dialog", { name: "Remove this job?" });
    expect(deleteJob).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole("button", { name: "Remove this job" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Remove this job" }));
    const dialog = within(screen.getByRole("dialog", { name: "Remove this job?" }));
    expect(dialog.getByText("This also deletes its tailored CVs, translations and cover letters.")).toBeInTheDocument();
  });

  it("does not warn about tailored CVs for a failed job", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...job, status: "failed", errorCode: "ai_failed", extracted: null });
    renderJob(); await screen.findByRole("button", { name: "Remove this job" });
    await userEvent.click(screen.getByRole("button", { name: "Remove this job" }));
    expect(within(screen.getByRole("dialog", { name: "Remove this job?" })).queryByText("This also deletes its tailored CVs, translations and cover letters.")).toBeNull();
  });

  it("cancels deletion and keeps the job", async () => {
    const { router } = renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Remove this job" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Remove this job?" })).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Remove this job?")).not.toBeInTheDocument();
    expect(deleteJob).not.toHaveBeenCalled(); expect(router.state.location.pathname).toBe("/jobs/one");
  });

  it("keeps the job and reports a failed delete", async () => {
    vi.mocked(deleteJob).mockRejectedValue(new Error("Can't delete this job."));
    const { router } = renderJob(); await ready();
    await userEvent.click(screen.getByRole("button", { name: "Remove this job" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Remove this job?" })).getByRole("button", { name: "Remove this job" }));
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

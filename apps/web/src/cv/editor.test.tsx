import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { emptyCv, type CvContent } from "@resumora/shared";
import { ApiClientError } from "../lib/api-error.ts";

const api = vi.hoisted(() => ({
  getCv: vi.fn(),
  saveCv: vi.fn(),
  listHistory: vi.fn(),
  getHistoryItem: vi.fn(),
  restoreHistory: vi.fn(),
}));
vi.mock("./cv-api.ts", () => api);
const importsApi = vi.hoisted(() => ({ startImport: vi.fn(), getImport: vi.fn(), applyImport: vi.fn() }));
vi.mock("../imports/imports-api.ts", () => importsApi);
const authState = vi.hoisted(() => ({ userId: "user-a" }));
vi.mock("../auth/AuthProvider.tsx", () => ({
  useAuth: () => ({ loading: false, session: { user: { id: authState.userId } } }),
}));

// Scores ask the API in the background; keep them quiet and off the network.
const enrichApi = vi.hoisted(() => ({
  getScores: vi.fn(async () => []),
  scoreRole: vi.fn(() => new Promise(() => {})),
  createVoiceSession: vi.fn(),
  streamRewrite: vi.fn(),
  getSkillSuggestions: vi.fn(),
}));
vi.mock("./enrich/enrich-api.ts", () => enrichApi);

import { CvPage } from "./CvPage.tsx";
import * as roleScores from "./enrich/useRoleScores.ts";
import * as helperPanel from "./panel/HelperPanel.tsx";

function renderPage(url = "/cv") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <CvPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const withCv = (overrides: Partial<CvContent>) =>
  api.getCv.mockResolvedValue({ content: { ...emptyCv(), ...overrides }, version: 1, updatedAt: "2026-11-04T10:00:00Z" });
const basics = { ...emptyCv().basics, fullName: "Ana", summary: "Product person." };
const queuedImport = { id: "imp-1", status: "queued", fileName: "cv.pdf", error: null, result: null, createdAt: "2026-11-04T10:00:00Z" };

beforeEach(() => {
  vi.resetAllMocks();
  authState.userId = "user-a";
  api.getCv.mockResolvedValue({ content: emptyCv(), version: 0, updatedAt: "2026-11-04T10:00:00Z" });
  api.saveCv.mockResolvedValue({ version: 1, updatedAt: "2026-11-04T10:01:00Z" });
});

describe("CV editor", () => {
  describe.each(["real", "mocked"])("rapid section typing with %s role scores and panel", (components) => {
    beforeEach(() => {
      if (components === "mocked") {
        vi.spyOn(roleScores, "useRoleScores").mockReturnValue({ scores: new Map(), retry: vi.fn() });
        vi.spyOn(helperPanel, "HelperPanel").mockReturnValue(<></>);
      }
    });

    afterEach(() => vi.restoreAllMocks());

    it.each(["Summary", "Bullet 1 of Dev", "Degree"])("keeps every character typed into %s without an update loop", async (label) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const user = userEvent.setup({ delay: 0 });
      const typed = "Built reliable services for growing teams. ".repeat(4);
      withCv({
        basics,
        experience: [
          { id: "r1", company: "Acme", title: "Dev", location: "", startDate: "2020-03", endDate: "", current: true, description: "", bullets: [{ id: "b1", text: "" }], notes: [] },
        ],
        education: [
          { id: "e1", school: "University", degree: "", field: "", startDate: "2016", endDate: "2020", notes: "" },
        ],
      });
      renderPage();

      const field = await screen.findByRole("textbox", { name: label });
      await user.clear(field);
      await user.type(field, typed);

      expect(screen.getByRole("textbox", { name: label })).toHaveValue(typed);
      expect(consoleError.mock.calls.flat().map(String).join("\n")).not.toContain("Maximum update depth");
    });
  });

  describe("descriptions copied from the company and location", () => {
    const job = (id: string, description: string) => ({
      id, company: "Kreditech", title: "Developer", location: "Hamburg, Germany", startDate: "2020-01", endDate: "",
      current: true, description, bullets: [], notes: [],
    });
    it("are emptied once when the CV opens, in one save, and real ones stay", async () => {
      withCv({ experience: [job("a", "Kreditech · Hamburg, Germany"), job("b", "Kreditech is a fintech"), job("c", "KREDITECH | Hamburg")] });
      renderPage();
      await waitFor(() => expect(api.saveCv).toHaveBeenCalled(), { timeout: 4000 });
      expect(api.saveCv).toHaveBeenCalledTimes(1);
      expect(api.saveCv.mock.lastCall![0].experience.map((e: { description: string }) => e.description)).toEqual(["", "Kreditech is a fintech", ""]);
    });
    it("a CV without copies opens without a save", async () => {
      withCv({ experience: [job("b", "Kreditech is a fintech")] });
      renderPage();
      await screen.findByText("Saved");
      await new Promise((done) => setTimeout(done, 1500));
      expect(api.saveCv).not.toHaveBeenCalled();
    });
  });

  describe("the guided path (1A)", () => {
    it("Enrich my CV opens its start screen", async () => {
      withCv({ basics });
      renderPage();
      await userEvent.click(await screen.findByRole("button", { name: "Enrich my CV" }));
      expect(screen.getByRole("heading", { name: "Let's make your CV stronger, one step at a time" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Not now" }));
      expect(screen.queryByRole("dialog", { name: "Enrich your CV" })).toBeNull();
    });
    it("/cv?enrich=1 opens it on arrival", async () => {
      withCv({ basics });
      renderPage("/cv?enrich=1");
      expect(await screen.findByRole("heading", { name: "Let's make your CV stronger, one step at a time" })).toBeInTheDocument();
    });
  });

  it("typing on the page autosaves", async () => {
    const user = userEvent.setup();
    withCv({ basics });
    renderPage();
    await user.type(await screen.findByRole("textbox", { name: "Summary" }), " More.");
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument(), { timeout: 3000 });
    expect(api.saveCv.mock.lastCall![0].basics.summary).toBe("Product person. More.");
  });

  it("a keyboard-only user can add a role and two bullets", async () => {
    const user = userEvent.setup();
    withCv({
      basics,
      experience: [
        { id: "r1", company: "Acme", title: "Dev", location: "", startDate: "2020-03", endDate: "", current: true, description: "", bullets: [], notes: [] },
      ],
    });
    renderPage();
    await screen.findByRole("textbox", { name: "Summary" });
    async function tabTo(found: () => boolean, what: string) {
      for (let i = 0; i < 40; i++) {
        await user.tab();
        if (found()) return;
      }
      throw new Error(`never reached ${what}`);
    }
    await tabTo(() => document.activeElement?.textContent === "+ Add role", "+ Add role");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole("textbox", { name: "Role title" })[1]));
    await user.keyboard("Lead");
    // A new role starts with one empty bullet: Tab reaches it.
    await tabTo(() => document.activeElement?.getAttribute("aria-label") === "Bullet 1 of Lead", "the first bullet");
    await user.keyboard("First{Enter}");
    await waitFor(() => expect(screen.getByRole("textbox", { name: /^Bullet 2 of / })).toHaveFocus());
    await user.keyboard("Second");

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument(), { timeout: 3000 });
    const [content] = api.saveCv.mock.lastCall!;
    expect(content.experience).toHaveLength(2);
    expect(content.experience[1]).toMatchObject({ title: "Lead" });
    expect(content.experience[1].bullets.map((b: { text: string }) => b.text)).toEqual(["First", "Second"]);
  }, 15_000);

  it("the page is inert while History is open", async () => {
    const user = userEvent.setup();
    withCv({ basics });
    api.listHistory.mockResolvedValue([]);
    renderPage();
    const summary = await screen.findByRole("textbox", { name: "Summary" });
    expect(summary.closest("[inert]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "History" }));
    const panel = await screen.findByRole("complementary", { name: "History" });
    expect(panel.closest("[inert]")).toBeNull();
    expect(screen.getByRole("article", { name: "CV page" }).closest("[inert]")).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "Summary" })).toBeNull();
  });

  it("the page is inert while an import is open", async () => {
    const user = userEvent.setup();
    withCv({ basics });
    importsApi.startImport.mockResolvedValue(queuedImport);
    importsApi.getImport.mockResolvedValue(queuedImport);
    renderPage();
    const summary = await screen.findByRole("textbox", { name: "Summary" });
    expect(summary.closest("[inert]")).toBeNull();
    await user.upload(screen.getByLabelText("Choose a CV file"), new File(["%PDF-1.4 test"], "cv.pdf", { type: "application/pdf" }));
    await screen.findByRole("dialog", { name: "Import review" });
    expect(summary.closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("complementary", { name: "Helper panel" }).closest("[inert]")).not.toBeNull();
  });

  it("shows conflict banner", async () => {
    const user = userEvent.setup();
    api.saveCv.mockRejectedValue(
      new ApiClientError(409, "version_conflict", "Saved elsewhere", {
        current: { version: 4, updatedAt: "2026-11-04T10:05:00Z" },
      }),
    );
    renderPage();
    await user.type(await screen.findByRole("textbox", { name: "Full name" }), "Mine");
    expect(await screen.findByText("This CV was saved in another tab or device.", {}, { timeout: 3000 })).toBeInTheDocument();

    api.getCv.mockResolvedValue({
      content: { ...emptyCv(), basics: { ...emptyCv().basics, fullName: "Server" } },
      version: 4,
      updatedAt: "2026-11-04T10:05:00Z",
    });
    await user.click(screen.getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("Server"));
    expect(screen.queryByText("This CV was saved in another tab or device.")).not.toBeInTheDocument();
  });

  it("a new sign-in loads that user's CV, not a cached one", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const page = () => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CvPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const cvOf = (fullName: string) => ({
      content: { ...emptyCv(), basics: { ...emptyCv().basics, fullName } },
      version: 1,
      updatedAt: "2026-11-04T10:00:00Z",
    });

    api.getCv.mockResolvedValue(cvOf("User A"));
    const first = render(page());
    expect(await screen.findByDisplayValue("User A")).toBeInTheDocument();
    first.unmount(); // sign-out navigates away from the editor
    authState.userId = "user-b";

    api.getCv.mockResolvedValue(cvOf("User B"));
    render(page());
    expect(await screen.findByDisplayValue("User B")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("User A")).not.toBeInTheDocument();
  });

  it("shows a retry option when the CV cannot load", async () => {
    api.getCv.mockRejectedValueOnce(new ApiClientError(0, "network", "offline"));
    renderPage();
    const retry = await screen.findByRole("button", { name: "Try again" });
    await userEvent.click(retry);
    expect(await screen.findByRole("textbox", { name: "Full name" })).toBeInTheDocument();
  });

  it("sorts an unclear skill from the panel and saves it", async () => {
    const user = userEvent.setup();
    withCv({ unclearSkills: [{ id: "s1", name: "Management" }] });
    renderPage();
    await user.click(await screen.findByRole("textbox", { name: "Add technical skill" }));
    await user.click(screen.getByRole("button", { name: "→ Professional" }));
    await waitFor(() => expect(api.saveCv).toHaveBeenCalled(), { timeout: 3000 });
    const [content] = api.saveCv.mock.lastCall!;
    expect(content.professionalSkills).toEqual([{ id: "s1", name: "Management" }]);
    expect(content.unclearSkills).toEqual([]);
  });
});

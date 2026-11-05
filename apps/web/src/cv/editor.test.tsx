import { beforeEach, describe, expect, it, vi } from "vitest";
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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

const named = (fullName: string): CvContent => ({ ...emptyCv(), basics: { ...emptyCv().basics, fullName } });

const cvPage = () => screen.getByRole("article", { name: "CV page" });
const nameField = () => screen.getByRole("textbox", { name: "Full name" });

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

beforeEach(() => {
  vi.resetAllMocks();
  api.getCv.mockResolvedValue({ content: named("Current"), version: 2, updatedAt: "2026-11-04T10:20:00Z" });
  api.listHistory.mockResolvedValue([
    { id: "h2", reason: "restore", createdAt: "2026-11-04T10:15:00Z" },
    { id: "h1", reason: "autosave", createdAt: "2026-11-04T10:00:00Z" },
  ]);
  api.getHistoryItem.mockResolvedValue({ content: named("Old Name"), createdAt: "2026-11-04T10:00:00Z" });
});

async function openHistory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "History" }));
  return screen.findByRole("complementary", { name: "History" });
}

describe("version history", () => {
  it("lists versions newest first", async () => {
    const user = userEvent.setup();
    renderPage();
    const panel = await openHistory(user);
    const items = await within(panel).findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Before restore");
    expect(items[1]).toHaveTextContent("While editing");
  });

  it("previews a version on the page", async () => {
    const user = userEvent.setup();
    renderPage();
    const panel = await openHistory(user);
    const [, older] = await within(panel).findAllByRole("listitem");
    await user.click(within(older!).getByRole("button"));
    await waitFor(() => expect(cvPage()).toHaveTextContent("Old Name"));
    expect(screen.getByText(/Previewing the version from/)).toBeInTheDocument();
    expect(within(older!).getByRole("button", { pressed: true })).toBeInTheDocument();
    expect(api.getHistoryItem).toHaveBeenCalledWith("h1");
    expect(within(cvPage()).queryByRole("button")).not.toBeInTheDocument();
  });

  it("a slow preview never leaves another version on the page", async () => {
    const user = userEvent.setup();
    let finishB!: (v: { content: CvContent; createdAt: string }) => void;
    renderPage();
    const panel = await openHistory(user);
    const [newer, older] = await within(panel).findAllByRole("listitem");
    await user.click(within(older!).getByRole("button"));
    await waitFor(() => expect(cvPage()).toHaveTextContent("Old Name"));
    api.getHistoryItem.mockReturnValue(new Promise((resolve) => (finishB = resolve)));
    await user.click(within(newer!).getByRole("button"));
    expect(cvPage()).not.toHaveTextContent("Old Name");
    const restoreButton = within(panel).getByRole("button", { name: "Restore this version" });
    expect(restoreButton).toBeDisabled();
    await act(async () => finishB({ content: named("Newer Name"), createdAt: "2026-11-04T10:15:00Z" }));
    expect(cvPage()).toHaveTextContent("Newer Name");
    expect(restoreButton).toBeEnabled();
  });

  it("closing history shows the current CV again", async () => {
    const user = userEvent.setup();
    renderPage();
    const panel = await openHistory(user);
    const [, older] = await within(panel).findAllByRole("listitem");
    await user.click(within(older!).getByRole("button"));
    await waitFor(() => expect(cvPage()).toHaveTextContent("Old Name"));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(nameField()).toHaveValue("Current");
    expect(screen.queryByText(/Previewing the version from/)).not.toBeInTheDocument();
  });

  it("Escape closes history even when focus is on the page", async () => {
    const user = userEvent.setup();
    renderPage();
    const panel = await openHistory(user);
    const [, older] = await within(panel).findAllByRole("listitem");
    await user.click(within(older!).getByRole("button"));
    await waitFor(() => expect(cvPage()).toHaveTextContent("Old Name"));
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "History" })).not.toBeInTheDocument();
    expect(nameField()).toHaveValue("Current");
  });

  it("groups versions by day with the time", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-04T12:00:00Z") });
    try {
      api.listHistory.mockResolvedValue([
        { id: "h2", reason: "import", createdAt: "2026-11-04T10:15:00Z" },
        { id: "h1", reason: "ai", createdAt: "2026-11-02T10:00:00Z" },
      ]);
      const user = userEvent.setup();
      renderPage();
      const panel = await openHistory(user);
      expect(await within(panel).findByText("Today")).toBeInTheDocument();
      expect(within(panel).getByText("2 November")).toBeInTheDocument();
      expect(within(panel).getByText("Before import")).toBeInTheDocument();
      expect(within(panel).getByText("Before AI change")).toBeInTheDocument();
      await user.click(within(panel).getByRole("button", { name: /Before import/ }));
      expect(await screen.findByText(/Previewing the version from today, [0-9]{2}:[0-9]{2}/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("restore replaces the editor content and flags an empty section added this visit", async () => {
    const user = userEvent.setup();
    api.restoreHistory.mockResolvedValue({ version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Add Summary" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Add Summary" })).not.toBeInTheDocument();
    const panel = await openHistory(user);
    const [, older] = await within(panel).findAllByRole("listitem");
    api.getCv.mockResolvedValue({ content: named("Old Name"), version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    await user.click(within(older!).getByRole("button"));
    const restoreButton = within(panel).getByRole("button", { name: "Restore this version" });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    await user.click(restoreButton);

    expect(api.restoreHistory).toHaveBeenCalledWith("h1", 2);
    await waitFor(() => expect(nameField()).toHaveValue("Old Name"));
    expect(screen.getByRole("button", { name: "Add Summary" })).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "History" })).not.toBeInTheDocument();
  });

  it("restore conflict shows banner", async () => {
    const user = userEvent.setup();
    api.restoreHistory.mockRejectedValue(
      new ApiClientError(409, "version_conflict", "Saved elsewhere", {
        current: { version: 5, updatedAt: "2026-11-04T10:31:00Z" },
      }),
    );
    renderPage();
    const panel = await openHistory(user);
    const [, older] = await within(panel).findAllByRole("listitem");
    await user.click(within(older!).getByRole("button"));
    const restoreButton = within(panel).getByRole("button", { name: "Restore this version" });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    await user.click(restoreButton);
    expect(await screen.findByText("This CV was saved in another tab or device.")).toBeInTheDocument();
  });

  it("restore is disabled while there are unsaved changes", async () => {
    const user = userEvent.setup();
    api.saveCv.mockReturnValue(new Promise(() => {})); // save never finishes
    renderPage();
    await user.type(await screen.findByRole("textbox", { name: "Full name" }), "!");
    const panel = await openHistory(user);
    const [first] = await within(panel).findAllByRole("listitem");
    await user.click(within(first!).getByRole("button"));
    expect(within(panel).getByRole("button", { name: "Restore this version" })).toBeDisabled();
  });
});

describe("version history blocks editing", () => {
  it("the editor can't be edited while history is open", async () => {
    const user = userEvent.setup();
    renderPage();
    const field = await screen.findByRole("textbox", { name: "Full name" });
    const panel = await openHistory(user);
    expect(panel.closest("[inert]")).toBeNull();
    expect(cvPage().closest("[inert]")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("textbox", { name: "Full name" }).closest("[inert]")).toBeNull();
    expect(field).toBeDefined();
  });

  it("Load latest flags an empty section when the restore worked but reloading failed", async () => {
    const user = userEvent.setup();
    api.restoreHistory.mockResolvedValue({ version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Add Summary" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Add Summary" })).not.toBeInTheDocument();
    const panel = await openHistory(user);
    const [, older] = await within(panel).findAllByRole("listitem");
    api.getCv.mockRejectedValueOnce(new ApiClientError(0, "network", "offline"));
    await user.click(within(older!).getByRole("button"));
    const restoreButton = within(panel).getByRole("button", { name: "Restore this version" });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    await user.click(restoreButton);

    expect(await screen.findByRole("button", { name: "Load latest" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Summary" })).not.toBeInTheDocument();
    api.getCv.mockResolvedValue({ content: named("Old Name"), version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    await user.click(screen.getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(nameField()).toHaveValue("Old Name"));
    expect(screen.getByRole("button", { name: "Add Summary" })).toBeInTheDocument();
  });
});

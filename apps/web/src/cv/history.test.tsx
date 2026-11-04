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

import { CvPage } from "./CvPage.tsx";

const named = (fullName: string): CvContent => ({ ...emptyCv(), basics: { ...emptyCv().basics, fullName } });

const cvPage = () => screen.getByRole("article", { name: "CV page" });

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
    expect(cvPage()).toHaveTextContent("Current");
    expect(cvPage()).not.toHaveTextContent("Old Name");
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
    expect(cvPage()).toHaveTextContent("Current");
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

  it("restore replaces the editor content", async () => {
    const user = userEvent.setup();
    api.restoreHistory.mockResolvedValue({ version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    renderPage();
    const panel = await openHistory(user);
    const [, older] = await within(panel).findAllByRole("listitem");
    api.getCv.mockResolvedValue({ content: named("Old Name"), version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    await user.click(within(older!).getByRole("button"));
    const restoreButton = within(panel).getByRole("button", { name: "Restore this version" });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    await user.click(restoreButton);

    expect(api.restoreHistory).toHaveBeenCalledWith("h1", 2);
    await waitFor(() => expect(cvPage()).toHaveTextContent("Old Name"));
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
    await user.click(await screen.findByRole("button", { name: "Edit your details" }));
    await user.type(screen.getByLabelText("Full name"), "!");
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
    const panel = await openHistory(user);
    expect(panel.closest("[inert]")).toBeNull();
    expect(cvPage().closest("[inert]")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(cvPage().closest("[inert]")).toBeNull();
  });

  it("offers Load latest when the restore worked but reloading failed", async () => {
    const user = userEvent.setup();
    api.restoreHistory.mockResolvedValue({ version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    renderPage();
    const panel = await openHistory(user);
    const [, older] = await within(panel).findAllByRole("listitem");
    api.getCv.mockRejectedValueOnce(new ApiClientError(0, "network", "offline"));
    await user.click(within(older!).getByRole("button"));
    const restoreButton = within(panel).getByRole("button", { name: "Restore this version" });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    await user.click(restoreButton);

    expect(await screen.findByRole("button", { name: "Load latest" })).toBeInTheDocument();
    api.getCv.mockResolvedValue({ content: named("Old Name"), version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    await user.click(screen.getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(cvPage()).toHaveTextContent("Old Name"));
  });
});

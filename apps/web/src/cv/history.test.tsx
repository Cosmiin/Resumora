import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CvPage />
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
  return screen.findByRole("dialog", { name: "Version history" });
}

describe("version history", () => {
  it("lists versions newest first", async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openHistory(user);
    const items = await within(dialog).findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Before a restore");
    expect(items[1]).toHaveTextContent("Saved automatically");
  });

  it("previews a version", async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openHistory(user);
    const [, older] = await within(dialog).findAllByRole("listitem");
    await user.click(within(older!).getByRole("button", { name: "Preview" }));
    expect(await within(dialog).findByText("Old Name")).toBeInTheDocument();
    expect(api.getHistoryItem).toHaveBeenCalledWith("h1");
  });

  it("restore replaces the editor content", async () => {
    const user = userEvent.setup();
    api.restoreHistory.mockResolvedValue({ version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    renderPage();
    const dialog = await openHistory(user);
    const [, older] = await within(dialog).findAllByRole("listitem");
    api.getCv.mockResolvedValue({ content: named("Old Name"), version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    await user.click(within(older!).getByRole("button", { name: "Restore" }));

    expect(api.restoreHistory).toHaveBeenCalledWith("h1", 2);
    await waitFor(() => expect(screen.getByLabelText("Full name")).toHaveValue("Old Name"));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restore conflict shows banner", async () => {
    const user = userEvent.setup();
    api.restoreHistory.mockRejectedValue(
      new ApiClientError(409, "version_conflict", "Saved elsewhere", {
        current: { version: 5, updatedAt: "2026-11-04T10:31:00Z" },
      }),
    );
    renderPage();
    const dialog = await openHistory(user);
    const [, older] = await within(dialog).findAllByRole("listitem");
    await user.click(within(older!).getByRole("button", { name: "Restore" }));
    expect(await screen.findByText("This CV was saved in another tab or device.")).toBeInTheDocument();
  });

  it("restore is disabled while there are unsaved changes", async () => {
    const user = userEvent.setup();
    api.saveCv.mockReturnValue(new Promise(() => {})); // save never finishes
    renderPage();
    await user.type(await screen.findByLabelText("Full name"), "!");
    const dialog = await openHistory(user);
    const [first] = await within(dialog).findAllByRole("listitem");
    expect(within(first!).getByRole("button", { name: "Restore" })).toBeDisabled();
  });
});

describe("version history blocks editing", () => {
  it("the editor can't be edited while history is open", async () => {
    const user = userEvent.setup();
    renderPage();
    await openHistory(user);
    expect(screen.getByLabelText("Full name").closest("[inert]")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Full name").closest("[inert]")).toBeNull();
  });

  it("offers Load latest when the restore worked but reloading failed", async () => {
    const user = userEvent.setup();
    api.restoreHistory.mockResolvedValue({ version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    renderPage();
    const dialog = await openHistory(user);
    const [, older] = await within(dialog).findAllByRole("listitem");
    api.getCv.mockRejectedValueOnce(new ApiClientError(0, "network", "offline"));
    await user.click(within(older!).getByRole("button", { name: "Restore" }));

    expect(await screen.findByRole("button", { name: "Load latest" })).toBeInTheDocument();
    api.getCv.mockResolvedValue({ content: named("Old Name"), version: 3, updatedAt: "2026-11-04T10:30:00Z" });
    await user.click(screen.getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(screen.getByLabelText("Full name")).toHaveValue("Old Name"));
  });
});

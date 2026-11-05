import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { emptyCv } from "@resumora/shared";

const api = vi.hoisted(() => ({
  getCv: vi.fn(),
  saveCv: vi.fn(),
  listHistory: vi.fn(),
  getHistoryItem: vi.fn(),
  restoreHistory: vi.fn(),
}));
vi.mock("../cv-api.ts", () => api);
vi.mock("../../imports/imports-api.ts", () => ({ startImport: vi.fn(), getImport: vi.fn(), applyImport: vi.fn() }));
vi.mock("../../auth/AuthProvider.tsx", () => ({
  useAuth: () => ({ loading: false, session: { user: { id: "user-a" } } }),
}));

import { CvPage } from "../CvPage.tsx";

/** jsdom has no matchMedia: pretend the screen is a phone. */
function phoneScreen() {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.resetAllMocks();
  phoneScreen();
  api.getCv.mockResolvedValue({
    content: { ...emptyCv(), basics: { ...emptyCv().basics, fullName: "Ana", summary: "Product person." } },
    version: 1,
    updatedAt: "2026-11-04T10:00:00Z",
  });
});

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

describe("bottom sheet on phones", () => {
  it("the grip toggles between peek and full", async () => {
    const user = userEvent.setup();
    renderPage();
    const grip = await screen.findByRole("button", { name: "Panel size" });
    expect(grip).toHaveAttribute("aria-expanded", "false");
    await user.click(grip);
    expect(grip).toHaveAttribute("aria-expanded", "true");
    await user.click(grip);
    expect(grip).toHaveAttribute("aria-expanded", "false");
  });

  it("a vertical drag of more than 40 px switches the state, and Esc goes back to peek", async () => {
    renderPage();
    const grip = await screen.findByRole("button", { name: "Panel size" });
    fireEvent.pointerDown(grip, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 270, pointerId: 1 });
    expect(grip).toHaveAttribute("aria-expanded", "false");
    fireEvent.pointerDown(grip, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 240, pointerId: 1 });
    expect(grip).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(grip, { key: "Escape" });
    expect(grip).toHaveAttribute("aria-expanded", "false");
  });

  it("focusing a page field brings the sheet to peek", async () => {
    const user = userEvent.setup();
    renderPage();
    const grip = await screen.findByRole("button", { name: "Panel size" });
    await user.click(grip);
    expect(grip).toHaveAttribute("aria-expanded", "true");
    await user.click(await screen.findByRole("textbox", { name: "Summary" }));
    expect(grip).toHaveAttribute("aria-expanded", "false");
  });
});

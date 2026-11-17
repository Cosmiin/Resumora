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

// Scores ask the API in the background; keep them quiet and off the network.
const enrichApi = vi.hoisted(() => ({
  getScores: vi.fn(async () => []),
  scoreRole: vi.fn(() => new Promise(() => {})),
  createVoiceSession: vi.fn(),
  streamRewrite: vi.fn(),
  getSkillSuggestions: vi.fn(),
}));
vi.mock("../enrich/enrich-api.ts", () => enrichApi);

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

  it("the sheet follows the pointer during a drag and lets go on release", async () => {
    renderPage();
    const grip = await screen.findByRole("button", { name: "Panel size" });
    const sheet = grip.closest(".sheet") as HTMLElement;
    // jsdom lays nothing out: give the sheet a height, so there is room to travel.
    Object.defineProperty(sheet, "offsetHeight", { configurable: true, value: 600 });
    fireEvent.pointerDown(grip, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 400, pointerId: 1 });
    expect(sheet.style.transform).toBe("translateY(324px)");
    expect(sheet.style.transition).toBe("none");
    fireEvent.pointerUp(grip, { clientY: 400, pointerId: 1 });
    expect(sheet.style.transform).toBe("");
    expect(sheet.style.transition).toBe("");
    expect(grip).toHaveAttribute("aria-expanded", "true");
  });

  it("a short sheet opens from a drag on its content; a full one does not close from there", async () => {
    renderPage();
    const grip = await screen.findByRole("button", { name: "Panel size" });
    const body = grip.closest(".sheet")!.querySelector(".sheet-body")!;
    fireEvent.pointerDown(body, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(body, { clientY: 440, pointerId: 1 });
    fireEvent.pointerUp(body, { clientY: 440, pointerId: 1 });
    expect(grip).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(body, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(body, { clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(body, { clientY: 400, pointerId: 1 });
    expect(grip).toHaveAttribute("aria-expanded", "true");
  });

  it("a drag that ends on a control does not click it", async () => {
    renderPage();
    const grip = await screen.findByRole("button", { name: "Panel size" });
    const inside = grip.closest(".sheet")!.querySelector<HTMLElement>(".sheet-body button")!;
    const clicked = vi.fn();
    inside.addEventListener("click", clicked);
    fireEvent.pointerDown(inside, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(inside, { clientY: 440, pointerId: 1 });
    fireEvent.pointerUp(inside, { clientY: 440, pointerId: 1 });
    fireEvent.click(inside);
    expect(clicked).not.toHaveBeenCalled();
    expect(grip).toHaveAttribute("aria-expanded", "true");
    // The next plain tap is a click again.
    fireEvent.click(inside);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("a small slow drag on the grip leaves the state as it was", async () => {
    renderPage();
    const grip = await screen.findByRole("button", { name: "Panel size" });
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    fireEvent.pointerDown(grip, { clientY: 300, pointerId: 1 });
    now.mockReturnValue(400);
    fireEvent.pointerMove(grip, { clientY: 280, pointerId: 1 });
    now.mockReturnValue(800);
    fireEvent.pointerUp(grip, { clientY: 280, pointerId: 1 });
    fireEvent.click(grip);
    expect(grip).toHaveAttribute("aria-expanded", "false");
    now.mockRestore();
  });

  it("a fast short drag that stops before the finger lifts is not a flick", async () => {
    renderPage();
    const grip = await screen.findByRole("button", { name: "Panel size" });
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    fireEvent.pointerDown(grip, { clientY: 300, pointerId: 1 });
    now.mockReturnValue(20);
    fireEvent.pointerMove(grip, { clientY: 270, pointerId: 1 });
    now.mockReturnValue(1000);
    fireEvent.pointerUp(grip, { clientY: 270, pointerId: 1 });
    expect(grip).toHaveAttribute("aria-expanded", "false");
    // The same drag, let go while still moving, opens the sheet.
    now.mockReturnValue(2000);
    fireEvent.pointerDown(grip, { clientY: 300, pointerId: 1 });
    now.mockReturnValue(2020);
    fireEvent.pointerMove(grip, { clientY: 270, pointerId: 1 });
    now.mockReturnValue(2030);
    fireEvent.pointerUp(grip, { clientY: 270, pointerId: 1 });
    expect(grip).toHaveAttribute("aria-expanded", "true");
    now.mockRestore();
  });
});

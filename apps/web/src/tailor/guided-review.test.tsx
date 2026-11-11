import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type TailoredCv } from "@resumora/shared";

vi.mock("./tailored-api.ts", () => ({ getTailored: vi.fn(), reviewItem: vi.fn() }));
vi.mock("../lib/supabase.ts", () => ({ supabase: {} }));
import { ApiClientError } from "../lib/api-error.ts";
import { GuidedReview } from "./GuidedReview.tsx";
import { getTailored, reviewItem } from "./tailored-api.ts";

const guess = (text: string, reason: string, reviewed = false) => ({ kept: true, inferred: true, reviewed, text, reason });
const content = { ...emptyCv("en"), basics: { ...emptyCv("en").basics, summary: "Payroll lead who works abroad." },
  experience: [{ id: "r1", company: "Beta", title: "Lead", location: "", startDate: "2020-01", endDate: "", current: true, description: "",
    bullets: [{ id: "b1", text: "Led the payroll migration" }], notes: [] }] };
const row = (review: TailoredCv["review"], version = 3, over: Partial<TailoredCv> = {}): TailoredCv => ({
  id: "tc-1", userId: "u", jobId: "job-1", language: "en", translatedFrom: null, content, baseSnapshot: emptyCv("en"),
  baseSnapshotAt: "2026-11-08T09:00:00Z", template: "classic", tone: "neutral", instruction: null, review, score: null,
  coverLetter: null, version, createdAt: "2026-11-08T09:00:00Z", updatedAt: "2026-11-08T09:30:00Z", ...over,
});
const two = row({ summary: { "summary#0": guess("who works abroad", "From your roles in Hamburg and Bucharest.") },
  experience: { b1: guess("Led the payroll migration", "Your note on the migration.") } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTailored).mockResolvedValue(two);
});

function guide() {
  const onClose = vi.fn();
  const onExport = vi.fn();
  render(<GuidedReview load={() => getTailored("tc-1")} template="classic" onClose={onClose} onExport={onExport} />);
  return { onClose, onExport };
}

describe("GuidedReview (GuideA)", () => {
  it("dims the page and glows the guess in place, with its reason, AI guess 1 of 2, and Keep / Edit / Remove", async () => {
    guide();
    expect(await screen.findByText("AI guess · 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("From your roles in Hamburg and Bucharest.")).toBeInTheDocument();
    expect(document.querySelector(".guide-page .cv-mark-focus")?.textContent).toBe("Payroll lead who works abroad.");
    for (const name of ["Keep", "Edit", "Remove", "Stop"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("Remove sends the decision with the version; the next guess follows, then All checked", async () => {
    const user = userEvent.setup();
    vi.mocked(reviewItem)
      .mockResolvedValueOnce(row({ ...two.review, summary: { "summary#0": { ...guess("who works abroad", "x", true), kept: false } } }, 4))
      .mockResolvedValueOnce(row({ summary: { "summary#0": guess("who works abroad", "x", true) }, experience: { b1: guess("Led the payroll move", "y", true) } }, 5));
    const { onExport } = guide();
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(reviewItem).toHaveBeenCalledWith("tc-1", { section: "summary", key: "summary#0", action: "remove", version: 3 });
    expect(await screen.findByText("AI guess · 2 of 2")).toBeInTheDocument();
    expect(document.querySelector(".guide-page .cv-mark-focus")?.textContent).toBe("Led the payroll migration");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox");
    await user.clear(box);
    await user.type(box, "Led the payroll move");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(reviewItem).toHaveBeenLastCalledWith("tc-1", { section: "experience", key: "b1", action: "edit", text: "Led the payroll move", version: 4 });
    expect(await screen.findByText("All checked ✓")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport).toHaveBeenCalled();
  });

  it("a stale version (409) reloads the CV and stays on the guess", async () => {
    const user = userEvent.setup();
    vi.mocked(reviewItem).mockRejectedValueOnce(new ApiClientError(409, "version_conflict", "Saved elsewhere"));
    vi.mocked(getTailored).mockResolvedValueOnce(two).mockResolvedValueOnce(row(two.review, 7));
    guide();
    await user.click(await screen.findByRole("button", { name: "Keep" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This CV changed somewhere else. We reloaded it.");
    expect(getTailored).toHaveBeenCalledTimes(2);
    vi.mocked(reviewItem).mockResolvedValueOnce(row(two.review, 8));
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(reviewItem).toHaveBeenLastCalledWith("tc-1", { section: "summary", key: "summary#0", action: "keep", version: 7 });
  });

  it("an item edited after tailoring (409 item_changed) says so without reloading", async () => {
    const user = userEvent.setup();
    vi.mocked(reviewItem).mockRejectedValueOnce(new ApiClientError(409, "item_changed", "Changed"));
    guide();
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This item was edited after tailoring.");
    expect(getTailored).toHaveBeenCalledTimes(1);
  });

  it("Stop leaves", async () => {
    const user = userEvent.setup();
    const { onClose } = guide();
    await user.click(await screen.findByRole("button", { name: "Stop" }));
    expect(onClose).toHaveBeenCalled();
  });
});

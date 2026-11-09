import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type JobExtraction, type TailoredCv } from "@resumora/shared";

const files = vi.hoisted(() => ({ exportFile: vi.fn() }));
vi.mock("./export-files.ts", async (actual) => ({ ...(await actual<typeof import("./export-files.ts")>()), exportFile: files.exportFile }));

import { ExportMenu } from "./ExportMenu.tsx";
import { unreviewedItems } from "./export-files.ts";

const job = { title: "Senior Backend Engineer", company: "Bolt" } as JobExtraction;
const cv: TailoredCv = {
  id: "tc-1", userId: "user-a", jobId: "job-1", language: "en", translatedFrom: null,
  content: { ...emptyCv("en"), basics: { ...emptyCv("en").basics, fullName: "Ana Popescu" } },
  baseSnapshot: emptyCv("en"), baseSnapshotAt: "2026-11-08T09:00:00Z", template: "classic", tone: "neutral", instruction: null,
  review: {
    summary: { summary: { kept: true, inferred: false, reviewed: false, text: "Tailored summary." } },
    experience: {
      b1: { kept: true, inferred: true, reviewed: false, text: "Led a team of 6 engineers" },
      b2: { kept: true, inferred: true, reviewed: true, text: "Reviewed already" },
      b3: { kept: false, inferred: true, reviewed: false, text: "Removed item" },
    },
    skills: { "new-skill:Kafka": { kept: true, inferred: true, reviewed: false, text: "Kafka" } },
  },
  score: null, coverLetter: null, version: 3, createdAt: "2026-11-08T09:00:00Z", updatedAt: "2026-11-08T09:30:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  files.exportFile.mockResolvedValue(undefined);
});

describe("ExportMenu", () => {
  it("lists only kept inferred items nobody reviewed", () => {
    expect(unreviewedItems(cv.review)).toEqual(["Led a team of 6 engineers", "Kafka"]);
    expect(unreviewedItems(null)).toEqual([]);
  });

  it("warns about 2 AI guesses not checked yet and still exports the PDF", async () => {
    const load = vi.fn(async () => cv);
    render(<ExportMenu load={load} job={job} template="modern" />);
    await userEvent.click(screen.getByRole("button", { name: "Export ▾" }));
    const warning = await screen.findByRole("note");
    expect(warning).toHaveTextContent("2 AI guesses not checked yet");
    expect(warning).toHaveTextContent("Or export anyway:");
    await userEvent.click(screen.getByRole("button", { name: "CV as PDF" }));
    await waitFor(() => expect(files.exportFile).toHaveBeenCalledWith("cv", "pdf", { cv, job, template: "modern" }));
    await userEvent.click(screen.getByRole("button", { name: "CV as Word" }));
    await waitFor(() => expect(files.exportFile).toHaveBeenCalledWith("cv", "docx", { cv, job, template: "modern" }));
  });

  it("disables the letter until one is written and shows a failed export", async () => {
    files.exportFile.mockRejectedValue(new Error("boom"));
    render(<ExportMenu load={async () => cv} job={job} template="classic" />);
    await userEvent.click(screen.getByRole("button", { name: "Export ▾" }));
    expect(await screen.findByRole("button", { name: "Cover letter as PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cover letter as Word" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "CV as PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't export");
  });
});

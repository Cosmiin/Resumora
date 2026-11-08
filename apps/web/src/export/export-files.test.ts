import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type JobExtraction, type TailoredCv } from "@resumora/shared";

const pdf = vi.hoisted(() => ({ buildCvPdf: vi.fn(), buildLetterPdf: vi.fn() }));
vi.mock("./pdf.tsx", () => pdf);
const download = vi.hoisted(() => vi.fn());
vi.mock("../lib/supabase.ts", () => ({ supabase: { storage: { from: () => ({ download }) } } }));

import { exportFile } from "./export-files.ts";

const job = { title: "Senior Backend Engineer", company: "Bolt" } as JobExtraction;
const content = { ...emptyCv("ro"), basics: { ...emptyCv("ro").basics, fullName: "Ștefan Ionescu", email: "s@example.test", phone: "", location: "Cluj" } };
const cv = {
  id: "tc-1", language: "ro", content, template: "classic",
  coverLetter: { body: "First paragraph.\n\nSecond\nparagraph.\n\n\n", hiringManager: "  ", whyCompany: "" },
} as unknown as TailoredCv;
let clicked: { href: string; download: string }[];

beforeEach(() => {
  vi.resetAllMocks();
  clicked = [];
  pdf.buildCvPdf.mockResolvedValue(new Blob(["cv"]));
  pdf.buildLetterPdf.mockResolvedValue(new Blob(["letter"]));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("exportFile", () => {
  it("downloads the CV PDF under the export file name, with no photo when the CV has none", async () => {
    await exportFile("cv", "pdf", { cv, job, template: "modern" });
    expect(pdf.buildCvPdf).toHaveBeenCalledWith(content, "modern", undefined);
    expect(clicked).toEqual([{ href: "blob:file", download: "Stefan_Ionescu_Bolt_Senior_Backend_Engineer.pdf" }]);
    expect(download).not.toHaveBeenCalled();
  });

  it("passes the photo's bytes when the template shows it, and skips it when the template doesn't", async () => {
    const withPhoto = { ...cv, content: { ...content, basics: { ...content.basics, photo: { path: "user-a/p.png", x: 50, y: 50, zoom: 1 } } } };
    download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), error: null });
    await exportFile("cv", "pdf", { cv: withPhoto, job, template: "classic" });
    expect(pdf.buildCvPdf.mock.lastCall![2]).toEqual({ data: new Uint8Array([1, 2, 3]), type: "png" });
    await exportFile("cv", "pdf", { cv: withPhoto, job, template: "compact" });
    expect(pdf.buildCvPdf.mock.lastCall![2]).toBeUndefined();
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("still exports the CV when the photo can't be read", async () => {
    const withPhoto = { ...cv, content: { ...content, basics: { ...content.basics, photo: { path: "user-a/p.png", x: 50, y: 50, zoom: 1 } } } };
    download.mockResolvedValue({ data: null, error: new Error("gone") });
    await exportFile("cv", "pdf", { cv: withPhoto, job, template: "classic" });
    expect(pdf.buildCvPdf.mock.lastCall![2]).toBeUndefined();
    expect(clicked).toHaveLength(1);
  });

  it("builds the letter with the page's words in its language and one paragraph per blank-line block", async () => {
    const date = new Date("2026-11-08T12:00:00Z");
    await exportFile("letter", "pdf", { cv, job, template: "classic", date });
    expect(pdf.buildLetterPdf).toHaveBeenCalledWith(
      { greeting: "Stimată echipă de recrutare,", paragraphs: ["First paragraph.", "Second\nparagraph."], signOff: "Cu stimă," },
      { name: "Ștefan Ionescu", contact: ["s@example.test", "Cluj"], company: "Bolt", role: "Senior Backend Engineer", date },
      "ro",
    );
    expect(clicked[0]!.download).toBe("Stefan_Ionescu_Bolt_Senior_Backend_Engineer_Cover_letter.pdf");
  });

  it("refuses a letter export when there is no letter", async () => {
    await expect(exportFile("letter", "pdf", { cv: { ...cv, coverLetter: null }, job, template: "classic" })).rejects.toThrow();
    expect(clicked).toEqual([]);
  });
});

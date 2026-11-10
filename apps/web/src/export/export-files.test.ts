import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv, type JobExtraction, type TailoredCv } from "@resumora/shared";

const pdf = vi.hoisted(() => ({ fitCvPdf: vi.fn(), buildLetterPdf: vi.fn() }));
vi.mock("./pdf.tsx", () => pdf);
const docx = vi.hoisted(() => ({ buildCvDocx: vi.fn(), buildLetterDocx: vi.fn() }));
vi.mock("./docx.ts", () => docx);
const download = vi.hoisted(() => vi.fn());
vi.mock("../lib/supabase.ts", () => ({ supabase: { storage: { from: () => ({ download }) } } }));

import { exportFile } from "./export-files.ts";

const job = { title: "Senior Backend Engineer", company: "Bolt" } as JobExtraction;
const content = { ...emptyCv("ro"), basics: { ...emptyCv("ro").basics, fullName: "Ștefan Ionescu", email: "s@example.test", phone: "", location: "Cluj" } };
const cv = {
  id: "tc-1", language: "ro", content, template: "classic",
  coverLetter: { body: "First paragraph.\n\nSecond\nparagraph.\n\n\n", hiringManager: "  ", whyCompany: "" },
} as unknown as TailoredCv;
const image = { width: 200, height: 100, close: vi.fn() };
const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
const jpegBytes = new Uint8Array([255, 216, 255, 217]);
let clicked: { href: string; download: string }[];

beforeEach(() => {
  vi.resetAllMocks();
  clicked = [];
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(image));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback, type) {
    expect([this.width, this.height]).toEqual([50, 50]);
    callback(new Blob([jpegBytes], { type }));
  });
  pdf.fitCvPdf.mockResolvedValue({ blob: new Blob(["cv"]), step: { tight: false, fontSize: 11 }, pages: 1, fits: true });
  pdf.buildLetterPdf.mockResolvedValue(new Blob(["letter"]));
  docx.buildCvDocx.mockResolvedValue(new Blob(["cv"]));
  docx.buildLetterDocx.mockResolvedValue(new Blob(["letter"]));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("exportFile", () => {
  it("downloads the CV PDF under the export file name, with no photo when the CV has none", async () => {
    await expect(exportFile("cv", "pdf", { cv, job, template: "modern" })).resolves.toEqual({ pages: 1, fits: true });
    expect(pdf.fitCvPdf).toHaveBeenCalledWith(content, "modern", undefined);
    expect(clicked).toEqual([{ href: "blob:file", download: "Stefan_Ionescu_Bolt_Senior_Backend_Engineer.pdf" }]);
    expect(download).not.toHaveBeenCalled();
  });

  it.each(["pdf", "docx"] as const)("downloads photos only for templates with a slot for %s", async (format) => {
    const withPhoto = { ...cv, content: { ...content, basics: { ...content.basics, photo: { path: "user-a/p.png", x: 50, y: 50, zoom: 2 } } } };
    download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), error: null });
    for (const template of ["classic", "modern"] as const) {
      await exportFile("cv", format, { cv: withPhoto, job, template });
      expect(pdf.fitCvPdf.mock.lastCall![2]).toEqual({ data: jpegBytes, type: "jpeg" });
      if (format === "docx") expect(docx.buildCvDocx.mock.lastCall![2]).toEqual(pdf.fitCvPdf.mock.lastCall![2]);
    }
    expect(download).toHaveBeenCalledWith("user-a/p.png");
    await exportFile("cv", format, { cv: withPhoto, job, template: "compact" });
    expect(pdf.fitCvPdf.mock.lastCall![2]).toBeUndefined();
    if (format === "docx") expect(docx.buildCvDocx.mock.lastCall![2]).toBeUndefined();
    expect(download).toHaveBeenCalledTimes(2);
  });

  it.each(["image/jpeg", "image/png", "image/webp"])("crops %s to JPEG for PDF and Word", async (type) => {
    const withPhoto = { ...cv, content: { ...content, basics: { ...content.basics, photo: { path: "user-a/photo", x: 25, y: 75, zoom: 2 } } } };
    const source = new Blob([new Uint8Array([1, 2, 3])], { type });
    download.mockResolvedValue({ data: source, error: null });
    for (const format of ["pdf", "docx"] as const) {
      await exportFile("cv", format, { cv: withPhoto, job, template: "classic" });
      expect(pdf.fitCvPdf.mock.lastCall![2]).toEqual({ data: jpegBytes, type: "jpeg" });
      if (format === "docx") expect(docx.buildCvDocx.mock.lastCall![2]).toEqual({ data: jpegBytes, type: "jpeg" });
    }
    expect(createImageBitmap).toHaveBeenCalledWith(source);
    expect(context.drawImage).toHaveBeenCalledWith(image, 37.5, 37.5, 50, 50, 0, 0, 50, 50);
    expect(context.fillStyle).toBe("#fff");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 50, 50);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.9);
    expect(image.close).toHaveBeenCalledTimes(2);
  });

  it.each(["decode", "canvas", "encode", "encode throws"])("still downloads PDF and Word after %s failure", async (failure) => {
    const withPhoto = { ...cv, content: { ...content, basics: { ...content.basics, photo: { path: "user-a/p.webp", x: 50, y: 50, zoom: 2 } } } };
    download.mockResolvedValue({ data: new Blob(["broken"], { type: "image/webp" }), error: null });
    if (failure === "decode") vi.mocked(createImageBitmap).mockRejectedValue(new Error("unreadable"));
    if (failure === "canvas") vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    if (failure === "encode") vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(null));
    if (failure === "encode throws") vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(() => { throw new Error("encode failed"); });
    for (const format of ["pdf", "docx"] as const) {
      await expect(exportFile("cv", format, { cv: withPhoto, job, template: "classic" })).resolves.toEqual({ pages: 1, fits: true });
      expect(pdf.fitCvPdf.mock.lastCall![2]).toBeUndefined();
      if (format === "docx") expect(docx.buildCvDocx.mock.lastCall![2]).toBeUndefined();
    }
    expect(clicked).toHaveLength(2);
    if (failure !== "decode") expect(image.close).toHaveBeenCalledTimes(2);
  });

  it("still exports the CV when the photo can't be read", async () => {
    const withPhoto = { ...cv, content: { ...content, basics: { ...content.basics, photo: { path: "user-a/p.png", x: 50, y: 50, zoom: 2 } } } };
    download.mockResolvedValue({ data: null, error: new Error("gone") });
    await exportFile("cv", "pdf", { cv: withPhoto, job, template: "classic" });
    expect(pdf.fitCvPdf.mock.lastCall![2]).toBeUndefined();
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

  it("downloads Word files from the docx builders with the same inputs", async () => {
    const date = new Date("2026-11-08T12:00:00Z");
    const step = { tight: true, fontSize: 9.5 };
    pdf.fitCvPdf.mockResolvedValue({ blob: new Blob(["measured"]), step, pages: 3, fits: false });
    await expect(exportFile("cv", "docx", { cv, job, template: "compact" })).resolves.toEqual({ pages: 3, fits: false });
    expect(pdf.fitCvPdf).toHaveBeenCalledWith(content, "compact", undefined);
    expect(docx.buildCvDocx).toHaveBeenCalledWith(content, "compact", undefined, step);
    await exportFile("letter", "docx", { cv, job, template: "classic", date });
    expect(docx.buildLetterDocx.mock.lastCall![0].paragraphs).toEqual(["First paragraph.", "Second\nparagraph."]);
    expect(docx.buildLetterDocx.mock.lastCall![2]).toBe("ro");
    expect(clicked.map((c) => c.download)).toEqual([
      "Stefan_Ionescu_Bolt_Senior_Backend_Engineer.docx", "Stefan_Ionescu_Bolt_Senior_Backend_Engineer_Cover_letter.docx",
    ]);
  });

  it("refuses a letter export when there is no letter", async () => {
    await expect(exportFile("letter", "pdf", { cv: { ...cv, coverLetter: null }, job, template: "classic" })).rejects.toThrow();
    expect(clicked).toEqual([]);
  });
});

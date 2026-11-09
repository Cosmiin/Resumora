import type { JobExtraction, TailoredCv } from "@resumora/shared";
import { getTemplate, type TemplateId } from "../cv/page/templates.ts";
import { supabase } from "../lib/supabase.ts";
import { letterWords } from "../tailor/LetterPage.tsx";
import type { ExportPhoto, LetterDocxInput, LetterHeader } from "./docx.ts";
import { exportFileName } from "./file-name.ts";

export type ExportKind = "cv" | "letter";
export type ExportFormat = "pdf" | "docx";
export type ExportInput = { cv: TailoredCv; job: JobExtraction | null; template: TemplateId; date?: Date };
/** How long the exported CV is after fitting; `fits` is false when even the smallest text left it over 2 pages. */
export type ExportResult = { pages: number; fits: boolean };

type ItemReview = { kept?: boolean; inferred?: boolean; reviewed?: boolean; text?: string };

/** Texts of the kept inferred items nobody has reviewed yet (the export warns about them). */
export function unreviewedItems(review: TailoredCv["review"]): string[] {
  const items: string[] = [];
  for (const section of Object.values(review ?? {})) {
    if (!section || typeof section !== "object") continue;
    for (const item of Object.values(section as Record<string, ItemReview>)) {
      if (item?.kept && item.inferred && !item.reviewed) items.push(item.text ?? "");
    }
  }
  return items;
}

const PHOTO_TYPES: Record<string, ExportPhoto["type"]> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };

/** The photo's bytes for a template that shows it; a photo that can't be read is left out, never blocks the export. */
async function photoFor(input: ExportInput): Promise<ExportPhoto | undefined> {
  const photo = input.cv.content.basics.photo;
  if (!photo || !getTemplate(input.template).showsPhoto) return undefined;
  try {
    const { data, error } = await supabase.storage.from("cv-photos").download(photo.path);
    const type = data ? PHOTO_TYPES[data.type] : undefined;
    if (error || !data || !type) return undefined;
    return { data: new Uint8Array(await data.arrayBuffer()), type };
  } catch {
    return undefined;
  }
}

/** The letter's words exactly as the letter page shows them: greeting and sign-off in the letter's language. */
function letterParts(input: ExportInput): { letter: LetterDocxInput; header: LetterHeader } {
  const { cv, job } = input;
  if (!cv.coverLetter) throw new Error("This CV has no cover letter yet.");
  const basics = cv.content.basics;
  const date = input.date ?? new Date();
  const role = job?.title ?? "";
  const company = job?.company ?? "";
  const words = letterWords(cv.language, { role, company, hiringManager: cv.coverLetter.hiringManager, date });
  const paragraphs = cv.coverLetter.body.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const contact = [basics.email, basics.phone, basics.location, basics.website, basics.linkedin].filter((part) => part?.trim());
  return {
    letter: { greeting: words.greeting, paragraphs, signOff: words.signOff },
    header: { name: basics.fullName, contact, company, role, date },
  };
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Builds the file in the browser and downloads it. The builders load on first use (they're large).
 * A CV is fitted to 2 pages through the PDF; the Word file reuses the step the PDF needed.
 */
export async function exportFile(kind: ExportKind, format: ExportFormat, input: ExportInput): Promise<ExportResult | undefined> {
  const name = input.cv.content.basics.fullName;
  const company = input.job?.company ?? "";
  const role = input.job?.title ?? "";
  if (kind === "letter") {
    const { letter, header } = letterParts(input);
    const build = format === "pdf" ? (await import("./pdf.tsx")).buildLetterPdf : (await import("./docx.ts")).buildLetterDocx;
    save(await build(letter, header, input.cv.language), exportFileName(name, company, `${role} Cover letter`, format));
    return undefined;
  }
  const photo = await photoFor(input);
  const fitted = await (await import("./pdf.tsx")).fitCvPdf(input.cv.content, input.template, photo);
  const blob = format === "pdf"
    ? fitted.blob
    : await (await import("./docx.ts")).buildCvDocx(input.cv.content, input.template, photo, fitted.step);
  save(blob, exportFileName(name, company, role, format));
  return { pages: fitted.pages, fits: fitted.fits };
}

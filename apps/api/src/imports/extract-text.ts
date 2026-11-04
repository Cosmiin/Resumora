import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export type FileFormat = "pdf" | "docx";

/** Why an import failed, with the message the user sees. */
export const IMPORT_FAILURES = {
  not_a_cv: "This doesn't look like a CV. Upload your CV as PDF or Word.",
  no_text: "We couldn't read text from this file. Scanned CVs aren't supported yet.",
  too_long: "This file has too much text for a CV.",
  unreadable_file: "We couldn't open this file. Try saving it again as PDF or Word.",
  ai_unavailable: "Our AI service is busy right now. Please try again in a few minutes.",
  internal: "Something went wrong while reading your CV. Please try again.",
} as const;
export type ImportFailureCode = keyof typeof IMPORT_FAILURES;

/** An import that can't succeed, however often it is retried. */
export class ImportFailure extends Error {
  constructor(readonly code: ImportFailureCode) {
    super(IMPORT_FAILURES[code]);
  }
}

/** Fewer non-space characters than this means there's no real text (usually a scan). */
export const MIN_TEXT_CHARS = 200;
/** More characters than this is not a CV we can process in one go. */
// In line with the extraction output budget (16k tokens), since the CV is copied out word for word.
export const MAX_TEXT_CHARS = 30_000;

/** Identifies the file by its first bytes, not its name. */
export function sniffFormat(bytes: Uint8Array): FileFormat | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (starts([0x50, 0x4b, 0x03, 0x04])) return "docx"; // PK\x03\x04 (zip)
  return null;
}

/** Tidies layout whitespace: keeps line breaks, collapses runs of spaces and blank lines. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function rawText(bytes: Uint8Array, format: FileFormat): Promise<string> {
  if (format === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  }
  // mammoth's Node build reads `buffer`; the browser build (bundled for Workers) reads `arrayBuffer`.
  const input = { buffer: Buffer.from(bytes), arrayBuffer: bytes.slice().buffer };
  const { value } = await mammoth.extractRawText(input as Parameters<typeof mammoth.extractRawText>[0]);
  return value;
}

/** The document's text, or an ImportFailure saying why there is none we can use. */
export async function extractText(bytes: Uint8Array, format: FileFormat): Promise<string> {
  let text: string;
  try {
    text = normalize(await rawText(bytes, format));
  } catch {
    throw new ImportFailure("unreadable_file");
  }
  if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    throw new ImportFailure("no_text");
  }
  if (text.length > MAX_TEXT_CHARS) {
    throw new ImportFailure("too_long");
  }
  return text;
}

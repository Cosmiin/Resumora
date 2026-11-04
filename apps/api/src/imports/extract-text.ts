import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export type FileFormat = "pdf" | "docx";

export type ImportFailureCode = "no_text" | "too_long" | "unreadable_file" | "not_a_cv" | "ai_unavailable";

/** An import that can't succeed, however often it is retried. `message` is shown to the user. */
export class ImportFailure extends Error {
  constructor(
    readonly code: ImportFailureCode,
    message: string,
  ) {
    super(message);
  }
}

/** Fewer non-space characters than this means there's no real text (usually a scan). */
export const MIN_TEXT_CHARS = 200;
/** More characters than this is not a CV we can process in one go. */
export const MAX_TEXT_CHARS = 60_000;

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
    throw new ImportFailure("unreadable_file", "We couldn't open this file. Try saving it again as PDF or Word.");
  }
  if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    throw new ImportFailure("no_text", "We couldn't read text from this file. Scanned CVs aren't supported yet.");
  }
  if (text.length > MAX_TEXT_CHARS) {
    throw new ImportFailure("too_long", "This file has too much text for a CV.");
  }
  return text;
}

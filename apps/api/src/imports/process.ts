import { AdmitSchema, ImportDraftSchema, MAX_CV_BYTES, toCvContent, type ImportResult } from "@resumora/shared";
import {
  AiInputRejectedError,
  AiOutputTooLongError,
  AiUnavailableError,
  callModel,
  type ModelDeps,
  type UserPart,
} from "../ai/call-model.ts";
import { ImportFailure, extractText, type FileFormat } from "./extract-text.ts";
import { admitPrompt, extractPrompt } from "./prompts.ts";
import { findUnsourcedLines } from "./source-check.ts";

/** The admit step only needs the start of the document. */
const ADMIT_CHARS = 8_000;
/** Copying a whole CV out word for word is slow; allow more than the default per attempt. */
const EXTRACT_TIMEOUT_MS = 150_000;
const BASE64_CHUNK = 0x8000;

const TEXT_FALLBACK_WARNING = "We read this file as plain text, so text from different columns may be mixed. Check the result.";
const SCAN_WARNING = "This file is a scan. Check every line.";

/** Base64 of the bytes in chunks (Workers have no Buffer, and one big spread overflows the stack). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

const doc = (t: string) => `<document>\n${t}\n</document>`;

/**
 * Reads an uploaded CV and organizes it: file → "is this a CV?" → extraction → valid CV content.
 * A PDF goes to the model as a file (so columns are read in order), a DOCX as text. Throws
 * ImportFailure for outcomes a retry can't change; any other error is worth retrying.
 */
export async function processImport(
  deps: { model: ModelDeps },
  input: { userId: string; bytes: Uint8Array; format: FileFormat },
): Promise<ImportResult> {
  const { text, isScan } = await extractText(input.bytes, input.format);
  const filePart: UserPart[] | null =
    input.format === "pdf" ? [{ type: "pdf", filename: "cv.pdf", base64: toBase64(input.bytes) }] : null;
  const warnings: string[] = [];

  try {
    const admit = await callModel(deps.model, {
      userId: input.userId,
      task: "cv_admit",
      schema: AdmitSchema,
      system: admitPrompt,
      user: isScan && filePart ? [{ type: "text", text: "Is this a CV?" }, ...filePart] : doc(text.slice(0, ADMIT_CHARS)),
      maxOutputTokens: 300,
    });
    if (admit.kind === "not_cv") {
      throw new ImportFailure("not_a_cv");
    }

    const extract = (user: string | UserPart[]) =>
      callModel(deps.model, {
        userId: input.userId,
        task: "cv_extract",
        schema: ImportDraftSchema,
        system: extractPrompt,
        user,
        maxOutputTokens: 16_000,
        timeoutMs: EXTRACT_TIMEOUT_MS,
      });
    let draft;
    if (filePart) {
      try {
        draft = await extract([{ type: "text", text: "Organize this CV." }, ...filePart]);
      } catch (err) {
        if (!(err instanceof AiInputRejectedError) || isScan) throw err;
        draft = await extract(doc(text));
        warnings.push(TEXT_FALLBACK_WARNING);
      }
    } else {
      draft = await extract(doc(text));
    }

    const result = toCvContent(draft);
    result.warnings.push(...warnings.filter((w) => !result.warnings.includes(w)));
    if (admit.kind === "uncertain") result.warnings.unshift("This may not be a CV. Check the result carefully.");
    if (isScan) {
      result.warnings.push(SCAN_WARNING);
      result.isScan = true;
    } else {
      result.unsourcedLines = findUnsourcedLines(result.content, text);
    }
    if (new TextEncoder().encode(JSON.stringify(result.content)).length > MAX_CV_BYTES) {
      throw new ImportFailure("too_long");
    }
    return result;
  } catch (err) {
    if (err instanceof AiOutputTooLongError) throw new ImportFailure("too_long");
    if (err instanceof AiUnavailableError || err instanceof AiInputRejectedError) {
      throw new ImportFailure("ai_unavailable");
    }
    throw err;
  }
}

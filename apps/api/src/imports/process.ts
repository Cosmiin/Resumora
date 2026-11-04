import { AdmitSchema, ImportDraftSchema, MAX_CV_BYTES, toCvContent, type ImportResult } from "@resumora/shared";
import { AiOutputTooLongError, AiUnavailableError, callModel, type ModelDeps } from "../ai/call-model.ts";
import { ImportFailure, extractText, type FileFormat } from "./extract-text.ts";
import { admitPrompt, extractPrompt } from "./prompts.ts";

/** The admit step only needs the start of the document. */
const ADMIT_CHARS = 8_000;
/** Copying a whole CV out word for word is slow; allow more than the default per attempt. */
const EXTRACT_TIMEOUT_MS = 150_000;

/**
 * Reads an uploaded CV and organizes it: text → "is this a CV?" → extraction → valid CV content.
 * Throws ImportFailure for outcomes a retry can't change; any other error is worth retrying.
 */
export async function processImport(
  deps: { model: ModelDeps },
  input: { userId: string; bytes: Uint8Array; format: FileFormat },
): Promise<ImportResult> {
  const { text } = await extractText(input.bytes, input.format);
  const doc = (t: string) => `<document>\n${t}\n</document>`;

  try {
    const admit = await callModel(deps.model, {
      userId: input.userId,
      task: "cv_admit",
      schema: AdmitSchema,
      system: admitPrompt,
      user: doc(text.slice(0, ADMIT_CHARS)),
      maxOutputTokens: 300,
    });
    if (admit.kind === "not_cv") {
      throw new ImportFailure("not_a_cv");
    }

    const draft = await callModel(deps.model, {
      userId: input.userId,
      task: "cv_extract",
      schema: ImportDraftSchema,
      system: extractPrompt,
      user: doc(text),
      maxOutputTokens: 16_000,
      timeoutMs: EXTRACT_TIMEOUT_MS,
    });
    const result = toCvContent(draft);
    if (admit.kind === "uncertain") result.warnings.unshift("This may not be a CV. Check the result carefully.");
    if (new TextEncoder().encode(JSON.stringify(result.content)).length > MAX_CV_BYTES) {
      throw new ImportFailure("too_long");
    }
    return result;
  } catch (err) {
    if (err instanceof AiOutputTooLongError) throw new ImportFailure("too_long");
    if (err instanceof AiUnavailableError) {
      throw new ImportFailure("ai_unavailable");
    }
    throw err;
  }
}

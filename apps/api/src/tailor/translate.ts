import { z } from "zod";
import {
  CoverLetterSchema, CvContentSchema, MAX_CV_BYTES, TailorLanguageSchema,
  type CoverLetter, type CvContent, type TailorLanguage,
} from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import { ApiError } from "../errors.ts";
import { checkProposal } from "./checks.ts";
import type { TailorRepo } from "./repo.ts";
import { translateSystemPrompt, translateUserMessage } from "./translate-prompts.ts";

export const TranslateBodySchema = z.object({ language: TailorLanguageSchema });
const ReplySchema = z.object({ texts: z.array(z.object({ path: z.string(), text: z.string() })) });

/**
 * Never sent for translation: ids, dates, contact details, names, employers, settings and hidden role notes.
 * A role's or school's location is translated; the header's own location (the person's city) is a contact detail
 * and never goes to the AI.
 */
const KEEP = new Set(["id", "schemaVersion", "locale", "layout", "photo", "facts", "email", "phone", "website", "linkedin",
  "url", "startDate", "endDate", "date", "company", "fullName", "firstName", "lastName", "location", "generatedAt", "hiringManager"]);

type Text = { path: string; text: string };

/** Every translatable string under `value`, keyed by its dotted path ("experience.0.bullets.1.text"). */
function collect(value: unknown, path: string, into: Text[]): void {
  if (typeof value === "string") {
    if (value.trim()) into.push({ path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((entry, i) => collect(entry, `${path}.${i}`, into));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      // A role's notes (a list) are hidden answers; education's notes (a string) are printed text.
      if ((KEEP.has(key) && !(key === "location" && path !== "cv.basics")) || (key === "notes" && Array.isArray(entry))) continue;
      collect(entry, path ? `${path}.${key}` : key, into);
    }
  }
}

function setAt(root: Record<string, unknown>, path: string, text: string): void {
  const keys = path.split(".");
  let node: unknown = root;
  for (const key of keys.slice(0, -1)) node = (node as Record<string, unknown>)[key];
  (node as Record<string, unknown>)[keys.at(-1)!] = text;
}

/**
 * Translates a tailored CV (and its cover letter) into an independent copy for the same job: creates the
 * (job, language) copy or refreshes it. The original is never written. A translated text that brings in a number
 * the source text doesn't have keeps the source text (the Task 14 number check); `flagged` counts those.
 */
export async function translateTailored(
  deps: { model: ModelDeps; tailor: TailorRepo; now(): Date },
  input: { userId: string; id: string; language: TailorLanguage },
): Promise<{ tailoredCvId: string; flagged: number } | null> {
  const doc = await deps.tailor.readTailoredCv(input.id);
  if (!doc) return null;
  if (doc.language === input.language) throw new ApiError(400, "same_language", "This CV is already in that language.");
  const target = (await deps.tailor.listTailoredCvs(doc.jobId)).find((cv) => cv.language === input.language);
  if (target && target.translatedFrom === null) {
    throw new ApiError(409, "language_taken", "This job already has its own tailored CV in that language.");
  }

  const source = { cv: doc.content, letter: doc.coverLetter };
  const texts: Text[] = [];
  collect(source, "", texts);
  let reply: z.infer<typeof ReplySchema>;
  try {
    reply = await callModel(deps.model, {
      userId: input.userId, task: "tailor_translate", tier: "strong", schema: ReplySchema,
      system: translateSystemPrompt, user: translateUserMessage(input.language, texts), maxOutputTokens: 16000,
    });
  } catch {
    throw new ApiError(502, "ai_failed", "Couldn't translate this CV. Try again.");
  }

  const result = structuredClone(source) as unknown as Record<string, unknown>;
  const original = new Map(texts.map((item) => [item.path, item.text]));
  let flagged = 0;
  for (const { path, text } of reply.texts) {
    const before = original.get(path);
    if (before === undefined || !text.trim()) continue;
    const flags = checkProposal({ itemId: path, field: "text", text, inferred: true, flags: [] }, { sources: [before] });
    if (flags.length > 0) { flagged++; continue; }
    setAt(result, path, text);
  }
  const content = CvContentSchema.safeParse({ ...(result.cv as CvContent), locale: input.language });
  const letter = CoverLetterSchema.nullable().safeParse(result.letter as CoverLetter | null);
  if (!content.success || !letter.success || new TextEncoder().encode(JSON.stringify(content.data)).length > MAX_CV_BYTES) {
    throw new ApiError(502, "ai_failed", "Couldn't translate this CV. Try again.");
  }

  const tailoredCvId = await deps.tailor.saveTranslation({
    jobId: doc.jobId, language: input.language, translatedFrom: doc.id, content: content.data, coverLetter: letter.data,
    template: doc.template, tone: doc.tone, instruction: doc.instruction, at: deps.now().toISOString(),
  });
  if (tailoredCvId === "language_taken") {
    throw new ApiError(409, "language_taken", "This job already has its own tailored CV in that language.");
  }
  return { tailoredCvId, flagged };
}

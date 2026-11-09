import { z } from "zod";
import {
  CoverLetterSchema, FlagSchema, SaveResponseSchema, TailoredCvSchema, TailorLanguageSchema, TailorRunSchema,
  type CoverLetter, type CvContent, type SaveResponse, type TailoredCv, type TailorLanguage, type TailorRun, type TailorSection,
} from "@resumora/shared";
import { apiFetch } from "../lib/api.ts";
import type { TemplateId } from "../cv/page/templates.ts";

const tailored = (id: string) => `/v1/tailored/${encodeURIComponent(id)}`;
const SummarySchema = z.object({ id: z.string(), language: TailorLanguageSchema, translatedFrom: z.string().nullable(), updatedAt: z.string() });
export type TailoredSummary = z.infer<typeof SummarySchema>;

/** The job's tailored CVs, one per language. */
export async function listTailored(jobId: string): Promise<TailoredSummary[]> {
  const body = await apiFetch(`/v1/jobs/${encodeURIComponent(jobId)}/tailored`, { schema: z.object({ items: z.array(SummarySchema) }) });
  return body.items;
}

export function getTailored(id: string): Promise<TailoredCv> {
  return apiFetch(tailored(id), { schema: TailoredCvSchema });
}

/** Same version check and 409 shape as the Base CV save. */
export function saveTailored(id: string, content: CvContent, version: number): Promise<SaveResponse> {
  return apiFetch(tailored(id), { method: "PUT", json: { content, expectedVersion: version }, schema: SaveResponseSchema });
}

/** A run over only the picked sections; the tailoring flow continues it. */
export function retailor(id: string, sections: TailorSection[]): Promise<{ run: TailorRun }> {
  return apiFetch(`${tailored(id)}/retailor`, { method: "POST", json: { sections }, schema: z.object({ run: TailorRunSchema }) });
}

/** Creates or refreshes the job's copy in `language`; `flagged` counts texts kept in the source wording. */
export function translate(id: string, language: TailorLanguage): Promise<{ tailoredCvId: string; flagged: number }> {
  return apiFetch(`${tailored(id)}/translate`, {
    method: "POST", json: { language }, schema: z.object({ tailoredCvId: z.string(), flagged: z.number() }),
  });
}

const LetterSchema = CoverLetterSchema;
const FlagsSchema = z.array(FlagSchema);
export type LetterFlags = z.infer<typeof FlagsSchema>;

/** Writes (or rewrites) the cover letter; `flags` are the checks the body still fails. */
export function writeLetter(id: string, input: { whyCompany: string; hiringManager: string }): Promise<{ coverLetter: CoverLetter; flags: LetterFlags }> {
  return apiFetch(`${tailored(id)}/cover-letter`, {
    method: "POST", json: input, schema: z.object({ coverLetter: LetterSchema, flags: FlagsSchema }),
  });
}

/** Saves the person's edits to the letter (not versioned: the last save wins). */
export function saveLetter(id: string, edit: { body: string; hiringManager: string; whyCompany: string }): Promise<{ coverLetter: CoverLetter }> {
  return apiFetch(`${tailored(id)}/cover-letter`, { method: "PUT", json: edit, schema: z.object({ coverLetter: LetterSchema }) });
}

/** Saves the picked template (not versioned: an open editor keeps its version). */
export function setTemplate(id: string, template: TemplateId): Promise<{ template: TemplateId }> {
  return apiFetch(tailored(id), { method: "PATCH", json: { template }, schema: z.object({ template: TailoredCvSchema.shape.template }) });
}

import { z } from "zod";
import {
  SaveResponseSchema, TailoredCvSchema, TailorLanguageSchema,
  type CvContent, type SaveResponse, type TailoredCv,
} from "@resumora/shared";
import { apiFetch } from "../lib/api.ts";

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

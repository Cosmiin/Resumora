import { z } from "zod";
import {
  CvContentSchema,
  CvResponseSchema,
  HistoryItemSchema,
  SaveResponseSchema,
  type CvContent,
  type CvResponse,
  type HistoryItem,
  type SaveResponse,
} from "@resumora/shared";
import { apiFetch } from "../lib/api.ts";

export function getCv(): Promise<CvResponse> {
  return apiFetch("/v1/cv", { schema: CvResponseSchema });
}

const HistoryListSchema = z.object({ items: z.array(HistoryItemSchema) });
const HistoryDetailSchema = z.object({ content: CvContentSchema, createdAt: z.string() });

export async function listHistory(): Promise<HistoryItem[]> {
  return (await apiFetch("/v1/cv/history", { schema: HistoryListSchema })).items;
}

export function getHistoryItem(id: string): Promise<{ content: CvContent; createdAt: string }> {
  return apiFetch(`/v1/cv/history/${encodeURIComponent(id)}`, { schema: HistoryDetailSchema });
}

export function restoreHistory(id: string, version: number): Promise<SaveResponse> {
  return apiFetch(`/v1/cv/history/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    json: { version },
    schema: SaveResponseSchema,
  });
}

/** Removes the CV with its History and role scores; answers with the empty CV now stored. */
export function removeCv(version: number): Promise<CvResponse> {
  return apiFetch("/v1/cv", { method: "DELETE", json: { version }, schema: CvResponseSchema });
}

export function saveCv(content: CvContent, version: number): Promise<SaveResponse> {
  return apiFetch("/v1/cv", { method: "PUT", json: { content, version }, schema: SaveResponseSchema });
}

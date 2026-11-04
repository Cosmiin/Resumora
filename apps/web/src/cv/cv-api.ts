import {
  CvResponseSchema,
  SaveResponseSchema,
  type CvContent,
  type CvResponse,
  type SaveResponse,
} from "@resumora/shared";
import { apiFetch } from "../lib/api.ts";

export function getCv(): Promise<CvResponse> {
  return apiFetch("/v1/cv", { schema: CvResponseSchema });
}

export function saveCv(content: CvContent, version: number): Promise<SaveResponse> {
  return apiFetch("/v1/cv", { method: "PUT", json: { content, version }, schema: SaveResponseSchema });
}

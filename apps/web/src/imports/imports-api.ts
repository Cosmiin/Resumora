import { ImportResponseSchema, SaveResponseSchema, type ImportResponse, type SaveResponse } from "@resumora/shared";
import { apiFetch } from "../lib/api.ts";

export function startImport(file: File): Promise<ImportResponse> {
  const form = new FormData();
  form.set("file", file);
  return apiFetch("/v1/imports", { method: "POST", form, schema: ImportResponseSchema });
}

export function getImport(id: string): Promise<ImportResponse> {
  return apiFetch(`/v1/imports/${encodeURIComponent(id)}`, { schema: ImportResponseSchema });
}

export function applyImport(id: string, version: number): Promise<SaveResponse> {
  return apiFetch(`/v1/imports/${encodeURIComponent(id)}/apply`, { method: "POST", json: { version }, schema: SaveResponseSchema });
}

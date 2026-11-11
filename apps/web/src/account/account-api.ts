import { PreferencesSchema, type Preferences, type PreferencesPatch } from "@resumora/shared";
import { ApiClientError, apiFetch, authedFetch, errorOf } from "../lib/api.ts";

export const PREFERENCES_KEY = ["account", "preferences"] as const;

export function getPreferences(): Promise<Preferences> {
  return apiFetch("/v1/account/preferences", { schema: PreferencesSchema });
}

export function savePreferences(patch: PreferencesPatch): Promise<Preferences> {
  return apiFetch("/v1/account/preferences", { method: "PATCH", json: patch, schema: PreferencesSchema });
}

async function failure(res: Response): Promise<ApiClientError> {
  const body: unknown = await res.json().catch(() => null);
  const { code, message } = errorOf(res.status, body);
  return new ApiClientError(res.status, code, message, body);
}

/** Everything stored about the signed-in user, as one JSON file, with the file name the server chose. */
export async function exportAccount(): Promise<{ file: Blob; fileName: string }> {
  const res = await authedFetch("/v1/account/export", {});
  if (!res.ok) throw await failure(res);
  const fileName = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "resumora-data.json";
  return { file: await res.blob(), fileName };
}

/** Deletes the signed-in user's account and everything in it. */
export async function deleteAccount(): Promise<void> {
  const res = await authedFetch("/v1/account", { method: "DELETE" });
  if (!res.ok) throw await failure(res);
}

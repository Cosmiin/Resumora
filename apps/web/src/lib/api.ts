import type { z } from "zod";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { ErrorBodySchema } from "@resumora/shared";
import { getLanguage } from "../i18n/language.ts";
import { supabase } from "./supabase.ts";
import { ApiClientError } from "./api-error.ts";

export { ApiClientError };

/** `json` is sent as JSON; `form` as multipart (the browser sets the content type and boundary). */
type ApiInit = Omit<RequestInit, "body"> & { schema: z.ZodType<unknown>; json?: unknown; form?: FormData };

async function send(path: string, init: Omit<ApiInit, "schema">, token: string | undefined): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  // Questions come back in the language the person uses the app in.
  headers.set("x-interface-language", getLanguage());
  try {
    return await fetch(path, {
      ...init,
      headers,
      body: init.form ?? (init.json === undefined ? undefined : JSON.stringify(init.json)),
    });
  } catch {
    throw new ApiClientError(0, "network", "Can't reach Resumora.");
  }
}

/**
 * Sends a request as the signed-in user and returns the raw response.
 * An expired token is refreshed once; a second 401 signs the user out. If the refresh
 * itself can't reach Supabase, the user stays signed in and gets a network error.
 */
export async function authedFetch(path: string, init: Omit<ApiInit, "schema">): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  let res = await send(path, init, data.session?.access_token);

  if (res.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error && isAuthRetryableFetchError(refreshed.error)) {
      throw new ApiClientError(0, "network", "Can't reach Resumora.");
    }
    const token = refreshed.data.session?.access_token;
    if (token) res = await send(path, init, token);
    if (res.status === 401) await supabase.auth.signOut();
  }
  return res;
}

/** The server's error code and message from a failed response's body, or generic ones. */
export function errorOf(status: number, body: unknown): { code: string; message: string } {
  const parsed = ErrorBodySchema.safeParse(body);
  if (parsed.success) return { code: parsed.data.error.code, message: parsed.data.error.message };
  return { code: `http_${status}`, message: `Request failed (${status}).` };
}

/** Calls the Resumora API as the signed-in user (see `authedFetch`) and validates the response. */
export async function apiFetch<S extends z.ZodType<unknown>>(
  path: string,
  init: Omit<ApiInit, "schema"> & { schema: S },
): Promise<z.infer<S>> {
  const res = await authedFetch(path, init);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const { code, message } = errorOf(res.status, body);
    throw new ApiClientError(res.status, code, message, body);
  }
  return init.schema.parse(body);
}

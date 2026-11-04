import type { z } from "zod";
import { ErrorBodySchema } from "@resumora/shared";
import { supabase } from "./supabase.ts";
import { ApiClientError } from "./api-error.ts";

export { ApiClientError };

type ApiInit = Omit<RequestInit, "body"> & { schema: z.ZodType<unknown>; json?: unknown };

async function send(path: string, init: ApiInit, token: string | undefined): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  try {
    return await fetch(path, {
      ...init,
      headers,
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
  } catch {
    throw new ApiClientError(0, "network", "Can't reach Resumora.");
  }
}

/**
 * Calls the Resumora API as the signed-in user and validates the response.
 * An expired token is refreshed once; a second 401 signs the user out.
 */
export async function apiFetch<S extends z.ZodType<unknown>>(
  path: string,
  init: Omit<ApiInit, "schema"> & { schema: S },
): Promise<z.infer<S>> {
  const { data } = await supabase.auth.getSession();
  let res = await send(path, init, data.session?.access_token);

  if (res.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    const token = refreshed.data.session?.access_token;
    if (token) res = await send(path, init, token);
    if (res.status === 401) await supabase.auth.signOut();
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ErrorBodySchema.safeParse(body);
    const code = parsed.success ? parsed.data.error.code : `http_${res.status}`;
    const message = parsed.success ? parsed.data.error.message : `Request failed (${res.status}).`;
    throw new ApiClientError(res.status, code, message, body);
  }
  return init.schema.parse(body);
}

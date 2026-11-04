import { createClient, isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import type { AppDeps } from "./app.ts";
import type { SupabaseEnv } from "./env.ts";

/**
 * Verifies a Supabase access token.
 * - Invalid / expired token → null (the API answers 401).
 * - Supabase unreachable or failing (network error, 5xx) → throws, so the API answers a
 *   logged 500 and the browser keeps the user signed in instead of logging everyone out.
 */
export function supabaseVerifier(env: SupabaseEnv): AppDeps["verifyToken"] {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (token) => {
    const { data, error } = await client.auth.getClaims(token);
    if (error && isOutage(error)) throw new Error(`Supabase auth unavailable: ${error.message}`);
    const sub = data?.claims?.sub;
    if (error || typeof sub !== "string") return null;
    return { id: sub, token };
  };
}

function isOutage(error: AuthError): boolean {
  return isAuthRetryableFetchError(error) || (typeof error.status === "number" && error.status >= 500);
}

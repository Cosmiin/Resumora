import { createClient } from "@supabase/supabase-js";
import type { AppDeps } from "./app.ts";
import type { Env } from "./env.ts";

/**
 * Verifies a Supabase access token. An invalid/expired token → null (401).
 * Network or unexpected failures are thrown, so they surface as a logged 500
 * instead of silently signing the user out.
 */
export function supabaseVerifier(env: Env): AppDeps["verifyToken"] {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (token) => {
    const { data, error } = await client.auth.getClaims(token);
    const sub = data?.claims?.sub;
    if (error || typeof sub !== "string") return null;
    return { id: sub, token };
  };
}

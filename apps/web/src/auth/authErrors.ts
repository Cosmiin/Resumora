import type { MessageKey } from "../i18n/en.ts";

/** Maps a Supabase Auth error message to readable copy. */
export function authErrorKey(message: string): MessageKey {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) return "authError.emailTaken";
  if (m.includes("invalid login credentials")) return "authError.wrongCredentials";
  if (m.includes("email not confirmed")) return "authError.emailNotConfirmed";
  if (m.includes("password") && (m.includes("at least") || m.includes("weak"))) return "authError.weakPassword";
  if (m.includes("rate limit") || m.includes("too many")) return "authError.rateLimited";
  return "authError.generic";
}

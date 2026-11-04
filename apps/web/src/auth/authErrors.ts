import type { MessageKey } from "../i18n/en.ts";

/** Maps a Supabase Auth error message to readable copy. */
export function authErrorKey(message: string): MessageKey {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "auth.wrongCredentials";
  if (m.includes("email not confirmed")) return "auth.emailNotConfirmed";
  if (m.includes("password") && (m.includes("at least") || m.includes("weak"))) return "auth.weakPassword";
  if (m.includes("rate limit") || m.includes("too many")) return "auth.rateLimited";
  return "auth.genericError";
}

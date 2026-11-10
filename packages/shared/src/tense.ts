import type { Locale } from "./cv.ts";

const PAST_VERBS = new Set([
  "led", "built", "ran", "made", "won", "grew", "drove", "set", "wrote", "took", "began", "brought",
  "bought", "sold", "taught", "kept", "held", "met", "oversaw", "spent", "sent", "cut", "put", "found",
  "gave", "saw", "chose", "became", "went", "got", "left", "lost", "paid", "read", "rebuilt", "rewrote",
  "undertook", "withdrew", "understood", "thought", "told", "sought", "spoke", "stood", "fought", "flew",
  "hired", "shaped", "split", "spread", "shut", "quit", "let", "hit", "bid", "upset",
  "forecast", "broadcast", "outran", "overran", "rerun",
]);

/** English bullet openings that do not use a recognised past-tense verb. */
export function startsInPresentTense(text: string, locale: Locale): boolean {
  if (locale !== "en") return false;
  const first = text.match(/[a-z][a-z-]*/i)?.[0].toLowerCase();
  return !!first && !first.endsWith("ed") && !PAST_VERBS.has(first);
}

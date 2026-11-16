import type { Locale } from "./cv.ts";

const PAST_VERBS = new Set([
  "led", "built", "ran", "made", "won", "grew", "drove", "set", "wrote", "took", "began", "brought",
  "bought", "sold", "taught", "kept", "held", "met", "oversaw", "spent", "sent", "cut", "put", "found",
  "gave", "saw", "chose", "became", "went", "got", "left", "lost", "paid", "read", "rebuilt", "rewrote",
  "undertook", "withdrew", "understood", "thought", "told", "sought", "spoke", "stood", "fought", "flew",
  "hired", "shaped", "split", "spread", "shut", "quit", "let", "hit", "bid", "upset",
  "forecast", "broadcast", "outran", "overran", "rerun",
]);

/**
 * Romanian present-tense endings, first person ("coordonez", "pregătesc") and third person ("coordonează",
 * "pregătește"). Nouns and adjectives that open a CV line almost never end this way; "Am coordonat…" and
 * "Coordonarea…" don't.
 */
const RO_PRESENT_ENDINGS = /(ez|esc|ăsc|ează|ește|ăște)$/;

/**
 * Common Romanian present-tense verbs a CV line opens with that the endings above miss ("verific", "conduc").
 * First person singular, lower case, with diacritics.
 */
const RO_PRESENT_VERBS = new Set<string>([
  "verific", "conduc", "asigur", "ofer", "planific", "dezvolt", "susțin", "mențin", "obțin", "răspund",
  "particip", "contribui", "vând", "cumpăr", "fac", "scriu", "comunic", "identific", "aplic", "explic",
  "rezolv", "reduc", "extind", "introduc", "produc", "traduc", "propun", "prezint", "reprezint", "transmit",
  "aprob", "ajut", "conving", "deschid", "emit",
]);

function romanianPresent(word: string): boolean {
  // Older Romanian text uses the cedilla letters (ş, ţ); compare in the comma-below form.
  const first = word.replace(/ş/g, "ș").replace(/ţ/g, "ț");
  if (first === "am") return false;
  return RO_PRESENT_ENDINGS.test(first) || RO_PRESENT_VERBS.has(first);
}

/** Bullet openings in the present tense: English (no recognised past-tense verb) and Romanian. Other languages are not checked. */
export function startsInPresentTense(text: string, locale: Locale): boolean {
  if (locale === "ro") {
    const first = text.match(/[\p{L}-]+/u)?.[0].toLowerCase();
    return !!first && romanianPresent(first);
  }
  if (locale !== "en") return false;
  const first = text.match(/[a-z][a-z-]*/i)?.[0].toLowerCase();
  return !!first && !first.endsWith("ed") && !PAST_VERBS.has(first);
}

/** The note sent with a retry, and shown as a tailoring flag, when a line of an ended role opens in the present. */
export function pastTenseNote(locale: Locale): string {
  return locale === "ro"
    ? "The role has ended: start with \"Am\" and the past participle (\"Am coordonat…\")."
    : "The role has ended: start with a past-tense verb.";
}

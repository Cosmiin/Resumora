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

/**
 * The verbs a line opens with: the first word and every verb joined to it by "and", "or", a comma ("Designed,
 * built and shipped…") or, in Romanian, "și"/"sau" ("Am coordonat și verificat…"). A Romanian "Am" is skipped.
 * The chain stops at the first word that isn't joined this way, so "Designed maps and dashboards" gives one verb.
 */
function openingVerbs(text: string, locale: "en" | "ro"): string[] {
  const words = [...text.matchAll(/[\p{L}-]+|,/gu)].map((m) => m[0].toLowerCase());
  const joins = locale === "ro" ? new Set(["și", "şi", "sau", ","]) : new Set(["and", "or", ","]);
  let i = locale === "ro" && words[0] === "am" ? 1 : 0;
  const verbs: string[] = [];
  if (!words[i] || words[i] === ",") return verbs;
  verbs.push(words[i]!);
  while (joins.has(words[i + 1] ?? "")) {
    let j = i + 1;
    while (joins.has(words[j] ?? "")) j++;
    const next = words[j];
    if (!next || (locale === "ro" && next === "am")) break;
    verbs.push(next);
    i = j;
  }
  return verbs;
}

const englishPresent = (word: string) => !word.endsWith("ed") && !PAST_VERBS.has(word);

/**
 * Bullet openings in the present tense: English (no recognised past-tense verb) and Romanian. Every verb the line
 * opens with counts, so "Designed and update…" and "Am coordonat și verific…" are present too. Other languages
 * are not checked.
 */
export function startsInPresentTense(text: string, locale: Locale): boolean {
  if (locale === "ro") {
    const first = text.match(/[\p{L}-]+/u)?.[0].toLowerCase();
    if (!first) return false;
    if (first !== "am") return romanianPresent(first);
    return openingVerbs(text, "ro").slice(1).some(romanianPresent);
  }
  if (locale !== "en") return false;
  if (!/^[^a-z]*[a-z]/i.test(text)) return false;
  return openingVerbs(text, "en").some(englishPresent);
}

/**
 * A line that opens in the past tense: English with a recognised past-tense verb, Romanian with "Am". Other
 * languages, and lines that open with no clear verb ("Responsible for…"), are not.
 */
export function startsInPastTense(text: string, locale: Locale): boolean {
  const first = text.match(/[\p{L}-]+/u)?.[0].toLowerCase();
  if (!first) return false;
  if (locale === "ro") return first === "am";
  return locale === "en" && !englishPresent(first);
}

/**
 * The note sent with a retry, and shown as a tailoring flag, when a line that must stay in the past opens in the
 * present: a line of an ended role, or (`ended` false) a current role's line that the person wrote in the past.
 */
export function pastTenseNote(locale: Locale, ended = true): string {
  const why = ended ? "The role has ended" : "Your line is in the past tense";
  return locale === "ro"
    ? `${why}: start with "Am" and the past participle, and keep every verb in the past ("Am coordonat și verificat…").`
    : `${why}: use the past tense for every verb ("Designed and updated…").`;
}

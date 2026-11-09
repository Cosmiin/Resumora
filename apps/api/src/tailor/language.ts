import type { TailorLanguage } from "@resumora/shared";

/** Short, frequent words that rarely appear in the other five languages. */
const STOPWORDS: Record<TailorLanguage, ReadonlySet<string>> = {
  en: new Set(["the", "and", "with", "for", "our", "you", "will", "are", "who", "of", "to", "in", "is", "we", "your", "an"]),
  ro: new Set(["și", "si", "în", "cu", "pentru", "care", "să", "sa", "noastră", "nostru", "este", "din", "la", "pe", "un", "o"]),
  fr: new Set(["et", "les", "des", "avec", "pour", "nous", "notre", "vous", "est", "dans", "le", "la", "du", "une", "au", "sur"]),
  de: new Set(["und", "der", "die", "das", "mit", "für", "wir", "sie", "ist", "bei", "uns", "dem", "den", "ein", "eine", "einen"]),
  es: new Set(["y", "el", "los", "las", "con", "para", "nuestro", "nuestra", "es", "del", "una", "en", "que", "por", "de", "al"]),
  it: new Set(["e", "il", "gli", "con", "per", "nostro", "nostra", "è", "della", "dei", "delle", "una", "di", "che", "i", "nel"]),
};
const LANGUAGES = Object.keys(STOPWORDS) as TailorLanguage[];

/**
 * The job ad's language when it is one of the six and clearly leads: at least 5 stopword hits
 * and at least twice the runner-up. Otherwise null. No model call.
 */
export function detectAdLanguage(text: string): TailorLanguage | null {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const hits = LANGUAGES.map((language) => ({
    language, count: words.filter((word) => STOPWORDS[language].has(word)).length,
  })).sort((a, b) => b.count - a.count);
  const [top, runnerUp] = hits;
  if (!top || top.count < 5 || top.count < 2 * (runnerUp?.count ?? 0)) return null;
  return top.language;
}

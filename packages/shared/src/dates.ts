import type { Locale } from "./cv.ts";

export type TypedDate = { ok: true; value: string; present: boolean } | { ok: false };

const MONTH_NAMES: readonly (readonly string[])[] = [
  ["january", "jan", "ianuarie", "ian", "janv", "ene", "gen"],
  ["february", "feb", "februarie", "févr"],
  ["march", "mar", "martie", "mars", "märz"],
  ["april", "apr", "aprilie", "avr", "abr"],
  ["may", "mai", "mag"],
  ["june", "jun", "iunie", "iun", "juin", "juni", "giu"],
  ["july", "jul", "iulie", "iul", "juil", "juli", "lug"],
  ["august", "aug", "août", "ago"],
  ["september", "sep", "sept", "septembrie", "set"],
  ["october", "oct", "octombrie", "okt", "ott"],
  ["november", "nov", "noiembrie", "noi"],
  ["december", "dec", "decembrie", "déc", "dez", "dic"],
];

const MONTH_BY_NAME = new Map<string, number>(
  MONTH_NAMES.flatMap((names, i) => names.map((name) => [name, i + 1] as const)),
);

const SHORT_NAMES: Record<Locale, readonly string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ro: ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."],
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  de: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"],
  it: ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"],
};

const PRESENT_WORDS = new Set(["present", "prezent", "now", "acum"]);

function yearMonth(year: string, month: number): TypedDate {
  if (month < 1 || month > 12) return { ok: false };
  return { ok: true, value: `${year}-${String(month).padStart(2, "0")}`, present: false };
}

/** Reads a date typed by a person: "Mar 2021", "03/2021", "mai 2020", "2021", "present". */
export function parseTypedDate(input: string): TypedDate {
  const text = input.trim().toLowerCase();
  if (text === "") return { ok: true, value: "", present: false };
  if (PRESENT_WORDS.has(text)) return { ok: true, value: "", present: true };
  if (/^\d{4}$/.test(text)) return { ok: true, value: text, present: false };

  const isoLike = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (isoLike) return yearMonth(isoLike[1]!, Number(isoLike[2]));

  const numeric = /^(\d{1,2})[./](\d{4})$/.exec(text);
  if (numeric) return yearMonth(numeric[2]!, Number(numeric[1]));

  const named = /^([\p{L}]+)\.?\s+(\d{4})$/u.exec(text);
  if (named) {
    const month = MONTH_BY_NAME.get(named[1]!);
    if (month !== undefined) return yearMonth(named[2]!, month);
  }
  return { ok: false };
}

/** Shows a stored "YYYY-MM" or "YYYY" the way the CV's language writes it. */
export function formatYearMonth(value: string, locale: Locale): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const name = SHORT_NAMES[locale][Number(match[2]) - 1];
  return name === undefined ? value : `${name} ${match[1]}`;
}

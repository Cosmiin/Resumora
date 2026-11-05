import type { Locale } from "./cv.ts";

export type TypedDate = { ok: true; value: string; present: boolean } | { ok: false };

const MONTH_NAMES: readonly (readonly string[])[] = [
  ["january", "jan", "ianuarie", "ian"],
  ["february", "feb", "februarie"],
  ["march", "mar", "martie"],
  ["april", "apr", "aprilie"],
  ["may", "mai"],
  ["june", "jun", "iunie", "iun"],
  ["july", "jul", "iulie", "iul"],
  ["august", "aug"],
  ["september", "sep", "sept", "septembrie"],
  ["october", "oct", "octombrie"],
  ["november", "nov", "noiembrie", "noi"],
  ["december", "dec", "decembrie"],
];

const MONTH_BY_NAME = new Map<string, number>(
  MONTH_NAMES.flatMap((names, i) => names.map((name) => [name, i + 1] as const)),
);

const SHORT_NAMES: Record<Locale, readonly string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ro: ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."],
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

  const named = /^([a-zăâîșşțţ]+)\.?\s+(\d{4})$/.exec(text);
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

import type { Locale } from "@resumora/shared";

/** "Present" follows the CV's language, not the interface language. */
export const PRESENT: Record<Locale, string> = {
  en: "Present", ro: "prezent", fr: "aujourd'hui", de: "heute", es: "actualidad", it: "oggi",
};

function formatDate(value: string, locale: Locale): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatRange(start: string, end: string, current: boolean, locale: Locale): string {
  const to = current ? PRESENT[locale] : formatDate(end, locale);
  return [formatDate(start, locale), to].filter(Boolean).join(" – ");
}


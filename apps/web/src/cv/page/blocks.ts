import type { CvContent, Locale } from "@resumora/shared";

export type SectionKey =
  | "basics"
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "languages"
  | "certifications"
  | "projects"
  | "custom";

/** `itemId` is only set for list sections (experience, education, languages, certifications, projects, custom). */
export type BlockRef = { section: SectionKey; itemId?: string };

type ListSection = "experience" | "education" | "languages" | "certifications" | "projects" | "custom";
const LIST_SECTIONS: readonly string[] = ["experience", "education", "languages", "certifications", "projects", "custom"];

/** Where a block sits in its list; null when a list item no longer exists. */
export function findItem(cv: CvContent, ref: BlockRef): { index: number; count: number } | null {
  if (!LIST_SECTIONS.includes(ref.section)) return { index: 0, count: 1 };
  const list: readonly { id: string }[] = cv[ref.section as ListSection];
  const index = list.findIndex((item) => item.id === ref.itemId);
  return index < 0 ? null : { index, count: list.length };
}

/** "Present" follows the CV's language, not the interface language. */
const PRESENT: Record<Locale, string> = { en: "Present", ro: "prezent" };

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

/** Value for the `data-block` attribute, used to return focus to a block. */
export function blockKey(ref: BlockRef): string {
  return `${ref.section}:${ref.itemId ?? ""}`;
}

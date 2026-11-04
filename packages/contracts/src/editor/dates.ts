import { canonicalContentLocale, type ContentLocale } from "./content-language.ts";
import {
  isAccepted,
  type PartialDate,
  type Role,
} from "./model.ts";
// Adapted from prototype/app.js experienceDurationRange: month-index half-open
// intervals, year-only lower/upper bounds, union rather than sum. No invented dates.
export function dateError(d: PartialDate): boolean {
  return !!(
    (d.year && (!/^\d{4}$/.test(d.year) || +d.year < 1900 || +d.year > 2100)) ||
    (d.month && (!d.year || !/^([1-9]|1[0-2])$/.test(d.month)))
  );
}
export function reversedDates(start: PartialDate, end: PartialDate): boolean {
  if (!start.year || !end.year || dateError(start) || dateError(end))
    return false;
  // Reject only impossible chronology; unknown month remains unknown.
  return (
    +end.year * 12 + +(end.month || 12) < +start.year * 12 + +(start.month || 1)
  );
}
export function formatDate(d: PartialDate, locale: ContentLocale): string {
  const canonical = checkedLocale(locale), primary = new Intl.Locale(canonical).language;
  if (!d.year) return primary === "ro" ? "Dată necunoscută" : primary === "en" ? "Date unknown" : "";
  if (!d.month || dateError(d)) return d.year;
  // A valid language tag does not imply that this runtime has localized data.
  if (!Intl.DateTimeFormat.supportedLocalesOf([canonical]).length)
    return `${d.year}-${d.month.padStart(2, "0")}`;
  return new Intl.DateTimeFormat(canonical, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(+d.year, +d.month - 1, 1)));
}
export function durationBounds(roles: Role[], asOf: PartialDate) {
  if (!asOf.year || !asOf.month || dateError(asOf))
    return { min: 0, max: 0, unknown: roles.length, known: 0 };
  const cutoff = +asOf.year * 12 + +asOf.month - 1;
  let unknown = 0;
  const intervals = roles.flatMap((r) => {
    const s = r.start.value,
      e = r.ongoing.value ? asOf : r.end.value;
    if (
      !s.year ||
      !e.year ||
      dateError(s) ||
      dateError(e) ||
      reversedDates(s, e) ||
      +s.year * 12 + +(s.month || 1) - 1 > cutoff
    ) {
      unknown++;
      return [];
    }
    return [
      {
        lo: +s.year * 12 + +(s.month || 12) - 1,
        hi: Math.min(cutoff, +e.year * 12 + +(e.month || 1) - 1),
        loMax: +s.year * 12 + +(s.month || 1) - 1,
        hiMax: Math.min(cutoff, +e.year * 12 + +(e.month || 12) - 1),
      },
    ];
  });
  function union(items: { lo: number; hi: number }[]) {
    let total = 0,
      end = -Infinity;
    for (const x of items
      .filter((x) => x.hi > x.lo)
      .sort((a, b) => a.lo - b.lo)) {
      if (x.hi > end) {
        total += x.hi - Math.max(x.lo, end);
        end = x.hi;
      }
    }
    return total;
  }
  return {
    min: union(intervals),
    max: union(intervals.map((x) => ({ lo: x.loMax, hi: x.hiMax }))),
    unknown,
    known: intervals.length,
  };
}

/** Calendar-month durations are derived views, never new factual dates. */
export function currentMonth(now = new Date()): PartialDate {
  return {
    year: String(now.getUTCFullYear()),
    month: String(now.getUTCMonth() + 1),
  };
}
export function experienceDuration(
  roles: Role[],
  asOf: PartialDate,
  hiddenFields: string[] = [],
) {
  const hidden = new Set(hiddenFields);
  const eligible = roles.filter(
    (role) =>
      isAccepted(role.start) &&
      !hidden.has(role.start.fieldId) &&
      (role.ongoing.value
        ? isAccepted(role.ongoing) && !hidden.has(role.ongoing.fieldId)
        : isAccepted(role.end) && !hidden.has(role.end.fieldId)),
  );
  const bounds = durationBounds(eligible, asOf);
  return {
    ...bounds,
    unknown: bounds.unknown + roles.length - eligible.length,
  };
}
function checkedLocale(locale: ContentLocale): string {
  const canonical = canonicalContentLocale(locale);
  if (!canonical) throw new Error("CONTENT_LOCALE_INVALID");
  return canonical;
}
export function formatMonths(total: number, locale: ContentLocale): string {
  const canonical = checkedLocale(locale);
  locale = new Intl.Locale(canonical).language;
  const years = Math.floor(total / 12),
    months = total % 12;
  if (locale !== "ro" && locale !== "en") {
    if (!Intl.NumberFormat.supportedLocalesOf([canonical]).length) return "";
    const unit = (value: number, name: "year" | "month") => new Intl.NumberFormat(canonical, { style: "unit", unit: name, unitDisplay: "long" }).format(value);
    return [years ? unit(years, "year") : "", months || !years ? unit(months, "month") : ""].filter(Boolean).join(" ");
  }
  const parts = [];
  if (years)
    parts.push(
      locale === "ro"
        ? `${years} ${years === 1 ? "an" : years % 100 >= 20 || years % 100 === 0 ? "de ani" : "ani"}`
        : `${years} ${years === 1 ? "year" : "years"}`,
    );
  if (months || !years)
    parts.push(
      locale === "ro"
        ? `${months} ${months === 1 ? "lună" : "luni"}`
        : `${months} ${months === 1 ? "month" : "months"}`,
    );
  return parts.join(" ");
}
export function formatExperienceDuration(
  bounds: ReturnType<typeof durationBounds>,
  locale: ContentLocale,
): string {
  const canonical = checkedLocale(locale), primary = new Intl.Locale(canonical).language;
  if (primary !== "ro" && primary !== "en" && !Intl.NumberFormat.supportedLocalesOf([canonical]).length) return "";
  if (!bounds.known)
    return primary === "ro" ? "Durată indisponibilă" : primary === "en" ? "Duration unavailable" : "";
  if (bounds.unknown)
    return `${primary === "ro" ? "cel puțin" : primary === "en" ? "at least" : "≥"} ${formatMonths(bounds.min, locale)}`;
  if (bounds.min !== bounds.max)
    return `${formatMonths(bounds.min, locale)} – ${formatMonths(bounds.max, locale)}`;
  return formatMonths(bounds.min, locale);
}

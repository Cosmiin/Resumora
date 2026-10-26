import type { Locale, PartialDate, Role } from "./model";
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
export function formatDate(d: PartialDate, locale: Locale): string {
  if (!d.year) return locale === "ro" ? "Dată necunoscută" : "Date unknown";
  if (!d.month || dateError(d)) return d.year;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(+d.year, +d.month - 1, 1)));
}
export function durationBounds(roles: Role[], asOf: PartialDate) {
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

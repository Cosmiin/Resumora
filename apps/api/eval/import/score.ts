import { missingCategories, type CvContent, type ImportResult, type SourceHeading } from "@resumora/shared";
import { findUnsourcedLines } from "../../src/imports/source-check.ts";

/** The answer key of a case: the CV without ids or layout, the headings as printed, the flags. */
export type Expected = {
  content: Record<string, unknown>;
  headings: SourceHeading[];
  flags: { key: string; level: string; field?: string }[];
};

export type CaseScore = {
  sectionsOk: boolean;
  /** Matching leaf strings / expected leaf strings (0 to 1). */
  fieldAccuracy: number;
  /** Lines of the result that are not in the source text. */
  invented: string[];
  diacriticsOk: boolean;
  flagsOk: boolean;
  /** Items in the result that the answer key does not have (they lower fieldAccuracy). */
  extra: string[];
  sectionProblems: string[];
  brokenAccents: string[];
};

const SKIPPED_KEYS = new Set(["id", "schemaVersion", "layout"]);
/** Keys that name an item, in the order they are tried. Items are matched on these, not on position. */
const NAME_KEYS = ["company", "title", "school", "degree", "name", "text", "heading"];

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every non-empty string of a value, with its path, ids and layout left out. */
function leaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (squash(value)) out.push(squash(value));
  } else if (Array.isArray(value)) value.forEach((v) => leaves(v, out));
  else if (isRecord(value)) for (const [k, v] of Object.entries(value)) if (!SKIPPED_KEYS.has(k)) leaves(v, out);
  return out;
}

/** The words that name an item (a job is "company title"). */
function itemKey(item: unknown): string {
  if (typeof item === "string") return squash(item);
  if (!isRecord(item)) return "";
  const parts = NAME_KEYS.filter((k) => typeof item[k] === "string" && item[k]).slice(0, 2);
  return parts.map((k) => squash(item[k] as string)).join(" ");
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const wa = new Set(a.split(" "));
  const wb = new Set(b.split(" "));
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / (wa.size + wb.size - shared || 1);
}

type Tally = { total: number; hits: number; extra: string[] };
const add = (a: Tally, b: Tally) => { a.total += b.total; a.hits += b.hits; a.extra.push(...b.extra); };

/**
 * Counts expected leaves (strings, even empty ones, and booleans) and how many the actual value has
 * in the same place. Items the result has beyond the expected ones are listed in `extra` and their
 * strings are added to the total, so they lower the accuracy.
 */
function compare(expected: unknown, actual: unknown, path = ""): Tally {
  const none: Tally = { total: 0, hits: 0, extra: [] };
  if (typeof expected === "string") {
    return { total: 1, hits: typeof actual === "string" ? +(squash(actual) === squash(expected)) : +(squash(expected) === ""), extra: [] };
  }
  if (typeof expected === "boolean") return { total: 1, hits: +(actual === expected), extra: [] };
  if (Array.isArray(expected)) {
    const pool = Array.isArray(actual) ? [...actual] : [];
    const t: Tally = { ...none, extra: [] };
    for (const item of expected) {
      let best = -1;
      let bestScore = 0;
      pool.forEach((candidate, i) => {
        const s = similarity(itemKey(item), itemKey(candidate));
        if (s > bestScore) [best, bestScore] = [i, s];
      });
      add(t, compare(item, best >= 0 ? pool.splice(best, 1)[0] : undefined, path));
    }
    for (const left of pool) {
      t.total += Math.max(1, leaves(left).length);
      t.extra.push(`${path}: ${itemKey(left) || "(empty item)"}`);
    }
    return t;
  }
  if (isRecord(expected)) {
    const t: Tally = { ...none, extra: [] };
    for (const [k, v] of Object.entries(expected)) {
      if (!SKIPPED_KEYS.has(k)) add(t, compare(v, isRecord(actual) ? actual[k] : undefined, path ? `${path}.${k}` : k));
    }
    return t;
  }
  return none;
}

const stripMarks = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
const hasMarks = (s: string) => /\p{M}/u.test(s.normalize("NFD"));

/** Expected lines with an accent that came back changed only in their accents. */
function brokenAccents(expected: unknown, actual: unknown): string[] {
  const got = leaves(actual).map((s) => s.normalize("NFC"));
  return leaves(expected)
    .filter(hasMarks)
    .filter((want) => {
      const w = want.normalize("NFC");
      return !got.includes(w) && got.some((g) => stripMarks(g) === stripMarks(w));
    });
}

const headingKey = (h: SourceHeading) => `${h.category}|${squash(h.heading).toLowerCase()}`;

const flagKey = (f: { key: string; level: string; field?: string }) => `${f.key}|${f.level}|${f.field ?? ""}`;

/** Headings the result lacks, or put in another category ("heading -> got X, expected Y"). */
function sectionProblems(expected: SourceHeading[], actual: SourceHeading[]): string[] {
  const norm = (h: string) => squash(h).toLowerCase();
  const found = new Set(actual.map(headingKey));
  return expected
    .filter((h) => !found.has(headingKey(h)))
    .map((h) => {
      const other = actual.find((a) => norm(a.heading) === norm(h.heading));
      return other ? `"${h.heading}" -> got ${other.category}, expected ${h.category}` : `"${h.heading}" missing (expected ${h.category})`;
    });
}

/**
 * Scores one imported CV against its answer key. `source` is the text of the file; when given,
 * lines of the result that cannot be found in it are reported as invented.
 */
export function scoreCase(expected: Expected, actual: ImportResult, source?: string): CaseScore {
  const { total, hits, extra } = compare(expected.content, actual.content);
  const flags = missingCategories(actual.content as CvContent).map(flagKey).sort();
  const problems = sectionProblems(expected.headings, actual.sourceHeadings);
  const accents = brokenAccents(expected.content, actual.content);
  return {
    sectionsOk: problems.length === 0,
    fieldAccuracy: total === 0 ? 1 : hits / total,
    invented: source === undefined ? [] : findUnsourcedLines(actual.content as CvContent, source),
    diacriticsOk: accents.length === 0,
    flagsOk: JSON.stringify(flags) === JSON.stringify(expected.flags.map(flagKey).sort()),
    extra,
    sectionProblems: problems,
    brokenAccents: accents,
  };
}

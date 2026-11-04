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

/** Counts expected leaves and how many the actual value has in the same place. */
function compare(expected: unknown, actual: unknown): { total: number; hits: number } {
  if (typeof expected === "string") {
    const want = squash(expected);
    if (!want) return { total: 0, hits: 0 };
    return { total: 1, hits: typeof actual === "string" && squash(actual) === want ? 1 : 0 };
  }
  if (Array.isArray(expected)) {
    const pool = Array.isArray(actual) ? [...actual] : [];
    let total = 0;
    let hits = 0;
    for (const item of expected) {
      let best = -1;
      let bestScore = 0;
      pool.forEach((candidate, i) => {
        const s = similarity(itemKey(item), itemKey(candidate));
        if (s > bestScore) [best, bestScore] = [i, s];
      });
      const match = best >= 0 ? pool.splice(best, 1)[0] : undefined;
      const r = compare(item, match);
      total += r.total;
      hits += r.hits;
    }
    return { total, hits };
  }
  if (isRecord(expected)) {
    let total = 0;
    let hits = 0;
    for (const [k, v] of Object.entries(expected)) {
      if (SKIPPED_KEYS.has(k)) continue;
      const r = compare(v, isRecord(actual) ? actual[k] : undefined);
      total += r.total;
      hits += r.hits;
    }
    return { total, hits };
  }
  return { total: 0, hits: 0 };
}

const stripMarks = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
const hasMarks = (s: string) => /\p{M}/u.test(s.normalize("NFD"));

/** Every expected line with an accent must come back exactly: a copy that differs only in accents is a failure. */
function diacriticsKept(expected: unknown, actual: unknown): boolean {
  const got = leaves(actual).map((s) => s.normalize("NFC"));
  return leaves(expected)
    .filter(hasMarks)
    .every((want) => {
      const w = want.normalize("NFC");
      if (got.includes(w)) return true;
      const plain = stripMarks(w);
      return !got.some((g) => stripMarks(g) === plain);
    });
}

const headingKey = (h: SourceHeading) => `${h.category}|${squash(h.heading).toLowerCase()}`;

/**
 * Scores one imported CV against its answer key. `source` is the text of the file; when given,
 * lines of the result that cannot be found in it are reported as invented.
 */
export function scoreCase(expected: Expected, actual: ImportResult, source?: string): CaseScore {
  const { total, hits } = compare(expected.content, actual.content);
  const found = new Set(actual.sourceHeadings.map(headingKey));
  const flags = missingCategories(actual.content as CvContent);
  return {
    sectionsOk: expected.headings.every((h) => found.has(headingKey(h))),
    fieldAccuracy: total === 0 ? 1 : hits / total,
    invented: source === undefined ? [] : findUnsourcedLines(actual.content as CvContent, source),
    diacriticsOk: diacriticsKept(expected.content, actual.content),
    flagsOk: JSON.stringify(flags) === JSON.stringify(expected.flags),
  };
}

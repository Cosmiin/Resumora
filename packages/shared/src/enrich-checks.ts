import type { CvContent, Experience } from "./cv.ts";

/** Longest bullet or proposal we accept (two lines). */
export const PROPOSAL_MAX = 220;

export type AtsTip =
  | "tooLong"
  | "firstPerson"
  | "missingDates"
  | "missingTitle"
  | "fewBullets"
  | "manyBullets"
  | "oddCharacters";

// "I" is case-sensitive so a lowercase "i" is not caught; the other words ignore case.
const FIRST_PERSON = /(?<![\p{L}\p{N}])(?:I|[Mm][Yy]|[Mm][Ee]|[Ee][Uu]|[Mm][Ee][Uu]|[Mm][Ee][Aa])(?![\p{L}\p{N}])/u;
const ODD_CHARS = /[\t★►✓]|\p{Extended_Pictographic}/u;

export function hasFirstPerson(text: string): boolean {
  return FIRST_PERSON.test(text);
}

export function atsChecks(role: Experience): AtsTip[] {
  const texts = role.bullets.map((b) => b.text);
  const tips: AtsTip[] = [];
  if (texts.some((t) => t.length > PROPOSAL_MAX)) tips.push("tooLong");
  if (texts.some(hasFirstPerson)) tips.push("firstPerson");
  if (!role.startDate || (!role.current && !role.endDate)) tips.push("missingDates");
  if (!role.title.trim()) tips.push("missingTitle");
  if (texts.length < 2) tips.push("fewBullets");
  if (texts.length > 8) tips.push("manyBullets");
  if (texts.some((t) => ODD_CHARS.test(t))) tips.push("oddCharacters");
  return tips;
}

export type SummaryCheck = {
  key: "sentences" | "firstPerson" | "length" | "mentionsRole" | "mentionsNumber";
  ok: boolean;
};

function sentenceCount(text: string): number {
  return text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length;
}

/** The latest role is the first experience in CV order, which is the order the editor shows. */
function mentionsRole(summary: string, latest: Experience | undefined): boolean {
  const title = latest?.title.trim().toLowerCase();
  if (!title) return false;
  const lower = summary.toLowerCase();
  if (lower.includes(title)) return true;
  const words = title.match(/\p{L}{4,}/gu) ?? [];
  return words.some((w) => lower.includes(w));
}

export function summaryChecklist(cv: CvContent): SummaryCheck[] {
  const summary = cv.basics.summary;
  const sentences = sentenceCount(summary);
  return [
    { key: "sentences", ok: sentences >= 2 && sentences <= 4 },
    { key: "firstPerson", ok: !hasFirstPerson(summary) },
    { key: "length", ok: summary.length <= 600 },
    { key: "mentionsRole", ok: mentionsRole(summary, cv.experience[0]) },
    { key: "mentionsNumber", ok: /\d/.test(summary) },
  ];
}

export type SkillsCheck = { key: "nothingToSort" | "toolsListed"; ok: boolean; missing?: string[] };

const NOT_TOOLS = new Set(["CV", "HR", "CEO", "EU", "RO", "UK", "USA", "PM"]);

function isToolLike(word: string): boolean {
  if (NOT_TOOLS.has(word)) return false;
  return (
    /^\p{Lu}{2,6}$/u.test(word) || // SQL
    /^\p{L}[\p{L}\p{N}]*[\p{Lu}\p{N}]/u.test(word) || // GA4, PowerBI
    /\p{L}\.\p{L}/u.test(word) // Node.js
  );
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export function skillsChecklist(cv: CvContent): SkillsCheck[] {
  const listed = new Set(
    [...cv.technicalSkills, ...cv.professionalSkills, ...cv.unclearSkills].map((s) => squash(s.name)),
  );
  const missing: string[] = [];
  for (const role of cv.experience) {
    for (const bullet of role.bullets) {
      for (const raw of bullet.text.split(/[^\p{L}\p{N}.+#]+/u)) {
        const word = raw.replace(/^\.+|\.+$/g, "");
        if (word && isToolLike(word) && !listed.has(squash(word)) && !missing.includes(word)) missing.push(word);
      }
    }
  }
  return [
    { key: "nothingToSort", ok: cv.unclearSkills.length === 0 },
    { key: "toolsListed", ok: missing.length === 0, missing },
  ];
}

const SCALES: [RegExp, number][] = [
  [/^\s?(?:milioane|million|mil)(?![\p{L}])/iu, 1_000_000],
  [/^\s?M(?![\p{L}])/u, 1_000_000],
  [/^\s?(?:mii|k)(?![\p{L}])/iu, 1_000],
];

/**
 * Reads one number token. Ruling: a comma or dot followed by exactly 3 digits, with no scale
 * suffix, is a thousands separator ("1,200" and "1.200" are both 1200). Any other single
 * separator is a decimal ("1,2" and "1.2" are both 1.2).
 */
function parseNumber(token: string, hasScale: boolean): number {
  if (!hasScale && /^\d{1,3}(?:[.,]\d{3})+$/.test(token)) return Number(token.replace(/[.,]/g, ""));
  const parts = token.split(/[.,]/);
  if (parts.length === 1) return Number(token);
  const decimals = parts.pop()!;
  return Number(`${parts.join("")}.${decimals}`);
}

/** Numbers in `text` as plain strings: separators normalised, scales applied, `%` and units dropped. */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const rest = text.slice(m.index + m[0].length);
    const scale = SCALES.find(([re]) => re.test(rest));
    const value = parseNumber(m[0], Boolean(scale));
    out.push(String(Math.round(value * (scale?.[1] ?? 1) * 1e6) / 1e6));
  }
  return out;
}

/** True when the proposal has a number that appears in none of the sources. */
export function hasUnknownNumber(proposal: string, sources: string[]): boolean {
  const known = new Set(sources.flatMap(numbersIn));
  return numbersIn(proposal).some((n) => !known.has(n));
}

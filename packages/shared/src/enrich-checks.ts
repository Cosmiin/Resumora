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

// The words count only as written in normal text ("eu", "Eu", "me", "Me"...), so all-caps "EU"
// (European Union) and "ME" do not count.
const FIRST_PERSON_WORDS = /(?<![\p{L}\p{N}])(?:[Mm]y|[Mm]e|[Ee]u|[Mm]eu|[Mm]ea)(?![\p{L}\p{N}])/u;
// "I" counts only before a lowercase word or an apostrophe ("I managed", "I'm"), never in
// "I.T.", "I/O" or "Level I".
const FIRST_PERSON_I = /(?<![\p{L}\p{N}])I(?=['’]|\s+\p{Ll})/gu;
// Words that put a Roman numeral after them ("Phase I rollout"), in English and Romanian.
const NUMERAL_HEAD = /(?:phase|level|type|part|stage|tier|class|grade|chapter|step|category|section|volume|vol|group|series|fa[zț][aă]|nivel|etap[aă]|tip|clas[aă]|capitol|sec[țt]iune|pas|grup[aă]|serie|categorie|parte|volum)\s+$/iu;
const ODD_CHARS = /[\t★►✓]|\p{Extended_Pictographic}/u;

export function hasFirstPerson(text: string): boolean {
  if (FIRST_PERSON_WORDS.test(text)) return true;
  for (const m of text.matchAll(FIRST_PERSON_I)) {
    if (!NUMERAL_HEAD.test(text.slice(0, m.index))) return true;
  }
  return false;
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
  const whole = (w: string) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u").test(lower);
  if (whole(title)) return true;
  const words = title.match(/\p{L}{4,}/gu) ?? [];
  return words.some(whole);
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

const NOT_TOOLS = new Set([
  "CV", "HR", "CEO", "EU", "RO", "UK", "USA", "PM", "IT", "KPI", "KPIs", "ROI", "B2B", "B2C",
  "FY", "UE", "SRL", "SA", "TVA",
]);

function isToolLike(word: string): boolean {
  if (NOT_TOOLS.has(word) || /^Q[1-4]$/.test(word)) return false;
  return (
    /^\p{Lu}{2,6}$/u.test(word) || // SQL
    /^\p{L}+\p{N}+$/u.test(word) || // GA4
    /^\p{Lu}?\p{Ll}+(?:\p{Lu}+\p{Ll}*)+\p{N}*$/u.test(word) || // PowerBI, JavaScript
    /^\p{L}{2,}\.\p{L}{2,}$/u.test(word) // Node.js, not "e.g" or "U.S"
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

// Word scales may follow a space ("1,2 mil"). A single letter counts only when attached to the
// number ("3M users") and not followed by a letter, digit or "&", so "3 M&A" and "6 M" are not scales.
const SCALES: [RegExp, number][] = [
  [/^\s?(?:miliarde|miliard|billions?|mld|bn)(?![\p{L}\p{N}])/iu, 1_000_000_000],
  [/^\s?(?:milioane|milion|millions?|mil)(?![\p{L}\p{N}])/iu, 1_000_000],
  [/^\s?mii(?![\p{L}\p{N}])/iu, 1_000],
  [/^B(?![\p{L}\p{N}&])/u, 1_000_000_000],
  [/^M(?![\p{L}\p{N}&])/u, 1_000_000],
  [/^[kK](?![\p{L}\p{N}&])/u, 1_000],
];

/**
 * Reads one number token. Ruling: a comma or dot followed by exactly 3 digits, with no scale
 * suffix, is a thousands separator ("1,200" and "1.200" are both 1200); the first group may not
 * start with 0, so "0.250" is a decimal. Any other single separator is a decimal ("1,2" and
 * "1.2" are both 1.2). Spaces, non-breaking spaces and apostrophes between groups of 3 digits
 * ("10 000", "10'000") are thousands separators too.
 */
function parseNumber(raw: string, hasScale: boolean): number {
  const token = raw.replace(/[\s\u00a0\u202f']/g, "");
  if (!hasScale && /^[1-9]\d{0,2}(?:[.,]\d{3})+$/.test(token)) return Number(token.replace(/[.,]/g, ""));
  const parts = token.split(/[.,]/);
  if (parts.length === 1) return Number(token);
  const decimals = parts.pop()!;
  return Number(`${parts.join("")}.${decimals}`);
}

const NUMBER = /(?<![\p{Lu}\p{N}])(?:\d{1,3}(?:[\s\u00a0\u202f']\d{3})+(?:[.,]\d+)?(?!\d)|\d+(?:[.,]\d+)*)/gu;

/** Numbers in `text` as plain strings: separators normalised, scales applied, `%` and units dropped. */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const rest = text.slice(m.index + m[0].length);
    const scale = SCALES.find(([re]) => re.test(rest));
    const value = parseNumber(m[0], Boolean(scale)) * (scale?.[1] ?? 1);
    out.push(String(scale ? Math.round(value) : Math.round(value * 1e6) / 1e6));
  }
  return out;
}

// Digits glued to a capital letter ("USD1800", "GA4", "B2B", "ISO27001", "Q4"). numbersIn skips
// these, so they are compared as whole tokens instead.
// A source may write them in any case ("iso27001"), so sources accept any letter before the digits.
const GLUED = /(?<![\p{L}\p{N}])\p{L}*\p{Lu}\p{N}[\p{L}\p{N}.,]*/gu;
const LETTERS_THEN_DIGITS = /(?<![\p{L}\p{N}])\p{L}+\p{N}[\p{L}\p{N}.,]*/gu;

function tokens(text: string, re: RegExp): string[] {
  return [...text.matchAll(re)].map((m) => m[0].replace(/[.,]+$/, "").toLowerCase());
}

/** True when the proposal has a number, or a glued token like "USD1800", that appears in none of the sources. */
export function hasUnknownNumber(proposal: string, sources: string[]): boolean {
  const known = new Set(sources.flatMap(numbersIn));
  if (numbersIn(proposal).some((n) => !known.has(n))) return true;
  const knownGlued = new Set(sources.flatMap((s) => tokens(s, LETTERS_THEN_DIGITS)));
  return tokens(proposal, GLUED).some((t) => !knownGlued.has(t));
}

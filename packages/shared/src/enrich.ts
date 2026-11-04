import { z } from "zod";
import type { Experience, Locale } from "./cv.ts";

/** Names the weights and prompt behind a score. Bump it when either changes. */
export const SCORE_POLICY = "score/1";

export const WEIGHTS = { contribution: 35, clarity: 25, specificity: 20, impact: 20 } as const;

export const MAX_QUESTIONS = 3;

export const GradeSchema = z.enum(["missing", "partial", "specific"]);
export type Grade = z.infer<typeof GradeSchema>;

export const IssueSchema = z.enum(["example", "duplicate", "contribution", "clarity", "specificity", "impact", "none"]);
export type Issue = z.infer<typeof IssueSchema>;

/** Most urgent first. "none" is last. */
const ISSUE_ORDER: readonly Issue[] = ["example", "duplicate", "contribution", "clarity", "specificity", "impact", "none"];

const id = z.string().min(1).max(64);

export const ModelBulletSchema = z
  .object({
    id,
    meaningful: z.boolean(),
    contribution: GradeSchema,
    clarity: GradeSchema,
    specificity: GradeSchema,
    impact: GradeSchema,
    issue: IssueSchema,
    duplicateOf: id.nullable(),
    tip: z.string().max(240).nullable(),
    question: z.string().max(240).nullable(),
    options: z.array(z.string().max(60)).max(4),
  })
  .strict();
export type ModelBullet = z.infer<typeof ModelBulletSchema>;

export const ModelScoreSchema = z
  .object({ bullets: z.array(ModelBulletSchema), nextStepId: id.nullable() })
  .strict();
export type ModelScore = z.infer<typeof ModelScoreSchema>;

export const QuestionSchema = z
  .object({ bulletId: id, text: z.string(), options: z.array(z.string()) })
  .strict();
export type Question = z.infer<typeof QuestionSchema>;

export const RoleResultSchema = z
  .object({
    policy: z.string(),
    fingerprint: z.string(),
    score: z.number().int().min(0).max(100).nullable(),
    bullets: z.array(
      z
        .object({
          id,
          score: z.number().int().min(0).max(100),
          contribution: GradeSchema,
          clarity: GradeSchema,
          specificity: GradeSchema,
          impact: GradeSchema,
          issue: IssueSchema,
          tip: z.string().nullable(),
          question: z.string().nullable(),
        })
        .strict(),
    ),
    nextStep: z.object({ bulletId: id, issue: IssueSchema, tip: z.string().nullable() }).strict().nullable(),
    questions: z.array(QuestionSchema).max(MAX_QUESTIONS),
  })
  .strict();
export type RoleResult = z.infer<typeof RoleResultSchema>;

/** The model's answer does not match the bullets that were sent. */
export class EnrichParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrichParseError";
  }
}

const MULTIPLIER: Record<Grade, number> = { missing: 0, partial: 0.5, specific: 1 };

export function bulletScore(g: Record<keyof typeof WEIGHTS, Grade>): number {
  return Math.round(
    WEIGHTS.contribution * MULTIPLIER[g.contribution] +
      WEIGHTS.clarity * MULTIPLIER[g.clarity] +
      WEIGHTS.specificity * MULTIPLIER[g.specificity] +
      WEIGHTS.impact * MULTIPLIER[g.impact],
  );
}

const RANGE_PATTERNS = [/\d+\s*[–-]\s*\d+/g, /\d+\+/g, /\b(?:under|over|sub|peste)\s+\d+/gi];

/** An answer option may hold a number only as a range or a bound. */
export function isAllowedOption(option: string): boolean {
  let rest = option;
  for (const p of RANGE_PATTERNS) rest = rest.replace(p, " ");
  return !/\d/.test(rest);
}

const PLACEHOLDERS = [
  "placeholder",
  "test",
  "testing",
  "todo",
  "tbd",
  "asdf",
  "lorem ipsum",
  "nothing special",
  "de completat",
  "exemplu",
  "nimic",
];

function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A bullet with no real content, whatever the model says about it. */
export function isPlaceholder(text: string): boolean {
  const t = plain(text);
  if (t === "") return true;
  return PLACEHOLDERS.some((p) => t === p || t.startsWith(`${p} `));
}

function repeatKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizedIssue(m: ModelBullet, unusable: boolean, duplicate: boolean): Issue {
  if (unusable) return "example";
  if (duplicate) return "duplicate";
  if (m.contribution !== "specific") return "contribution";
  if (m.clarity !== "specific") return "clarity";
  if (m.specificity !== "specific") return "specificity";
  if (m.impact !== "specific") return "impact";
  return "none";
}

type ResultBullet = RoleResult["bullets"][number];

export function buildRoleResult(role: Experience, model: ModelScore, fingerprintValue: string): RoleResult {
  const ids = role.bullets.map((b) => b.id);
  const byId = new Map<string, ModelBullet>();
  for (const m of model.bullets) {
    if (byId.has(m.id)) throw new EnrichParseError(`Duplicate bullet id in model answer: ${m.id}`);
    byId.set(m.id, m);
  }
  for (const m of model.bullets) {
    if (!ids.includes(m.id)) throw new EnrichParseError(`Unknown bullet id in model answer: ${m.id}`);
  }
  for (const bid of ids) {
    if (!byId.has(bid)) throw new EnrichParseError(`Model answer is missing bullet id: ${bid}`);
  }

  const seen = new Set<string>();
  const options = new Map<string, string[]>();
  const bullets: ResultBullet[] = role.bullets.map((b, index) => {
    const m = byId.get(b.id) as ModelBullet;
    const unusable = !m.meaningful || isPlaceholder(b.text);
    const key = repeatKey(b.text);
    const earlier = m.duplicateOf !== null && ids.indexOf(m.duplicateOf) >= 0 && ids.indexOf(m.duplicateOf) < index;
    const duplicate = earlier || seen.has(key);
    seen.add(key);

    const issue = normalizedIssue(m, unusable, duplicate);
    const keep = issue === m.issue;
    const question = keep && issue !== "duplicate" ? m.question : null;
    if (question !== null) options.set(b.id, m.options.filter(isAllowedOption));
    return {
      id: b.id,
      score: unusable || duplicate ? 0 : bulletScore(m),
      contribution: m.contribution,
      clarity: m.clarity,
      specificity: m.specificity,
      impact: m.impact,
      issue,
      tip: keep ? m.tip : null,
      question,
    };
  });

  const rank = (x: ResultBullet) => ISSUE_ORDER.indexOf(x.issue);
  const byUrgency = (a: ResultBullet, b: ResultBullet) => rank(a) - rank(b) || a.score - b.score;

  const questions: Question[] = bullets
    .filter((b) => b.question !== null)
    .sort(byUrgency)
    .slice(0, MAX_QUESTIONS)
    .map((b) => ({ bulletId: b.id, text: b.question as string, options: options.get(b.id) ?? [] }));

  const open = bullets.filter((b) => b.issue !== "none");
  let nextStep: RoleResult["nextStep"] = null;
  if (open.length > 0) {
    const top = Math.min(...open.map(rank));
    const tier = open.filter((b) => rank(b) === top);
    const picked = tier.find((b) => b.id === model.nextStepId) ?? [...tier].sort(byUrgency)[0] as ResultBullet;
    nextStep = { bulletId: picked.id, issue: picked.issue, tip: picked.tip };
  }

  const score =
    bullets.length === 0 ? null : Math.round(bullets.reduce((sum, b) => sum + b.score, 0) / bullets.length);

  return { policy: SCORE_POLICY, fingerprint: fingerprintValue, score, bullets, nextStep, questions };
}

/** Small synchronous 53-bit string hash (cyrb53), so the browser and the worker agree. */
function cyrb53(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Changes when anything the score depends on changes: texts, title, description, locale or policy. */
export function fingerprint(role: Experience, locale: Locale): string {
  const parts = [SCORE_POLICY, locale, role.title, role.description, ...role.bullets.map((b) => b.text)];
  return cyrb53(parts.join("\u0000")).toString(16);
}

export type Band = "needsWork" | "goodStart" | "clear";

export function band(score: number): Band {
  if (score >= 75) return "clear";
  if (score >= 40) return "goodStart";
  return "needsWork";
}

export function clearCount(result: Pick<RoleResult, "bullets">): { clear: number; total: number } {
  return { clear: result.bullets.filter((b) => b.score >= 75).length, total: result.bullets.length };
}

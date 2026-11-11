import { z } from "zod";
import { MAX_LONG_TEXT, type Experience, type Locale } from "./cv.ts";

/** Names the weights and prompt behind a score. Bump it when either changes. */
export const SCORE_POLICY = "score/5";

export const WEIGHTS = { contribution: 35, clarity: 25, specificity: 20, impact: 20 } as const;

export const MAX_QUESTIONS = 20;
/** Company, purpose and tools, plus at most 5 more. */
export const MAX_ROLE_QUESTIONS = 8;

/** What a role question is about. The first three are always covered unless the CV or notes already say it. */
export const ROLE_TOPICS = ["company", "purpose", "tools", "other"] as const;
export const RoleTopicSchema = z.enum(ROLE_TOPICS);
export type RoleTopic = z.infer<typeof RoleTopicSchema>;

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
  .object({
    bullets: z.array(ModelBulletSchema),
    nextStepId: id.nullable(),
    roleQuestions: z.array(z.object({
      text: z.string().max(240),
      options: z.array(z.string().max(60)).max(4),
      topic: RoleTopicSchema.default("other"),
    }).strict()).max(MAX_ROLE_QUESTIONS).default([]),
    /** Too little information to infer plausible skills or achievements. */
    thin: z.boolean().default(false),
  })
  .strict();
export type ModelScore = z.infer<typeof ModelScoreSchema>;

const QuestionKindSchema = z.enum(["detail", "result"]);
export type QuestionKind = z.infer<typeof QuestionKindSchema>;

export function questionKind(b: { contribution: Grade; clarity: Grade; specificity: Grade; impact: Grade }): QuestionKind {
  return b.contribution === "specific" && b.clarity === "specific" && b.specificity === "specific" && b.impact !== "specific"
    ? "result"
    : "detail";
}

export const QuestionSchema = z
  .object({ bulletId: id, text: z.string(), options: z.array(z.string()), kind: QuestionKindSchema })
  .strict();
export type Question = z.infer<typeof QuestionSchema>;

export const RoleQuestionSchema = z
  .object({ id, text: z.string(), options: z.array(z.string().max(60)).max(4), kind: z.literal("role"), topic: RoleTopicSchema.default("other") })
  .strict();
export type RoleQuestion = z.infer<typeof RoleQuestionSchema>;

export const RoleResultSchema = z
  .object({
    roleId: id,
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
    roleQuestions: z.array(RoleQuestionSchema).max(MAX_ROLE_QUESTIONS).default([]),
    /** One bullet or fewer, or too little to infer skills or achievements: focus mode opens with "Tell us about…". */
    thin: z.boolean().default(false),
    /** The language the questions and tips were written in; absent on older results (then: the CV's language). */
    questionLanguage: z.string().optional(),
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

const OTHER_OPTIONS = new Set([
  // en
  "other", "others", "something else", "none of the above", "none of these",
  // ro
  "altele", "altul", "alta", "altceva", "alt răspuns", "niciuna dintre cele de mai sus", "niciunul dintre cele de mai sus", "niciuna dintre acestea",
  // fr
  "autre", "autres", "autre chose", "aucune de ces réponses", "aucun de ces choix",
  // de
  "andere", "anderes", "sonstiges", "etwas anderes", "keine der genannten", "nichts davon",
  // es
  "otro", "otra", "otros", "otras", "otra cosa", "ninguna de las anteriores", "ninguno de los anteriores",
  // it
  "altro", "altra", "altri", "qualcos'altro", "nessuna delle precedenti", "nessuno dei precedenti",
]);

/**
 * An option that only means "other" ("Other", "Altele", "Other (please specify)"). The screen has its own
 * "type or speak your own", so the AI's are dropped.
 */
export function isOtherOption(option: string): boolean {
  const bare = option.trim().toLowerCase().replace(/\s*\([^()]*\)[\p{P}\s]*$/u, "").replace(/[\p{P}\s]+$/u, "").replace(/^[\p{P}\s]+/u, "").trim();
  return OTHER_OPTIONS.has(bare);
}

/** An answer option may hold a number only as a range or a bound, and may not be an "other" option. */
export function isAllowedOption(option: string): boolean {
  if (isOtherOption(option)) return false;
  let rest = option;
  for (const p of RANGE_PATTERNS) rest = rest.replace(p, " ");
  return !/\d/.test(rest);
}

/** Whole-text matches only: these words start real bullets too ("Testing API endpoints"). */
const PLACEHOLDER_WORDS = ["placeholder", "test", "testing", "todo", "tbd", "asdf", "exemplu", "nimic"];
const PLACEHOLDER_PHRASES = ["lorem ipsum", "nothing special", "de completat"];

function blankToNull(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

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
  return PLACEHOLDER_WORDS.includes(t) || PLACEHOLDER_PHRASES.some((p) => t === p || t.startsWith(`${p} `));
}

export function repeatKey(text: string): string {
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

export function buildRoleResult(role: Experience, model: z.input<typeof ModelScoreSchema>, fingerprintValue: string): RoleResult {
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
    const question = keep && issue !== "duplicate" ? blankToNull(m.question) : null;
    if (question !== null) options.set(b.id, m.options.filter(isAllowedOption));
    return {
      id: b.id,
      score: unusable || duplicate ? 0 : bulletScore(m),
      contribution: m.contribution,
      clarity: m.clarity,
      specificity: m.specificity,
      impact: m.impact,
      issue,
      tip: keep ? blankToNull(m.tip) : null,
      question,
    };
  });

  const rank = (x: ResultBullet) => ISSUE_ORDER.indexOf(x.issue);
  const byUrgency = (a: ResultBullet, b: ResultBullet) => rank(a) - rank(b) || a.score - b.score;

  const questions: Question[] = bullets
    .filter((b) => b.question !== null)
    .sort(byUrgency)
    .slice(0, MAX_QUESTIONS)
    .map((b) => ({ bulletId: b.id, text: b.question as string, options: options.get(b.id) ?? [], kind: questionKind(b) }));

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

  const roleQuestions: RoleQuestion[] = (model.roleQuestions ?? []).slice(0, MAX_ROLE_QUESTIONS).map((q, i) => ({
    id: `rq${i + 1}`, text: q.text, options: q.topic === "company" ? [] : q.options.filter(isAllowedOption), kind: "role", topic: q.topic ?? "other",
  }));
  const thin = role.bullets.length <= 1 || model.thin === true;
  return { roleId: role.id, policy: SCORE_POLICY, fingerprint: fingerprintValue, score, bullets, nextStep, questions, roleQuestions, thin };
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

export function hashText(text: string): string {
  return cyrb53(text).toString(36);
}

/**
 * Changes when anything the score depends on changes: bullet ids and texts, title, description, the role's period,
 * locale or policy. The period counts because questions are written for the time the work happened.
 * Ids count because the result points at bullets by id: a bullet deleted and retyped gets a new id.
 */
export function fingerprint(role: Experience, locale: Locale): string {
  const parts = [SCORE_POLICY, locale, role.title, role.description, role.startDate, role.endDate, String(role.current), ...role.bullets.flatMap((b) => [b.id, b.text])];
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

/** Voice answers: at most 60 s per recording, 20 sessions per user per day. */
export const VOICE = { maxSeconds: 60, perDay: 20, model: "gpt-4o-mini-transcribe" } as const;

/**
 * The role description proposed as the last step of a role (3B): at most two sentences, what the company
 * does and what the role was for, never a bullet. `keywords` are the ATS terms it uses. Empty text: skip the step.
 */
export const RoleDescriptionAnswerSchema = z.object({
  text: z.string().max(MAX_LONG_TEXT),
  keywords: z.array(z.string().max(60)).max(8),
}).strict();
export type RoleDescriptionAnswer = z.infer<typeof RoleDescriptionAnswerSchema>;

/** Key achievements suggestions (4A): 3–5 when the roles give enough, each from one role. */
export const AchievementsAnswerSchema = z.object({
  suggestions: z.array(z.object({ text: z.string().min(1).max(2000), roleId: z.string().min(1).max(64) }).strict()).max(5),
}).strict();
export type AchievementsAnswer = z.infer<typeof AchievementsAnswerSchema>;

/** The lighter sections that get suggested lines (3B): no score, no questions. */
export const LIGHT_SECTIONS = ["courses", "awards", "publications", "interests"] as const;
export type LightSection = (typeof LIGHT_SECTIONS)[number];

/** POST /v1/enrich/item-lines: the user's "Tell us about ‹item›" answer for one saved lighter item. */
export const ItemLinesBodySchema = z.object({
  section: z.enum(LIGHT_SECTIONS),
  itemId: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(MAX_LONG_TEXT),
}).strict();
export type ItemLinesBody = z.infer<typeof ItemLinesBodySchema>;

/** Suggested short lines for that item, from its own fields and the answer only. Empty: skip the picks. */
export const ItemLinesAnswerSchema = z.object({ lines: z.array(z.string().min(1).max(200)).max(4) }).strict();
export type ItemLinesAnswer = z.infer<typeof ItemLinesAnswerSchema>;

import { z } from "zod";
import { MAX_LONG_TEXT, type Experience, type Locale } from "./cv.ts";

/** Names the weights and prompt behind a score. Bump it when either changes. */
export const SCORE_POLICY = "score/7";

/** A bullet's five checks. A clear, short bullet with no result scores 80. */
export const WEIGHTS = { contribution: 30, clarity: 20, specificity: 20, impact: 20, concise: 10 } as const;
/** A role's score: this share from its bullets (Lines), the rest from what the role shows a recruiter (Coverage). */
export const LINES_SHARE = 0.6;
/** A bullet longer than the first is at most "partial" on concise; longer than the second is "missing". */
export const CONCISE_CHARS = { partial: 220, missing: 300 } as const;
/** From this score a bullet or a role reads clearly and has nothing waiting. */
export const CLEAR_AT = 80;

export const MAX_QUESTIONS = 20;
/** The longest "what should your CV bring out" text the enrichment path sends with a score request. */
export const MAX_FOCUS = 600;
/** Company, purpose and tools, plus at most 5 more. */
export const MAX_ROLE_QUESTIONS = 8;

/**
 * What a role question is about. The first three are always covered unless the CV or notes already say it.
 * The next four are the conditional parameters: asked when the reviewer cannot tell, or when the page leaves them out.
 */
export const ROLE_TOPICS = ["company", "purpose", "tools", "leadership", "seniority", "people", "domain", "other"] as const;
/** The role topics that are conditional coverage parameters. */
export const CONDITIONAL_TOPICS: readonly RoleTopic[] = ["leadership", "seniority", "people", "domain"];
export const RoleTopicSchema = z.enum(ROLE_TOPICS);
export type RoleTopic = z.infer<typeof RoleTopicSchema>;

export const GradeSchema = z.enum(["missing", "partial", "specific"]);
export type Grade = z.infer<typeof GradeSchema>;

export const IssueSchema = z.enum(["example", "duplicate", "contribution", "clarity", "specificity", "impact", "none"]);
export type Issue = z.infer<typeof IssueSchema>;

/** What a recruiter looks for in a role. Core ones count for every role; conditional ones only when they apply. */
export const CORE_PARAMETERS = ["company", "purpose", "actions", "tools", "results", "scale"] as const;
export const CONDITIONAL_PARAMETERS = ["leadership", "seniority", "people", "domain"] as const;
export type CoverageParameter = (typeof CORE_PARAMETERS)[number] | (typeof CONDITIONAL_PARAMETERS)[number];
/** shown: on the page. applies: the role involves it but the page does not say it. unknown: no clue either way. na: does not apply. */
export const MarkSchema = z.enum(["shown", "applies", "unknown", "na"]);
export type Mark = z.infer<typeof MarkSchema>;
/** The marks the model gives. Actions and results are worked out from the bullet grades instead. */
export const ModelCoverageSchema = z.object({
  company: MarkSchema.default("unknown"),
  purpose: MarkSchema.default("unknown"),
  tools: MarkSchema.default("unknown"),
  scale: MarkSchema.default("unknown"),
  leadership: MarkSchema.default("unknown"),
  seniority: MarkSchema.default("unknown"),
  people: MarkSchema.default("unknown"),
  domain: MarkSchema.default("unknown"),
}).strict();
export type ModelCoverage = z.infer<typeof ModelCoverageSchema>;
const NO_COVERAGE: ModelCoverage = { company: "unknown", purpose: "unknown", tools: "unknown", scale: "unknown", leadership: "unknown", seniority: "unknown", people: "unknown", domain: "unknown" };
/** Coverage is 100 points: each core parameter shown, the conditional ones that apply (shared), and the role's shape. */
export const COVERAGE_POINTS = { core: 10, conditional: 20, amount: 8, repeats: 6, order: 6 } as const;
export const CoverageSchema = z.object({
  score: z.number().int().min(0).max(100),
  marks: z.object({
    company: MarkSchema,
    purpose: MarkSchema,
    actions: MarkSchema,
    tools: MarkSchema,
    results: MarkSchema,
    scale: MarkSchema,
    leadership: MarkSchema,
    seniority: MarkSchema,
    people: MarkSchema,
    domain: MarkSchema,
  }).strict(),
  /** amount: three to six bullets. repeats: no bullet repeats another. order: a bullet with a result comes first. */
  shape: z.object({ amount: z.boolean(), repeats: z.boolean(), order: z.boolean() }).strict(),
}).strict();
export type Coverage = z.infer<typeof CoverageSchema>;

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
    /** Every phrase carries a fact, in two lines at most. Absent (older answers, test doubles) reads as specific. */
    concise: GradeSchema.optional(),
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
    coverage: ModelCoverageSchema.optional(),
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
          /** Absent on results older than score/6: reads as specific. */
          concise: GradeSchema.optional(),
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
    /** The average of the bullets (the role's score before Coverage). Absent on results older than score/6. */
    lines: z.number().int().min(0).max(100).nullable().optional(),
    coverage: CoverageSchema.optional(),
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

export function bulletScore(g: Record<Exclude<keyof typeof WEIGHTS, "concise">, Grade> & { concise?: Grade }): number {
  return Math.round(
    WEIGHTS.contribution * MULTIPLIER[g.contribution] +
      WEIGHTS.clarity * MULTIPLIER[g.clarity] +
      WEIGHTS.specificity * MULTIPLIER[g.specificity] +
      WEIGHTS.impact * MULTIPLIER[g.impact] +
      // A bullet that does not say what the person did earns nothing for being short.
      (g.contribution === "missing" ? 0 : WEIGHTS.concise * MULTIPLIER[g.concise ?? "specific"]),
  );
}

/** The model's concise grade, capped by length: a long bullet is not concise however it is worded. */
export function conciseGrade(text: string, grade: Grade): Grade {
  const length = text.trim().length;
  if (length > CONCISE_CHARS.missing) return "missing";
  if (length > CONCISE_CHARS.partial && grade === "specific") return "partial";
  return grade;
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

/** What the role shows a recruiter, as points. Actions and results come from the bullet grades; the rest from the model's marks. */
export function buildCoverage(bullets: readonly ResultBullet[], model: ModelCoverage): Coverage {
  const real = bullets.filter((b) => b.issue !== "example" && b.issue !== "duplicate");
  // The four that always apply are either on the page or not.
  const core = (mark: Mark): Mark => (mark === "shown" ? "shown" : "applies");
  const marks: Coverage["marks"] = {
    ...model,
    company: core(model.company),
    purpose: core(model.purpose),
    tools: core(model.tools),
    scale: core(model.scale),
    actions: real.length > 0 && real.filter((b) => b.contribution === "specific").length * 2 >= real.length ? "shown" : "applies",
    results: real.some((b) => b.impact === "specific") ? "shown" : "applies",
  };
  const shape = {
    amount: real.length >= 3 && real.length <= 6,
    repeats: !bullets.some((b) => b.issue === "duplicate"),
    order: real[0]?.impact === "specific",
  };
  const applies = CONDITIONAL_PARAMETERS.filter((p) => marks[p] !== "na");
  const conditional = applies.length === 0 ? COVERAGE_POINTS.conditional
    : Math.round((COVERAGE_POINTS.conditional * applies.filter((p) => marks[p] === "shown").length) / applies.length);
  const score = CORE_PARAMETERS.filter((p) => marks[p] === "shown").length * COVERAGE_POINTS.core + conditional
    + (shape.amount ? COVERAGE_POINTS.amount : 0) + (shape.repeats ? COVERAGE_POINTS.repeats : 0) + (shape.order ? COVERAGE_POINTS.order : 0);
  return { score, marks, shape };
}

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
    const concise = conciseGrade(b.text, m.concise ?? "specific");
    const keep = issue === m.issue;
    const question = keep && issue !== "duplicate" ? blankToNull(m.question) : null;
    if (question !== null) options.set(b.id, m.options.filter(isAllowedOption));
    return {
      id: b.id,
      score: unusable || duplicate ? 0 : bulletScore({ ...m, concise }),
      contribution: m.contribution,
      clarity: m.clarity,
      specificity: m.specificity,
      impact: m.impact,
      concise,
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

  // Lines: the bullets' average. The role's score adds what the role shows a recruiter (Coverage).
  const lines = bullets.length === 0 ? null : Math.round(bullets.reduce((sum, b) => sum + b.score, 0) / bullets.length);
  const coverage = buildCoverage(bullets, { ...NO_COVERAGE, ...model.coverage });
  const score = lines === null ? null : Math.round(LINES_SHARE * lines + (1 - LINES_SHARE) * coverage.score);

  const roleQuestions: RoleQuestion[] = (model.roleQuestions ?? []).slice(0, MAX_ROLE_QUESTIONS).map((q, i) => ({
    id: `rq${i + 1}`, text: q.text, options: q.topic === "company" ? [] : q.options.filter(isAllowedOption), kind: "role", topic: q.topic ?? "other",
  }));
  const thin = role.bullets.length <= 1 || model.thin === true;
  return { roleId: role.id, policy: SCORE_POLICY, fingerprint: fingerprintValue, score, bullets, nextStep, questions, roleQuestions, thin, lines, coverage };
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
  if (score >= CLEAR_AT) return "clear";
  if (score >= 40) return "goodStart";
  return "needsWork";
}

export function clearCount(result: Pick<RoleResult, "bullets">): { clear: number; total: number } {
  return { clear: result.bullets.filter((b) => b.score >= CLEAR_AT).length, total: result.bullets.length };
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

/** The model's part of stored marks. Actions and results are left out: they are worked out again from the bullets. */
export function modelMarks(coverage: Coverage): ModelCoverage {
  const { company, purpose, tools, scale, leadership, seniority, people, domain } = coverage.marks;
  return { company, purpose, tools, scale, leadership, seniority, people, domain };
}

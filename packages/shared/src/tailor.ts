import { z } from "zod";
import { CvContentSchema, findScored, type CvContent, type Experience } from "./cv.ts";

export const TailorLanguageSchema = z.enum(["ro", "en", "fr", "de", "es", "it"]);
export type TailorLanguage = z.infer<typeof TailorLanguageSchema>;

export const TONES = ["formal", "neutral", "confident", "concise", "warm", "technical", "executive"] as const;
export const ToneSchema = z.enum(TONES);
export type Tone = z.infer<typeof ToneSchema>;

export const STEERING_DRAWS = ["work", "company", "step_up", "location_pay", "other"] as const;
export const STEERING_FITS = ["very_well", "mostly", "stretch"] as const;

/** The user's steering answers (round 2): every field optional. */
export const SteeringSchema = z.object({
  tone: ToneSchema.optional(),
  draws: z.array(z.enum(STEERING_DRAWS)).optional(),
  fit: z.enum(STEERING_FITS).nullable().optional(),
  focusRoleIds: z.array(z.string()).optional(),
  instruction: z.string().max(500).optional(),
});
export type Steering = z.infer<typeof SteeringSchema>;

export const TAILOR_SECTIONS = ["experience", "projects", "skills", "summary", "achievements", "languages", "layout"] as const;
export const TailorSectionSchema = z.enum(TAILOR_SECTIONS);
export type TailorSection = z.infer<typeof TailorSectionSchema>;

/** Steps tailored item by item, like roles: Experience, and Projects & volunteering. */
export type RoleSection = "experience" | "projects";
export const isRoleSection = (section: TailorSection | null | undefined): section is RoleSection =>
  section === "experience" || section === "projects";

type Scored = Pick<CvContent, "experience" | "projects" | "volunteering">;
/** A role step's items in CV order: the roles, or the projects then the volunteering roles. */
export function stepItems(cv: Scored, section: TailorSection): Experience[] {
  if (section === "experience") return cv.experience;
  if (section === "projects") return [...cv.projects, ...cv.volunteering];
  return [];
}
/** The role step an item belongs to (projects and volunteering share one), or null when it isn't in the CV. */
export function stepOf(cv: Scored, id: string): RoleSection | null {
  const found = findScored(cv, id);
  return !found ? null : found.kind === "role" ? "experience" : "projects";
}
/** The steps a run over this CV covers, in order: Projects & volunteering only when the CV has some. */
export function runSections(cv: Scored, picked: readonly TailorSection[] = TAILOR_SECTIONS): TailorSection[] {
  return TAILOR_SECTIONS.filter((section) => picked.includes(section) && (section !== "projects" || stepItems(cv, section).length > 0));
}
/** One item order for a run's role steps (roles, then projects, then volunteering) and the item it starts on. */
export function runItems(cv: Scored, sections: readonly TailorSection[]): { roleOrder: string[]; currentRoleId: string | null } {
  const roleOrder = sections.filter(isRoleSection).flatMap((section) => stepItems(cv, section).map((item) => item.id));
  const first = sections[0];
  return { roleOrder, currentRoleId: isRoleSection(first) ? stepItems(cv, first)[0]?.id ?? null : null };
}
/** A role step's own order: the run's item order, kept to the items of that step still in the CV. */
export function stepOrder(run: Pick<TailorRun, "roleOrder">, cv: Scored, section: TailorSection): string[] {
  const ids = new Set(stepItems(cv, section).map((item) => item.id));
  return (run.roleOrder ?? []).filter((id) => ids.has(id));
}

export const MatchLabelSchema = z.object({
  ref: z.string(),
  kind: z.enum(["requirement", "keyword"]),
  status: z.enum(["met", "partial", "missing"]),
  evidence: z.string().nullable(),
  inferred: z.boolean(),
});
export type MatchLabel = z.infer<typeof MatchLabelSchema>;

export const MatchScoreSchema = z.object({
  policy: z.literal("match/1"),
  total: z.number().nullable(),
  band: z.enum(["excellent", "strong", "fair", "low"]).nullable(),
  parts: z.record(
    z.enum(["requirements", "keywords", "seniority", "langEdu"]),
    z.object({ points: z.number(), max: z.number() }).nullable(),
  ),
  capped: z.boolean(),
  labels: z.array(MatchLabelSchema),
});
export type MatchScore = z.infer<typeof MatchScoreSchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  section: TailorSectionSchema,
  roleId: z.string().nullable(),
  text: z.string(),
  kind: z.enum(["options", "confirm_inferred", "flag", "skill"]),
  options: z.array(z.string()),
  reason: z.string(),
  /** The Score 1 gap a job question is about ("r0", "k:SQL"), so a topic isn't asked again in other words. */
  gap: z.string().optional(),
  /** A flag question's proposal key (its item id, or "new-skill:<text>"). */
  itemId: z.string().optional(),
  /** The bullet a role question points at; absent = the whole role. */
  bulletId: z.string().optional(),
  /** A Skills question's one skill ("SQL"): its answer becomes "Used SQL" on the roles picked. */
  skill: z.string().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const AnswerSchema = z.object({
  questionId: z.string(),
  value: z.string().nullable(),
  via: z.enum(["option", "typed", "voice", "skip"]),
  /** The roles a confirmed skill was used in. */
  roleIds: z.array(z.string()).optional(),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const FlagSchema = z.object({
  /** "guess": an inferred change without a reason naming its basis. */
  rule: z.enum(["number", "entity", "tool", "achievement", "guess"]),
  detail: z.string(),
});
export type Flag = z.infer<typeof FlagSchema>;

export const ProposalSchema = z.object({
  itemId: z.string(),
  field: z.string(),
  text: z.string(),
  inferred: z.boolean(),
  flags: z.array(FlagSchema),
  /** Where the CV shows it: a new skill's reason, or why the AI guessed an inferred change. */
  reason: z.string().optional(),
  /** Guessed spans inside a summary, each with why the AI guessed it. */
  guesses: z.array(z.object({ text: z.string(), reason: z.string() })).optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;
export type Guess = NonNullable<Proposal["guesses"]>[number];

/**
 * Where each guess sits in the text, in text order: its first occurrence that doesn't overlap an earlier
 * guess. A guess not found verbatim is left out. Placing the result again gives the same spans.
 */
export function placeGuesses(text: string, guesses: Guess[]): Array<Guess & { start: number; end: number }> {
  const placed: Array<Guess & { start: number; end: number }> = [];
  for (const guess of guesses) {
    if (!guess.text) continue;
    for (let at = text.indexOf(guess.text); at >= 0; at = text.indexOf(guess.text, at + 1)) {
      const end = at + guess.text.length;
      if (placed.every((p) => end <= p.start || at >= p.end)) { placed.push({ ...guess, start: at, end }); break; }
    }
  }
  return placed.sort((a, b) => a.start - b.start);
}

/** One guess's answer: Keep (optionally with the edited text) or Remove. Undecided guesses stay as they are. */
export type GuessChoice = { keep: boolean; text?: string };

/** The text after its placed guesses are decided: a removed one is cut out, an edited one takes the typed text. */
export function applyGuesses(text: string, guesses: Guess[], choices: Array<GuessChoice | undefined>): string {
  const spans = placeGuesses(text, guesses);
  let out = text;
  // From the last guess back, so the earlier positions stay valid.
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i]!;
    const choice = choices[i];
    if (!choice) continue;
    if (choice.keep) { out = out.slice(0, span.start) + (choice.text ?? span.text) + out.slice(span.end); continue; }
    const left = out.slice(0, span.start).replace(/\s+$/, "");
    const right = out.slice(span.end).replace(/^\s+/, "");
    out = left && right && !/^[,.;:!?]/.test(right) ? `${left} ${right}` : left + right;
  }
  return out;
}

export const CoverLetterSchema = z.object({
  body: z.string().max(4000),
  hiringManager: z.string().nullable(),
  whyCompany: z.string().nullable(),
  generatedAt: z.iso.datetime(),
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

export const TailorRunSchema = z.object({
  id: z.string(),
  userId: z.string(),
  jobId: z.string(),
  tailoredCvId: z.string().nullable(),
  kind: z.enum(["tailor", "retailor", "section", "translate", "cover_letter"]),
  sections: z.array(TailorSectionSchema),
  status: z.enum(["running", "waiting_user", "done", "failed"]),
  currentSection: TailorSectionSchema.nullable(),
  questions: z.array(QuestionSchema).nullable(),
  answers: z.array(AnswerSchema).nullable(),
  proposals: z.array(ProposalSchema).nullable(),
  errorCode: z.string().nullable(),
  /** Experience roles in CV order, tailored one at a time. */
  roleOrder: z.array(z.string()).optional(),
  currentRoleId: z.string().nullable().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type TailorRun = z.infer<typeof TailorRunSchema>;

export const TailoredCvSchema = z.object({
  id: z.string(),
  userId: z.string(),
  jobId: z.string(),
  language: TailorLanguageSchema,
  translatedFrom: z.string().nullable(),
  content: CvContentSchema,
  baseSnapshot: CvContentSchema,
  baseSnapshotAt: z.iso.datetime({ offset: true }),
  template: z.enum(["classic", "modern", "compact"]),
  tone: ToneSchema.nullable(),
  instruction: z.string().nullable(),
  review: z.record(z.string(), z.unknown()).nullable(),
  score: MatchScoreSchema.nullable(),
  coverLetter: CoverLetterSchema.nullable(),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type TailoredCv = z.infer<typeof TailoredCvSchema>;

import { z } from "zod";
import { CvContentSchema } from "./cv.ts";

export const TailorLanguageSchema = z.enum(["ro", "en", "fr", "de", "es", "it"]);
export type TailorLanguage = z.infer<typeof TailorLanguageSchema>;

export const ToneSchema = z.enum(["formal", "neutral", "confident"]);
export type Tone = z.infer<typeof ToneSchema>;

export const TAILOR_SECTIONS = ["experience", "skills", "summary", "achievements", "languages", "layout"] as const;
export const TailorSectionSchema = z.enum(TAILOR_SECTIONS);
export type TailorSection = z.infer<typeof TailorSectionSchema>;

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
  kind: z.enum(["options", "confirm_inferred", "flag"]),
  options: z.array(z.string()),
  reason: z.string(),
  /** The Score 1 gap a job question is about ("r0", "k:SQL"), so a topic isn't asked again in other words. */
  gap: z.string().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const AnswerSchema = z.object({
  questionId: z.string(),
  value: z.string().nullable(),
  via: z.enum(["option", "typed", "voice", "skip"]),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const FlagSchema = z.object({
  rule: z.enum(["number", "entity", "tool", "achievement"]),
  detail: z.string(),
});
export type Flag = z.infer<typeof FlagSchema>;

export const ProposalSchema = z.object({
  itemId: z.string(),
  field: z.string(),
  text: z.string(),
  inferred: z.boolean(),
  flags: z.array(FlagSchema),
});
export type Proposal = z.infer<typeof ProposalSchema>;

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

import { describe, expect, it } from "vitest";
import { emptyCv } from "./cv.ts";
import {
  AnswerSchema, CoverLetterSchema, FlagSchema, MatchLabelSchema, MatchScoreSchema,
  ProposalSchema, TailorQuestionSchema as QuestionSchema, TAILOR_SECTIONS, TailoredCvSchema, TailorLanguageSchema,
  SteeringSchema, TailorRunSchema, TailorSectionSchema, ToneSchema,
} from "./index.ts";

const generatedAt = "2026-11-08T10:00:00Z";
const label = { ref: "r0", kind: "requirement", status: "met", evidence: "TypeScript", inferred: false };
const score = {
  policy: "match/1", total: 90, band: "excellent", capped: false, labels: [label],
  parts: { requirements: { points: 1, max: 50 }, keywords: null, seniority: null, langEdu: null },
};
const question = {
  id: "q1", section: "experience", roleId: "role1", text: "Have you used TypeScript?",
  kind: "options", options: ["Yes", "No"], reason: "The job requires TypeScript.",
};
const answer = { questionId: "q1", value: "Yes", via: "option" };
const flag = { rule: "number", detail: "Confirm the 30% improvement." };
const proposal = { itemId: "bullet1", field: "text", text: "Improved performance.", inferred: false, flags: [flag] };
const letter = { body: "I would like to join your team.", hiringManager: null, whyCompany: null, generatedAt };
const run = {
  id: "run1", userId: "user1", jobId: "job1", tailoredCvId: null, kind: "tailor",
  sections: ["experience"], status: "waiting_user", currentSection: "experience",
  questions: [question], answers: [answer], proposals: [proposal], errorCode: null,
  createdAt: generatedAt, updatedAt: generatedAt,
};
const tailoredCv = {
  id: "cv1", userId: "user1", jobId: "job1", language: "en", translatedFrom: null,
  content: emptyCv(), baseSnapshot: emptyCv(), baseSnapshotAt: generatedAt,
  template: "classic", tone: "neutral", instruction: null, review: null, score,
  coverLetter: letter, version: 1, createdAt: generatedAt, updatedAt: generatedAt,
};

describe("tailoring schemas", () => {
  it.each([
    ["TailorLanguageSchema", TailorLanguageSchema, "en", "nl"],
    ["ToneSchema", ToneSchema, "neutral", "casual"],
    ["TailorSectionSchema", TailorSectionSchema, "experience", "education"],
    ["MatchLabelSchema", MatchLabelSchema, label, { ...label, status: "unknown" }],
    ["MatchScoreSchema", MatchScoreSchema, score, { ...score, policy: "match/2" }],
    ["QuestionSchema", QuestionSchema, question, { ...question, kind: "freeform" }],
    ["AnswerSchema", AnswerSchema, answer, { ...answer, via: "email" }],
    ["FlagSchema", FlagSchema, flag, { ...flag, rule: "unknown" }],
    ["ProposalSchema", ProposalSchema, proposal, { ...proposal, inferred: "yes" }],
    ["CoverLetterSchema", CoverLetterSchema, letter, { ...letter, generatedAt: "yesterday" }],
    ["TailorRunSchema", TailorRunSchema, run, { ...run, status: "queued" }],
    ["TailoredCvSchema", TailoredCvSchema, tailoredCv, { ...tailoredCv, template: "unknown" }],
  ] as const)("%s accepts a valid sample and rejects a bad field", (_name, schema, valid, invalid) => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse(invalid).success).toBe(false);
  });

  it("accepts the six languages, three tones, and sections in flow order", () => {
    for (const language of ["ro", "en", "fr", "de", "es", "it"]) {
      expect(TailorLanguageSchema.safeParse(language).success).toBe(true);
    }
    for (const tone of ["formal", "neutral", "confident"]) {
      expect(ToneSchema.safeParse(tone).success).toBe(true);
    }
    expect(TAILOR_SECTIONS).toEqual(["experience", "skills", "summary", "achievements", "languages", "layout"]);
    for (const section of TAILOR_SECTIONS) expect(TailorSectionSchema.safeParse(section).success).toBe(true);
  });

  it("accepts unavailable scores and enforces the component names and values", () => {
    expect(MatchScoreSchema.safeParse({
      ...score, total: null, band: null, labels: [],
      parts: { requirements: null, keywords: null, seniority: null, langEdu: null },
    }).success).toBe(true);
    expect(MatchScoreSchema.safeParse({ ...score, parts: { requirements: null } }).success).toBe(false);
    expect(MatchScoreSchema.safeParse({ ...score, parts: { ...score.parts, other: null } }).success).toBe(false);
    expect(MatchScoreSchema.safeParse({
      ...score, parts: { ...score.parts, keywords: { points: "many", max: 30 } },
    }).success).toBe(false);
    expect(MatchLabelSchema.safeParse({ ...label, evidence: null }).success).toBe(true);
  });

  it("accepts skipped answers and questions without a role", () => {
    expect(AnswerSchema.safeParse({ questionId: "q1", value: null, via: "skip" }).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...question, roleId: null, options: [] }).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...question, options: [1] }).success).toBe(false);
    expect(ProposalSchema.safeParse({ ...proposal, flags: [{ ...flag, detail: 1 }] }).success).toBe(false);
  });

  it("limits cover letter bodies to 4000 characters", () => {
    expect(CoverLetterSchema.safeParse({ ...letter, body: "x".repeat(4000) }).success).toBe(true);
    expect(CoverLetterSchema.safeParse({ ...letter, body: "x".repeat(4001) }).success).toBe(false);
  });

  it("accepts runs before questions, answers, and proposals exist", () => {
    expect(TailorRunSchema.safeParse({
      ...run, currentSection: null, questions: null, answers: null, proposals: null,
    }).success).toBe(true);
    expect(TailorRunSchema.safeParse({ ...run, sections: ["education"] }).success).toBe(false);
    expect(TailorRunSchema.safeParse({ ...run, questions: [{ ...question, kind: "unknown" }] }).success).toBe(false);
  });

  it("validates both CV documents and a nullable cover letter", () => {
    expect(TailoredCvSchema.safeParse({ ...tailoredCv, tone: null, score: null, coverLetter: null }).success).toBe(true);
    for (const invalid of [
      { content: {} }, { baseSnapshot: {} }, { version: 0 },
      { coverLetter: { ...letter, body: "x".repeat(4001) } },
    ]) {
      expect(TailoredCvSchema.safeParse({ ...tailoredCv, ...invalid }).success).toBe(false);
    }
  });
});

describe("tailoring round 2 schemas", () => {
  it("still parses an old run without roleOrder or currentRoleId", () => {
    const parsed = TailorRunSchema.parse(run);
    expect(parsed.roleOrder).toBeUndefined();
    expect(TailorRunSchema.safeParse({ ...run, roleOrder: ["role1", "role2"], currentRoleId: "role1" }).success).toBe(true);
    expect(TailorRunSchema.safeParse({ ...run, currentRoleId: null }).success).toBe(true);
  });

  it("accepts the seven tones and rejects bold", () => {
    for (const tone of ["formal", "neutral", "confident", "concise", "warm", "technical", "executive"]) {
      expect(ToneSchema.safeParse(tone).success).toBe(true);
    }
    expect(ToneSchema.safeParse("bold").success).toBe(false);
  });

  it("accepts steering with every field optional and caps the instruction at 500 characters", () => {
    expect(SteeringSchema.safeParse({}).success).toBe(true);
    expect(SteeringSchema.safeParse({
      tone: "warm", draws: ["work", "step_up"], fit: "mostly", focusRoleIds: ["role1"], instruction: "x".repeat(500),
    }).success).toBe(true);
    expect(SteeringSchema.safeParse({ fit: null }).success).toBe(true);
    expect(SteeringSchema.safeParse({ instruction: "x".repeat(501) }).success).toBe(false);
    expect(SteeringSchema.safeParse({ draws: ["money"] }).success).toBe(false);
    expect(SteeringSchema.safeParse({ fit: "perfect" }).success).toBe(false);
  });

  it("accepts a skill question with no role, and a role question that points at one bullet", () => {
    expect(QuestionSchema.safeParse({ ...question, section: "skills", kind: "skill", roleId: null }).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...question, bulletId: "b1" }).success).toBe(true);
  });

  it("accepts answers with the roles a skill was used in, and proposals with guesses", () => {
    expect(AnswerSchema.safeParse({ ...answer, roleIds: ["role1", "role2"] }).success).toBe(true);
    expect(ProposalSchema.safeParse({
      ...proposal, inferred: true, reason: "From your Hamburg role.",
      guesses: [{ text: "cross-border teams", reason: "Roles in Hamburg and Bucharest." }],
    }).success).toBe(true);
    expect(ProposalSchema.safeParse({ ...proposal, guesses: [{ text: "x" }] }).success).toBe(false);
  });
});

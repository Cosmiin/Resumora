import { z } from "zod";
import { SECTION_KEYS, type SectionKey } from "./categories.ts";

/** Max serialized size of a CV body accepted by the API. */
export const MAX_CV_BYTES = 256 * 1024;

/** Limits shared by the schema and the editor UI. */
export const MAX_ITEMS = 40;
export const MAX_BULLETS = 20;
export const MAX_TEXT = 2000;
export const MAX_LONG_TEXT = 4000;
export const MAX_TITLES = 2;
export const MAX_ACHIEVEMENTS = 10;
export const MAX_NOTES = 25;

const text = (max = MAX_TEXT) => z.string().max(max);
const id = z.string().min(1).max(64);

/** "YYYY-MM", "YYYY" (month unknown) or "" (unknown / not set). */
export const YearMonthSchema = z
  .string()
  .regex(/^(\d{4}(-(0[1-9]|1[0-2]))?)?$/, "Use YYYY-MM or YYYY");

export const BulletSchema = z.object({ id, text: text() }).strict();

/** The person's answer to a question about a role. Stored hidden in the CV, never rendered. */
export const NoteSchema = z
  .object({
    id,
    question: text(MAX_TEXT),
    answer: text(MAX_LONG_TEXT),
    /** How the answer was given: a tapped option, typed words, or voice. */
    via: z.array(z.enum(["pick", "type", "voice"])).min(1).max(3),
    askedAt: z.iso.datetime(),
  })
  .strict();

export const RoleFactsSchema = z
  .object({ items: z.array(text(160)).max(8), fromNotes: z.string(), updatedAt: z.iso.datetime() })
  .strict();
export type RoleFacts = z.infer<typeof RoleFactsSchema>;

export const ExperienceSchema = z
  .object({
    id,
    company: text(),
    title: text(),
    location: text(),
    startDate: YearMonthSchema,
    endDate: YearMonthSchema,
    current: z.boolean(),
    /** Short statement of the role's scope, kept word for word from the CV. */
    description: text(MAX_LONG_TEXT),
    bullets: z.array(BulletSchema).max(MAX_BULLETS),
    notes: z.array(NoteSchema).max(MAX_NOTES).default([]),
    facts: RoleFactsSchema.nullable().optional(),
  })
  .strict();

export const EducationSchema = z
  .object({
    id,
    school: text(),
    degree: text(),
    field: text(),
    startDate: YearMonthSchema,
    endDate: YearMonthSchema,
    notes: text(),
  })
  .strict();

export const SkillSchema = z.object({ id, name: text() }).strict();

/**
 * The owner's skill structure:
 * - technicalSkills: tools, software, programming languages, platforms, technologies
 * - professionalSkills: work capabilities, domain expertise, interpersonal and self-management skills
 * - unclearSkills: too vague to classify; kept and shown for the user to sort
 */
export type SkillGroup = "technicalSkills" | "professionalSkills" | "unclearSkills";
export const SKILL_GROUPS: readonly SkillGroup[] = ["technicalSkills", "professionalSkills", "unclearSkills"];

export const LanguageSchema = z.object({ id, name: text(), level: text() }).strict();
export const CertificationSchema = z
  .object({ id, name: text(), issuer: text(), date: YearMonthSchema })
  .strict();
export const ProjectSchema = z
  .object({ id, name: text(), description: text(MAX_LONG_TEXT), url: text() })
  .strict();
/** A section that fits nowhere else, keeping the CV's own heading. */
export const CustomSectionSchema = z
  .object({ id, title: text(), details: text(MAX_LONG_TEXT) })
  .strict();

export const BasicsSchema = z
  .object({
    /** Exactly as written on the CV. */
    fullName: text(),
    /** Filled only when clear from the CV; otherwise "". */
    firstName: text(),
    lastName: text(),
    titles: z.array(text()).max(MAX_TITLES),
    email: text(),
    phone: text(),
    location: text(),
    website: text(),
    linkedin: text(),
    summary: text(MAX_LONG_TEXT),
  })
  .strict();

const sectionKey = z.enum(SECTION_KEYS as unknown as [SectionKey, ...SectionKey[]]);

export const AwardSchema = z
  .object({ id, name: text(), issuer: text(), date: YearMonthSchema, description: text(MAX_LONG_TEXT) })
  .strict();
export const CourseSchema = z.object({ id, name: text(), provider: text(), date: YearMonthSchema }).strict();
export const PublicationSchema = z
  .object({ id, title: text(), publisher: text(), date: YearMonthSchema, url: text() })
  .strict();
export const InterestSchema = z.object({ id, name: text() }).strict();

/** Section order, hidden sections and custom headings of a CV. */
export const LayoutSchema = z
  .object({
    order: z.array(sectionKey).max(SECTION_KEYS.length),
    hidden: z.array(sectionKey).max(SECTION_KEYS.length),
    titles: z.partialRecord(sectionKey, text()),
  })
  .strict();
export type Layout = z.infer<typeof LayoutSchema>;

export function defaultLayout(): Layout {
  return { order: [...SECTION_KEYS], hidden: [], titles: {} };
}

const v1Shape = {
  locale: z.enum(["en", "ro"]),
  basics: BasicsSchema,
  experience: z.array(ExperienceSchema).max(MAX_ITEMS),
  education: z.array(EducationSchema).max(MAX_ITEMS),
  technicalSkills: z.array(SkillSchema).max(MAX_ITEMS),
  professionalSkills: z.array(SkillSchema).max(MAX_ITEMS),
  unclearSkills: z.array(SkillSchema).max(MAX_ITEMS),
  languages: z.array(LanguageSchema).max(MAX_ITEMS),
  certifications: z.array(CertificationSchema).max(MAX_ITEMS),
  projects: z.array(ProjectSchema).max(MAX_ITEMS),
  custom: z.array(CustomSectionSchema).max(MAX_ITEMS),
};

/** The first stored format; still readable, upgraded to v2 on read. */
export const CvContentV1Schema = z.object({ schemaVersion: z.literal(1), ...v1Shape }).strict();

export const CvContentSchema = z
  .object({
    schemaVersion: z.literal(2),
    ...v1Shape,
    achievements: z.array(BulletSchema).max(MAX_ACHIEVEMENTS),
    volunteering: z.array(ExperienceSchema).max(MAX_ITEMS),
    awards: z.array(AwardSchema).max(MAX_ITEMS),
    courses: z.array(CourseSchema).max(MAX_ITEMS),
    publications: z.array(PublicationSchema).max(MAX_ITEMS),
    interests: z.array(InterestSchema).max(MAX_ITEMS),
    layout: LayoutSchema,
  })
  .strict();

export type CvContent = z.infer<typeof CvContentSchema>;
export type CvContentV1 = z.infer<typeof CvContentV1Schema>;
export type Note = z.infer<typeof NoteSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Bullet = z.infer<typeof BulletSchema>;
export type Award = z.infer<typeof AwardSchema>;
export type Course = z.infer<typeof CourseSchema>;
export type Publication = z.infer<typeof PublicationSchema>;
export type Interest = z.infer<typeof InterestSchema>;
export type Locale = CvContent["locale"];

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyCv(locale: Locale = "en"): CvContent {
  return {
    schemaVersion: 2,
    locale,
    basics: {
      fullName: "",
      firstName: "",
      lastName: "",
      titles: [],
      email: "",
      phone: "",
      location: "",
      website: "",
      linkedin: "",
      summary: "",
    },
    experience: [],
    education: [],
    technicalSkills: [],
    professionalSkills: [],
    unclearSkills: [],
    languages: [],
    certifications: [],
    projects: [],
    custom: [],
    achievements: [],
    volunteering: [],
    awards: [],
    courses: [],
    publications: [],
    interests: [],
    layout: defaultLayout(),
  };
}

import { z } from "zod";

/** Max serialized size of a CV body accepted by the API. */
export const MAX_CV_BYTES = 256 * 1024;

const MAX_ITEMS = 40;
const MAX_BULLETS = 20;

const text = (max = 2000) => z.string().max(max);
const id = z.string().min(1).max(64);

/** "YYYY-MM" or "" (unknown / not set). */
export const YearMonthSchema = z.string().regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/, "Use YYYY-MM");

export const BulletSchema = z.object({ id, text: text() }).strict();

export const ExperienceSchema = z
  .object({
    id,
    company: text(),
    title: text(),
    location: text(),
    startDate: YearMonthSchema,
    endDate: YearMonthSchema,
    current: z.boolean(),
    bullets: z.array(BulletSchema).max(MAX_BULLETS),
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

export const SkillSchema = z.object({ id, name: text(), category: text() }).strict();
export const LanguageSchema = z.object({ id, name: text(), level: text() }).strict();
export const CertificationSchema = z
  .object({ id, name: text(), issuer: text(), date: YearMonthSchema })
  .strict();
export const ProjectSchema = z
  .object({ id, name: text(), description: text(4000), url: text() })
  .strict();

export const BasicsSchema = z
  .object({
    fullName: text(),
    headline: text(),
    email: text(),
    phone: text(),
    location: text(),
    website: text(),
    linkedin: text(),
    summary: text(4000),
  })
  .strict();

export const CvContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.enum(["en", "ro"]),
    basics: BasicsSchema,
    experience: z.array(ExperienceSchema).max(MAX_ITEMS),
    education: z.array(EducationSchema).max(MAX_ITEMS),
    skills: z.array(SkillSchema).max(MAX_ITEMS),
    languages: z.array(LanguageSchema).max(MAX_ITEMS),
    certifications: z.array(CertificationSchema).max(MAX_ITEMS),
    projects: z.array(ProjectSchema).max(MAX_ITEMS),
  })
  .strict();

export type CvContent = z.infer<typeof CvContentSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Locale = CvContent["locale"];

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyCv(locale: Locale = "en"): CvContent {
  return {
    schemaVersion: 1,
    locale,
    basics: {
      fullName: "",
      headline: "",
      email: "",
      phone: "",
      location: "",
      website: "",
      linkedin: "",
      summary: "",
    },
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    projects: [],
  };
}

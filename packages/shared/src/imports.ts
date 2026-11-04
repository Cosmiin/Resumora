import { z } from "zod";
import {
  CvContentSchema,
  MAX_BULLETS,
  MAX_ITEMS,
  MAX_LONG_TEXT,
  MAX_TEXT,
  MAX_TITLES,
  SKILL_GROUPS,
  YearMonthSchema,
  defaultLayout,
  emptyCv,
  newId,
  type CvContent,
  type Skill,
} from "./cv.ts";
import { StoredCvSchema } from "./upgrade.ts";

/** "Is this a CV?" — the first, cheap AI step of an import. */
export const AdmitSchema = z.object({ kind: z.enum(["cv", "not_cv", "uncertain"]), reason: z.string() }).strict();
export type Admit = z.infer<typeof AdmitSchema>;

const s = z.string();

/**
 * What the extraction model returns: the CV shape without ids, with plain strings for skills and
 * bullets. Deliberately no length limits, so over-long output is trimmed (with a warning) rather
 * than rejected and retried. Every field is required, as structured output needs.
 */
export const ImportDraftSchema = z
  .object({
    detectedLocale: z.enum(["en", "ro", "other"]),
    warnings: z.array(s),
    basics: z
      .object({
        fullName: s, firstName: s, lastName: s, titles: z.array(s),
        email: s, phone: s, location: s, website: s, linkedin: s, summary: s,
      })
      .strict(),
    experience: z.array(
      z
        .object({
          company: s, title: s, location: s, startDate: s, endDate: s,
          current: z.boolean(), description: s, bullets: z.array(s),
        })
        .strict(),
    ),
    education: z.array(z.object({ school: s, degree: s, field: s, startDate: s, endDate: s, notes: s }).strict()),
    technicalSkills: z.array(s),
    professionalSkills: z.array(s),
    unclearSkills: z.array(s),
    languages: z.array(z.object({ name: s, level: s }).strict()),
    certifications: z.array(z.object({ name: s, issuer: s, date: s }).strict()),
    projects: z.array(z.object({ name: s, description: s, url: s }).strict()),
    custom: z.array(z.object({ title: s, details: s }).strict()),
  })
  .strict();
export type ImportDraft = z.infer<typeof ImportDraftSchema>;

export function emptyDraft(): ImportDraft {
  const { basics } = emptyCv();
  return {
    detectedLocale: "en", warnings: [], basics,
    experience: [], education: [], technicalSkills: [], professionalSkills: [], unclearSkills: [],
    languages: [], certifications: [], projects: [], custom: [],
  };
}

/** What a finished import holds, ready for review. */
export const ImportResultSchema = z.object({
  content: StoredCvSchema,
  warnings: z.array(z.string().max(500)).max(50),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

/**
 * Turns the model's draft into valid CV content: adds ids, keeps lists and texts within the CV
 * limits, removes duplicate skills, clears dates that aren't YYYY-MM or YYYY. Everything left out
 * is reported in `warnings`, never dropped silently.
 */
export function toCvContent(draft: ImportDraft): ImportResult {
  const warnings = draft.warnings.map((w) => w.slice(0, 500));
  const warn = (w: string) => {
    if (!warnings.includes(w)) warnings.push(w);
  };

  const list = <T>(items: T[], label: string, max = MAX_ITEMS): T[] => {
    if (items.length > max) warn(`Only the first ${max} ${label} were kept.`);
    return items.slice(0, max);
  };
  const clip = (value: string, label: string, max = MAX_TEXT): string => {
    if (value.length > max) warn(`Some text in ${label} was too long and was shortened.`);
    return value.slice(0, max);
  };
  const date = (value: string, label: string): string => {
    const v = value.trim();
    if (YearMonthSchema.safeParse(v).success) return v;
    warn(`A date in ${label} wasn't clear, so it was left empty.`);
    return "";
  };

  const b = draft.basics;
  if (b.titles.length > MAX_TITLES) warn(`Only the first ${MAX_TITLES} titles were kept.`);
  const basics: CvContent["basics"] = {
    fullName: clip(b.fullName, "your name"),
    firstName: clip(b.firstName, "your name"),
    lastName: clip(b.lastName, "your name"),
    titles: b.titles.filter((t) => t.trim()).slice(0, MAX_TITLES).map((t) => clip(t, "your titles")),
    email: clip(b.email, "your contact details"),
    phone: clip(b.phone, "your contact details"),
    location: clip(b.location, "your contact details"),
    website: clip(b.website, "your contact details"),
    linkedin: clip(b.linkedin, "your contact details"),
    summary: clip(b.summary, "the summary", MAX_LONG_TEXT),
  };

  const experience = list(draft.experience, "experience entries").map((e) => {
    if (e.bullets.length > MAX_BULLETS) {
      warn(`Some bullets were left out of ${e.company || "an experience entry"}: only the first ${MAX_BULLETS} were kept.`);
    }
    return {
      id: newId(),
      company: clip(e.company, "experience"),
      title: clip(e.title, "experience"),
      location: clip(e.location, "experience"),
      startDate: date(e.startDate, "experience"),
      endDate: e.current ? "" : date(e.endDate, "experience"),
      current: e.current,
      description: clip(e.description, "experience", MAX_LONG_TEXT),
      bullets: e.bullets.slice(0, MAX_BULLETS).map((text) => ({ id: newId(), text: clip(text, "experience") })),
    };
  });

  // A skill appears once: the first group wins (technical → professional → unclear).
  const seen = new Set<string>();
  const skills = {} as Record<(typeof SKILL_GROUPS)[number], Skill[]>;
  for (const group of SKILL_GROUPS) {
    const unique = draft[group].map((n) => n.trim()).filter((n) => {
      const key = n.toLocaleLowerCase();
      if (!n || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    skills[group] = list(unique, "skills in a group").map((name) => ({ id: newId(), name: clip(name, "skills") }));
  }

  if (draft.detectedLocale === "other") {
    warn("This CV isn't in English or Romanian. It was kept as written and marked as English.");
  }

  const content: CvContent = {
    schemaVersion: 2,
    locale: draft.detectedLocale === "ro" ? "ro" : "en",
    basics,
    experience,
    education: list(draft.education, "education entries").map((e) => ({
      id: newId(),
      school: clip(e.school, "education"),
      degree: clip(e.degree, "education"),
      field: clip(e.field, "education"),
      startDate: date(e.startDate, "education"),
      endDate: date(e.endDate, "education"),
      notes: clip(e.notes, "education"),
    })),
    ...skills,
    languages: list(draft.languages, "languages").map((l) => ({ id: newId(), name: clip(l.name, "languages"), level: clip(l.level, "languages") })),
    certifications: list(draft.certifications, "certifications").map((c) => ({
      id: newId(),
      name: clip(c.name, "certifications"),
      issuer: clip(c.issuer, "certifications"),
      date: date(c.date, "certifications"),
    })),
    projects: list(draft.projects, "projects").map((p) => ({
      id: newId(),
      name: clip(p.name, "projects"),
      description: clip(p.description, "projects", MAX_LONG_TEXT),
      url: clip(p.url, "projects"),
    })),
    custom: list(draft.custom, "other sections").map((c) => ({
      id: newId(),
      title: clip(c.title, "other sections"),
      details: clip(c.details, "other sections", MAX_LONG_TEXT),
    })),
    achievements: [],
    volunteering: [],
    awards: [],
    courses: [],
    publications: [],
    interests: [],
    layout: defaultLayout(),
  };

  return { content: CvContentSchema.parse(content), warnings: warnings.slice(0, 50) };
}

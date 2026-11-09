import { z } from "zod";
import { isCopiedDescription } from "./role-description.ts";
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
  MAX_ACHIEVEMENTS,
  newId,
  type CvContent,
  type Skill,
} from "./cv.ts";
import { SECTION_KEYS, type SectionKey } from "./categories.ts";
import { StoredCvSchema } from "./upgrade.ts";

/** "Is this a CV?" — the first, cheap AI step of an import. */
export const AdmitSchema = z.object({ kind: z.enum(["cv", "not_cv", "uncertain"]), reason: z.string() }).strict();
export type Admit = z.infer<typeof AdmitSchema>;

const s = z.string();
const jobShape = z
  .object({
    company: s, title: s, location: s, startDate: s, endDate: s,
    current: z.boolean(), description: s, bullets: z.array(s),
  })
  .strict();

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
    achievements: z.array(s),
    experience: z.array(jobShape),
    volunteering: z.array(jobShape),
    education: z.array(z.object({ school: s, degree: s, field: s, startDate: s, endDate: s, notes: s }).strict()),
    technicalSkills: z.array(s),
    professionalSkills: z.array(s),
    unclearSkills: z.array(s),
    languages: z.array(z.object({ name: s, level: s }).strict()),
    certifications: z.array(z.object({ name: s, issuer: s, date: s }).strict()),
    projects: z.array(jobShape.extend({ url: s }).strict()),
    custom: z.array(z.object({ title: s, details: s }).strict()),
    awards: z.array(z.object({ name: s, issuer: s, date: s, description: s }).strict()),
    courses: z.array(z.object({ name: s, provider: s, date: s }).strict()),
    publications: z.array(z.object({ title: s, publisher: s, date: s, url: s }).strict()),
    interests: z.array(s),
    /** Every heading in the file as written, with the category its content went to (a plain string, so an unknown key does not fail the parse). */
    sourceHeadings: z.array(z.object({ heading: s, category: s }).strict()),
  })
  .strict();
export type ImportDraft = z.infer<typeof ImportDraftSchema>;

export function emptyDraft(): ImportDraft {
  const { basics } = emptyCv();
  // Photos belong to the saved CV, never the AI import draft.
  delete basics.photo;
  return {
    detectedLocale: "en", warnings: [], basics,
    achievements: [], experience: [], volunteering: [], education: [], technicalSkills: [], professionalSkills: [], unclearSkills: [],
    languages: [], certifications: [], projects: [], custom: [],
    awards: [], courses: [], publications: [], interests: [], sourceHeadings: [],
  };
}

/** The warning the API adds for a scanned file; the review shows it from `isScan` instead. */
export const SCAN_WARNING = "This file is a scan. Check every line.";

/** What a finished import holds, ready for review. */
export type SourceHeading = { heading: string; category: SectionKey };
const SourceHeadingSchema = z.object({
  heading: z.string(),
  category: z.enum(SECTION_KEYS as [SectionKey, ...SectionKey[]]),
});

export const ImportResultSchema = z.object({
  content: StoredCvSchema,
  warnings: z.array(z.string().max(500)).max(50),
  sourceHeadings: z.array(SourceHeadingSchema).default([]),
  unsourcedLines: z.array(z.string()).default([]),
  isScan: z.boolean().default(false),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

/** "Master of Arts, History" with field "History" is degree "Master of Arts": the field is not kept twice. */
function withoutField(degree: string, field: string): string {
  const d = degree.trim();
  const f = field.trim();
  if (!f || !d.endsWith(f)) return degree;
  const rest = d.slice(0, -f.length).replace(/\s*[,–-]\s*$/, "");
  return rest && rest.length < d.length - f.length ? rest : degree;
}

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

  const jobs = (items: ImportDraft["experience"], label: string, entry: string) =>
    list(items, `${label} entries`).map((e) => {
      if (e.bullets.length > MAX_BULLETS) {
        warn(`Some bullets were left out of ${e.company || entry}: only the first ${MAX_BULLETS} were kept.`);
      }
      return {
        id: newId(),
        company: clip(e.company, label),
        title: clip(e.title, label),
        location: clip(e.location, label),
        startDate: date(e.startDate, label),
        endDate: e.current ? "" : date(e.endDate, label),
        current: e.current,
        description: isCopiedDescription(e) ? "" : clip(e.description, label, MAX_LONG_TEXT),
        bullets: e.bullets.slice(0, MAX_BULLETS).map((text) => ({ id: newId(), text: clip(text, label) })),
        notes: [],
      };
    });
  const experience = jobs(draft.experience, "experience", "an experience entry");

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
      degree: clip(withoutField(e.degree, e.field), "education"),
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
    // A project has the role shape, plus its link (same order as the draft, so the index matches).
    projects: jobs(draft.projects, "projects", "a project").map((p, i) => ({ ...p, url: clip(draft.projects[i]!.url, "projects") })),
    custom: list(draft.custom, "other sections").map((c) => ({
      id: newId(),
      title: clip(c.title, "other sections"),
      details: clip(c.details, "other sections", MAX_LONG_TEXT),
    })),
    achievements: list(draft.achievements, "achievements", MAX_ACHIEVEMENTS).map((text) => ({ id: newId(), text: clip(text, "achievements") })),
    volunteering: jobs(draft.volunteering, "volunteering", "a volunteering entry"),
    awards: list(draft.awards, "awards").map((a) => ({
      id: newId(),
      name: clip(a.name, "awards"),
      issuer: clip(a.issuer, "awards"),
      date: date(a.date, "awards"),
      description: clip(a.description, "awards", MAX_LONG_TEXT),
    })),
    courses: list(draft.courses, "courses").map((c) => ({
      id: newId(),
      name: clip(c.name, "courses"),
      provider: clip(c.provider, "courses"),
      date: date(c.date, "courses"),
    })),
    publications: list(draft.publications, "publications").map((p) => ({
      id: newId(),
      title: clip(p.title, "publications"),
      publisher: clip(p.publisher, "publications"),
      date: date(p.date, "publications"),
      url: clip(p.url, "publications"),
    })),
    interests: list(draft.interests.map((n) => n.trim()).filter(Boolean), "interests").map((name) => ({ id: newId(), name: clip(name, "interests") })),
    layout: defaultLayout(),
    enrichedAt: null,
  };

  const known = new Set<string>(SECTION_KEYS);
  const sourceHeadings: SourceHeading[] = draft.sourceHeadings.map((h) => {
    // A field path ("basics.summary") means its last part; a skill group's name means the skills section.
    const key = h.category.split(".").pop()!.trim();
    if (key === "custom") return { heading: h.heading, category: "other" };
    if (known.has(key)) return { heading: h.heading, category: key as SectionKey };
    if ((SKILL_GROUPS as readonly string[]).includes(key)) return { heading: h.heading, category: "skills" };
    warn(`The heading "${h.heading.slice(0, 100)}" didn't match a known section, so it was filed under other.`);
    return { heading: h.heading, category: "other" };
  });

  return {
    content: CvContentSchema.parse(content),
    warnings: warnings.slice(0, 50),
    sourceHeadings,
    unsourcedLines: [],
    isScan: false,
  };
}

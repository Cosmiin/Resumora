// Shapes and small builders for the evaluation CVs. A case is written once (the content and the
// headings as printed); the templates and the answer key are both made from it, so they match.

export type Category =
  | "summary" | "achievements" | "experience" | "skills" | "education" | "languages"
  | "certifications" | "projects" | "volunteering" | "awards" | "courses" | "publications"
  | "interests" | "other";

export type Role = {
  company: string; title: string; location: string; startDate: string; endDate: string;
  current: boolean; description: string; bullets: { text: string }[];
};
/** A project has the role shape plus its link (title = the project's name). */
export type Project = Role & { url: string };
export type Content = {
  schemaVersion: 2;
  locale: "en" | "ro";
  basics: {
    fullName: string; firstName: string; lastName: string; titles: string[]; email: string;
    phone: string; location: string; website: string; linkedin: string; summary: string;
  };
  experience: Role[];
  education: { school: string; degree: string; field: string; startDate: string; endDate: string; notes: string }[];
  technicalSkills: { name: string }[];
  professionalSkills: { name: string }[];
  unclearSkills: { name: string }[];
  languages: { name: string; level: string }[];
  certifications: { name: string; issuer: string; date: string }[];
  projects: Project[];
  custom: { title: string; details: string }[];
  achievements: { text: string }[];
  volunteering: Role[];
  awards: { name: string; issuer: string; date: string; description: string }[];
  courses: { name: string; provider: string; date: string }[];
  publications: { title: string; publisher: string; date: string; url: string }[];
  interests: { name: string }[];
};
export type SourceHeading = { heading: string; category: Category };
export type Flag = { key: string; level: "missing" | "tip"; field?: string };

/** One section as printed: its heading, where its content goes, and which column it sits in. */
export type Section = { heading: string; category: Category; col?: number };

export type Variant = "one" | "two" | "three" | "sidebar" | "tables" | "icons" | "docx";
export type Case = {
  id: string;
  variant: Variant;
  /** Contact block title ("Contact", "Date personale"); not listed in headings. */
  contactTitle?: string;
  /** Labels in front of the contact lines (and name parts), when the CV has them. */
  labels?: { first?: string; last?: string; email?: string; phone?: string; location?: string };
  content: Content;
  sections: Section[];
  pages?: number;
};

const names = (xs: string[] = []) => xs.map((name) => ({ name }));
const bullets = (xs: string[] = []) => xs.map((text) => ({ text }));

export function role(
  company: string, title: string, location: string, startDate: string, endDate: string,
  description: string, bulletTexts: string[], current = false,
): Role {
  return { company, title, location, startDate, endDate, current, description, bullets: bullets(bulletTexts) };
}

type Basics = Partial<Content["basics"]> & { fullName: string; email: string };
type Skills = { tech?: string[]; prof?: string[]; unclear?: string[] };

export function cv(
  locale: "en" | "ro",
  basics: Basics,
  rest: Partial<Omit<Content, "basics" | "technicalSkills" | "professionalSkills" | "unclearSkills">> & { skills?: Skills },
): Content {
  const { skills, ...lists } = rest;
  return {
    schemaVersion: 2,
    locale,
    basics: {
      firstName: "", lastName: "", titles: [], phone: "", location: "", website: "", linkedin: "", summary: "",
      ...basics,
    },
    experience: [], education: [], languages: [], certifications: [], projects: [], custom: [],
    achievements: [], volunteering: [], awards: [], courses: [], publications: [], interests: [],
    ...lists,
    technicalSkills: names(skills?.tech),
    professionalSkills: names(skills?.prof),
    unclearSkills: names(skills?.unclear),
  } as Content;
}
export { bullets as bulletList, names as nameList };

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RO_MONTHS = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."];

/** "2021-03" -> "Mar 2021" (or "mar. 2021"); "2021" stays "2021". */
export function fmtDate(d: string, locale: "en" | "ro"): string {
  const m = /^(\d{4})-(\d{2})$/.exec(d);
  if (!m) return d;
  return `${(locale === "ro" ? RO_MONTHS : EN_MONTHS)[Number(m[2]) - 1]} ${m[1]}`;
}
export function fmtRange(start: string, end: string, current: boolean, locale: "en" | "ro"): string {
  const now = locale === "ro" ? "prezent" : "Present";
  return [fmtDate(start, locale), current ? now : fmtDate(end, locale)].filter(Boolean).join(" – ");
}

/** Skills as one mixed list, the way most CVs print them (round robin across the three groups). */
export function mixedSkills(c: Content): string[] {
  const groups = [c.technicalSkills, c.professionalSkills, c.unclearSkills].map((g) => g.map((s) => s.name));
  const out: string[] = [];
  for (let i = 0; groups.some((g) => i < g.length); i++) for (const g of groups) if (g[i]) out.push(g[i]!);
  return out;
}

/** Missing-section flags by the spec's rules: page order, header first. */
export function expectedFlags(c: Content, sections: Section[]): Flag[] {
  const has = new Set(sections.map((s) => s.category));
  const flags: Flag[] = [];
  if (!c.basics.fullName) flags.push({ key: "header", level: "missing", field: "fullName" });
  if (!c.basics.email) flags.push({ key: "header", level: "missing", field: "email" });
  const rules: [Category, "missing" | "tip"][] = [
    ["summary", "missing"], ["achievements", "missing"], ["experience", "missing"],
    ["skills", "missing"], ["education", "missing"], ["languages", "tip"],
  ];
  for (const [key, level] of rules) if (!has.has(key)) flags.push({ key, level });
  return flags;
}

/** A project as printed: a name, a link and a one-paragraph description, read back as one bullet per sentence. */
export function project(name: string, url: string, sentences: string[]): Project {
  return { ...role("", name, "", "", "", "", sentences), url };
}

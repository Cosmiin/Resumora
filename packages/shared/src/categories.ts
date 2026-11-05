export type SectionKey =
  | "summary"
  | "achievements"
  | "experience"
  | "skills"
  | "education"
  | "languages"
  | "certifications"
  | "projects"
  | "volunteering"
  | "awards"
  | "courses"
  | "publications"
  | "interests"
  | "other";

export type CategoryKey = "header" | SectionKey;

export type FlagLevel = "missing" | "tip";

export type Category = {
  key: CategoryKey;
  label: { en: string; ro: string };
  flag: FlagLevel | null;
  /** Gentle English reason shown with a flag; empty for unflagged categories. */
  why: string;
  synonyms: { en: string[]; ro: string[] };
};

export const CATEGORIES: readonly Category[] = [
  {
    key: "header",
    label: { en: "Header", ro: "Antet" },
    flag: "missing",
    why: "The CV needs your name and email at the top.",
    synonyms: { en: ["Contact", "Personal details"], ro: ["Date personale", "Contact"] },
  },
  {
    key: "summary",
    label: { en: "Summary", ro: "Profil" },
    flag: "missing",
    why: "Recruiters read this first. Two to four sentences is enough.",
    synonyms: {
      en: ["Profile", "About me", "Professional summary"],
      ro: ["Profil", "Despre mine", "Rezumat profesional"],
    },
  },
  {
    key: "achievements",
    label: { en: "Key achievements", ro: "Realizări principale" },
    flag: "missing",
    why: "Three to five results you are proud of make a strong opening.",
    synonyms: {
      en: ["Highlights", "Key accomplishments"],
      ro: ["Realizări", "Realizări principale"],
    },
  },
  {
    key: "experience",
    label: { en: "Experience", ro: "Experiență profesională" },
    flag: "missing",
    why: "Add your roles, newest first.",
    synonyms: {
      en: ["Work experience", "Employment history", "Career"],
      ro: ["Experiență profesională", "Experiență", "Istoric profesional"],
    },
  },
  {
    key: "skills",
    label: { en: "Skills", ro: "Competențe" },
    flag: "missing",
    why: "Most job filters match on skills.",
    synonyms: {
      en: ["Competencies", "Toolbox", "Technical skills"],
      ro: ["Competențe", "Abilități", "Aptitudini"],
    },
  },
  {
    key: "education",
    label: { en: "Education", ro: "Educație" },
    flag: "missing",
    why: "Add your highest degree or school.",
    synonyms: {
      en: ["Studies", "Academic background"],
      ro: ["Studii", "Educație și formare"],
    },
  },
  {
    key: "languages",
    label: { en: "Languages", ro: "Limbi străine" },
    flag: "tip",
    why: "Worth adding if you speak more than one language.",
    synonyms: {
      en: ["Language skills", "Foreign languages"],
      ro: ["Limbi străine", "Competențe lingvistice"],
    },
  },
  {
    key: "certifications",
    label: { en: "Certifications", ro: "Certificări" },
    flag: null,
    why: "",
    synonyms: { en: ["Certificates", "Licenses"], ro: ["Certificări", "Certificate"] },
  },
  {
    key: "projects",
    label: { en: "Projects", ro: "Proiecte" },
    flag: null,
    why: "",
    synonyms: { en: ["Selected projects", "Portfolio"], ro: ["Proiecte", "Portofoliu"] },
  },
  {
    key: "volunteering",
    label: { en: "Volunteering", ro: "Voluntariat" },
    flag: null,
    why: "",
    synonyms: {
      en: ["Volunteer work", "Community"],
      ro: ["Voluntariat", "Activități de voluntariat"],
    },
  },
  {
    key: "awards",
    label: { en: "Awards & honours", ro: "Premii și distincții" },
    flag: null,
    why: "",
    synonyms: { en: ["Honours", "Awards"], ro: ["Premii", "Distincții"] },
  },
  {
    key: "courses",
    label: { en: "Courses & training", ro: "Cursuri și training-uri" },
    flag: null,
    why: "",
    synonyms: {
      en: ["Training", "Professional development"],
      ro: ["Cursuri", "Formare profesională"],
    },
  },
  {
    key: "publications",
    label: { en: "Publications", ro: "Publicații" },
    flag: null,
    why: "",
    synonyms: { en: ["Papers", "Articles"], ro: ["Publicații", "Articole"] },
  },
  {
    key: "interests",
    label: { en: "Interests", ro: "Interese" },
    flag: null,
    why: "",
    synonyms: { en: ["Hobbies", "Interests"], ro: ["Hobby-uri", "Interese"] },
  },
  {
    key: "other",
    label: { en: "Other", ro: "Altele" },
    flag: null,
    why: "",
    synonyms: { en: [], ro: [] },
  },
];

export const CATEGORY = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, Category>;

export const SECTION_KEYS: readonly SectionKey[] = CATEGORIES.filter(
  (c) => c.key !== "header",
).map((c) => c.key as SectionKey);

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
  label: { en: string; ro: string; fr: string; de: string; es: string; it: string };
  flag: FlagLevel | null;
  /** Gentle English reason shown with a flag; empty for unflagged categories. */
  why: string;
  synonyms: { en: string[]; ro: string[] };
};

export const CATEGORIES: readonly Category[] = [
  {
    key: "header",
    label: { en: "Header", ro: "Antet", fr: "En-tête", de: "Kopfzeile", es: "Encabezado", it: "Intestazione" },
    flag: "missing",
    why: "The CV needs your name and email at the top.",
    synonyms: { en: ["Contact", "Personal details"], ro: ["Date personale", "Contact"] },
  },
  {
    key: "summary",
    label: { en: "Summary", ro: "Profil", fr: "Profil", de: "Profil", es: "Perfil", it: "Profilo" },
    flag: "missing",
    why: "Recruiters read this first. Two to four sentences is enough.",
    synonyms: {
      en: ["Profile", "About me", "Professional summary"],
      ro: ["Profil", "Despre mine", "Rezumat profesional"],
    },
  },
  {
    key: "achievements",
    label: { en: "Key achievements", ro: "Realizări principale", fr: "Principales réalisations", de: "Wichtigste Erfolge", es: "Logros destacados", it: "Risultati principali" },
    flag: "missing",
    why: "Three to five results you are proud of make a strong opening.",
    synonyms: {
      en: ["Highlights", "Key accomplishments"],
      ro: ["Realizări", "Realizări principale"],
    },
  },
  {
    key: "experience",
    label: { en: "Experience", ro: "Experiență profesională", fr: "Expérience professionnelle", de: "Berufserfahrung", es: "Experiencia profesional", it: "Esperienza professionale" },
    flag: "missing",
    why: "Add your roles, newest first.",
    synonyms: {
      en: ["Work experience", "Employment history", "Career"],
      ro: ["Experiență profesională", "Experiență", "Istoric profesional"],
    },
  },
  {
    key: "skills",
    label: { en: "Skills", ro: "Competențe", fr: "Compétences", de: "Kompetenzen", es: "Competencias", it: "Competenze" },
    flag: "missing",
    why: "Most job filters match on skills.",
    synonyms: {
      en: ["Competencies", "Toolbox", "Technical skills"],
      ro: ["Competențe", "Abilități", "Aptitudini"],
    },
  },
  {
    key: "education",
    label: { en: "Education", ro: "Educație", fr: "Formation", de: "Ausbildung", es: "Formación académica", it: "Istruzione" },
    flag: "missing",
    why: "Add your highest degree or school.",
    synonyms: {
      en: ["Studies", "Academic background"],
      ro: ["Studii", "Educație și formare"],
    },
  },
  {
    key: "languages",
    label: { en: "Languages", ro: "Limbi străine", fr: "Langues", de: "Sprachen", es: "Idiomas", it: "Lingue" },
    flag: "tip",
    why: "Worth adding if you speak more than one language.",
    synonyms: {
      en: ["Language skills", "Foreign languages"],
      ro: ["Limbi străine", "Competențe lingvistice"],
    },
  },
  {
    key: "certifications",
    label: { en: "Certifications", ro: "Certificări", fr: "Certifications", de: "Zertifizierungen", es: "Certificaciones", it: "Certificazioni" },
    flag: null,
    why: "",
    synonyms: { en: ["Certificates", "Licenses"], ro: ["Certificări", "Certificate"] },
  },
  {
    key: "projects",
    label: { en: "Projects", ro: "Proiecte", fr: "Projets", de: "Projekte", es: "Proyectos", it: "Progetti" },
    flag: null,
    why: "",
    synonyms: { en: ["Selected projects", "Portfolio"], ro: ["Proiecte", "Portofoliu"] },
  },
  {
    key: "volunteering",
    label: { en: "Volunteering", ro: "Voluntariat", fr: "Bénévolat", de: "Ehrenamt", es: "Voluntariado", it: "Volontariato" },
    flag: null,
    why: "",
    synonyms: {
      en: ["Volunteer work", "Community"],
      ro: ["Voluntariat", "Activități de voluntariat"],
    },
  },
  {
    key: "awards",
    label: { en: "Awards & honours", ro: "Premii și distincții", fr: "Prix et distinctions", de: "Preise und Auszeichnungen", es: "Premios y distinciones", it: "Premi e riconoscimenti" },
    flag: null,
    why: "",
    synonyms: { en: ["Honours", "Awards"], ro: ["Premii", "Distincții"] },
  },
  {
    key: "courses",
    label: { en: "Courses & training", ro: "Cursuri și training-uri", fr: "Cours et formations", de: "Kurse und Weiterbildungen", es: "Cursos y formación", it: "Corsi e formazione" },
    flag: null,
    why: "",
    synonyms: {
      en: ["Training", "Professional development"],
      ro: ["Cursuri", "Formare profesională"],
    },
  },
  {
    key: "publications",
    label: { en: "Publications", ro: "Publicații", fr: "Publications", de: "Publikationen", es: "Publicaciones", it: "Pubblicazioni" },
    flag: null,
    why: "",
    synonyms: { en: ["Papers", "Articles"], ro: ["Publicații", "Articole"] },
  },
  {
    key: "interests",
    label: { en: "Interests", ro: "Interese", fr: "Centres d’intérêt", de: "Interessen", es: "Intereses", it: "Interessi" },
    flag: null,
    why: "",
    synonyms: { en: ["Hobbies", "Interests"], ro: ["Hobby-uri", "Interese"] },
  },
  {
    key: "other",
    label: { en: "Other", ro: "Altele", fr: "Autres", de: "Sonstiges", es: "Otros", it: "Altro" },
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

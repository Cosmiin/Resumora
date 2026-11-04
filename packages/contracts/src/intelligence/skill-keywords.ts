export const skillInventoryPolicy = {
  version: "skills-inventory/2",
  promptVersion: "experience-skills/4",
  categoryLimit: 30,
  activeCategoryLimit: 20,
  outputTokens: 12000,
  attemptMs: 60000,
  totalMs: 90000,
} as const;
export type SkillCategory = "technicalSkills" | "professionalSkills";
const normalized = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
// A conservative alias table, not a taxonomy or a source of inferred skills.
// Do not collapse a tool into its broader capability (SQL != Data Validation).
const terminology: [string, SkillCategory, string[]][] = [
  ["REST APIs", "technicalSkills", ["REST API", "RESTful API", "RESTful APIs"]],
  [
    "API Integration",
    "technicalSkills",
    ["API Integrations", "Integrare API", "Intégration API"],
  ],
  [
    "Data Validation",
    "technicalSkills",
    ["Validarea datelor", "Validare date", "Validation des données"],
  ],
  [
    "Data Modelling",
    "technicalSkills",
    ["Data Modeling", "Modelarea datelor", "Modélisation des données"],
  ],
  [
    "Software Testing",
    "technicalSkills",
    ["Software Tests", "Testare software", "Tests logiciels"],
  ],
  [
    "Workflow Automation",
    "technicalSkills",
    ["Automatizarea fluxurilor", "Automatisation des workflows"],
  ],
  ["Power Automate", "technicalSkills", ["Microsoft Power Automate"]],
  ["Excel", "technicalSkills", ["Microsoft Excel", "MS Excel"]],
  ["SQL", "technicalSkills", ["Structured Query Language"]],
  ["APIs", "technicalSkills", ["API", "Application Programming Interface", "Application Programming Interfaces"]],
  ["Python", "technicalSkills", []],
  ["Java", "technicalSkills", []],
  ["JavaScript", "technicalSkills", ["JS"]],
  ["C", "technicalSkills", []],
  ["C++", "technicalSkills", []],
  ["C#", "technicalSkills", []],
  ["Webhooks", "technicalSkills", ["Webhook"]],
  ["PostgreSQL", "technicalSkills", ["Postgres"]],
  ["Jira", "technicalSkills", []],
  ["Make", "technicalSkills", ["Integromat"]],
  ["Airtable", "technicalSkills", []],
  [
    "Requirements Analysis",
    "professionalSkills",
    [
      "Requirements Gathering",
      "Analiza cerințelor",
      "Analyse des besoins",
      "Análisis de requisitos",
    ],
  ],
  [
    "Business Analysis",
    "professionalSkills",
    ["Analiză de business", "Analiza afacerii"],
  ],
  [
    "Process Improvement",
    "professionalSkills",
    [
      "Process Optimisation",
      "Process Optimization",
      "Îmbunătățirea proceselor",
    ],
  ],
  ["Workflow Design", "professionalSkills", ["Business Workflow Design"]],
  [
    "Stakeholder Management",
    "professionalSkills",
    ["Gestion des parties prenantes"],
  ],
  [
    "Project Management",
    "professionalSkills",
    ["Management de proiect", "Gestion de projet", "Gestión de proyectos"],
  ],
  [
    "Team Coordination",
    "professionalSkills",
    ["Coordonarea echipei", "Coordination d’équipe", "Coordinación de equipos"],
  ],
  [
    "Leadership",
    "professionalSkills",
    ["Team Leadership", "Conducerea echipei"],
  ],
  ["Communication", "professionalSkills", ["Comunicare", "Comunicación"]],
  [
    "Negotiation",
    "professionalSkills",
    ["Negociere", "Négociation", "Negociación"],
  ],
  [
    "Problem Solving",
    "professionalSkills",
    ["Problem-Solving", "Rezolvarea problemelor"],
  ],
  [
    "Decision Making",
    "professionalSkills",
    ["Decision-Making", "Luarea deciziilor"],
  ],
  [
    "Conflict Resolution",
    "professionalSkills",
    ["Rezolvarea conflictelor", "Résolution des conflits"],
  ],
];
const aliases = new Map(
  terminology.flatMap(([label, category, variants]) =>
    [label, ...variants].map(
      (value) => [normalized(value), { label, category }] as const,
    ),
  ),
);
const familiarAcronyms = new Map([
  ['customer relationship management', 'CRM'],
  ['crm', 'CRM'],
  ['enterprise resource planning', 'ERP'],
  ['erp', 'ERP'],
  ['continuous integration/continuous delivery', 'CI/CD'],
  ['ci/cd', 'CI/CD'],
]);
export function canonicalSkill(label: string, category: SkillCategory, locale = 'en') {
  const canonical = aliases.get(normalized(label));
  const acronym = familiarAcronyms.get(normalized(label));
  if (acronym) return {label: acronym, category};
  const display = label.trim().replace(/\s+/gu, " ");
  // Alias identity/category remain stable across translations. Generated competency
  // wording follows the document, while named products retain their official label.
  return canonical
    ? { ...canonical, label: new Intl.Locale(locale).language === 'en' || namedTechnologies.has(canonical.label) || ['API','APIs'].includes(canonical.label) ? canonical.label : display }
    : { label: display, category };
}
export const skillKey = (label: string) =>
  normalized(aliases.get(normalized(label))?.label ?? familiarAcronyms.get(normalized(label)) ?? label);

const namedTechnologies = new Set([
  "SQL",
  "Python",
  "Java",
  "JavaScript",
  "C",
  "C++",
  "C#",
  "PostgreSQL",
  "Jira",
  "Make",
  "Airtable",
  "Power Automate",
  "Excel",
]);
/** Applies to new AI keywords; historical CV text remains compatible. */
export function isSkillKeyword(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= 100;
}

export function rankSkillCandidates<
  T extends {
    label: string;
    importance?: "core" | "supporting";
  },
>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.importance === "core") - Number(a.importance === "core") ||
      skillKey(a.label).localeCompare(skillKey(b.label), "en"),
  );
}


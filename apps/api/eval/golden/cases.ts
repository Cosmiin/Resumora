// The golden set: two weak, fictional CVs (the ones in the workspace's test-cvs folder) against job ads,
// including a case where the ad is in another language than the CV. Each case says what good looks like,
// so a report can be read against it. The CVs and jobs are fixed data: no AI call builds them.
import { CvContentSchema, JobExtractionSchema, emptyCv, type CvContent, type JobExtraction } from "@resumora/shared";

type Language = "en" | "ro";

function role(id: string, title: string, company: string, startDate: string, endDate: string, bullets: string[]): CvContent["experience"][number] {
  return {
    id, company, title, location: "", startDate, endDate, current: endDate === "", description: "",
    bullets: bullets.map((text, i) => ({ id: `${id}-b${i + 1}`, text })), notes: [],
  } as CvContent["experience"][number];
}

function cv(locale: Language, input: {
  fullName: string; title: string; location: string; summary: string;
  experience: CvContent["experience"]; technical: string[]; professional: string[]; languages: Array<[string, string]>;
}): CvContent {
  const base = emptyCv(locale);
  return CvContentSchema.parse({
    ...base,
    basics: { ...base.basics, fullName: input.fullName, titles: [input.title], location: input.location, summary: input.summary },
    experience: input.experience,
    technicalSkills: input.technical.map((name, i) => ({ id: `ts${i + 1}`, name })),
    professionalSkills: input.professional.map((name, i) => ({ id: `ps${i + 1}`, name })),
    languages: input.languages.map(([name, level], i) => ({ id: `lang${i + 1}`, name, level })),
  });
}

export const CV_EN = cv("en", {
  fullName: "Andrei Munteanu", title: "Automation Specialist", location: "Cluj-Napoca, Romania",
  summary: "Hard working and motivated person with experience in automations and IT. I like to learn new things and work in a team. Looking for a job as automation developer where I can grow.",
  experience: [
    role("en-r1", "Automation Specialist", "Logistica Nord SRL", "2022", "", [
      "Responsible for making automations in Zapier and Make",
      "Worked with Google Sheets and Airtable",
      "Helped colleagues from sales and accounting with their processes",
      "Made some integrations between apps",
      "Fixed problems when the automations stopped working",
    ]),
    role("en-r2", "IT Support / Office Assistant", "Dental Clinic Zâmbet", "2019", "2022", [
      "Took care of computers, printers and the network",
      "Managed the appointments system",
      "Did Excel reports for the manager",
      "Other tasks as needed",
    ]),
    role("en-r3", "Sales Assistant", "Electronics store", "2017", "2019", ["Selling products to customers", "Arranging the shelves"]),
  ],
  technical: ["Zapier", "Make", "Excel", "Google Sheets", "Airtable", "JavaScript", "Microsoft Office", "Windows"],
  professional: ["Communication", "Teamwork", "Problem solving"],
  languages: [["Romanian", "Native"], ["English", "Good"]],
});

export const CV_RO = cv("ro", {
  fullName: "Ioana Dumitrescu", title: "Specialist automatizări (no-code)", location: "București",
  summary: "Sunt o persoană serioasă, organizată și dornică să învăț. Am experiență cu automatizări și aplicații no-code. Caut un post de dezvoltator de automatizări într-o firmă unde să mă pot dezvolta.",
  experience: [
    role("ro-r1", "Specialist automatizări (no-code)", "Agenția Digitală Pixel", "2023", "", [
      "Responsabilă de automatizări în Make și n8n",
      "Am lucrat cu HubSpot și cu formulare Typeform",
      "Am făcut legături între aplicațiile clienților",
      "Am ajutat echipa de marketing cu trimiterea de emailuri",
      "Rezolvam erorile din scenarii",
    ]),
    role("ro-r2", "Operator date / Asistent administrativ", "Firmă de curierat", "2020", "2023", [
      "Introducere date în sistem",
      "Rapoarte în Excel",
      "Am făcut câteva macro-uri și tabele",
      "Corespondență cu clienții",
    ]),
    role("ro-r3", "Recepționeră", "Hotel", "2018", "2020", ["Primirea clienților și rezervări"]),
  ],
  technical: ["Make", "n8n", "Zapier", "HubSpot", "Typeform", "Notion", "Excel", "Google Workspace", "SQL"],
  professional: ["Comunicare", "Lucru în echipă", "Atenție la detalii"],
  languages: [["Română", "Maternă"], ["Engleză", "Bine"], ["Franceză", "Începător"]],
});

const must = (text: string, category: JobExtraction["requirements"][number]["category"] = "skill") => ({ text, kind: "must" as const, category });
const nice = (text: string, category: JobExtraction["requirements"][number]["category"] = "skill") => ({ text, kind: "nice" as const, category });

export const JOB_EN = JobExtractionSchema.parse({
  title: "No-Code Automation Developer", company: "Flowbridge", location: "Remote, EU", workMode: "remote",
  employmentType: "full_time", seniority: "mid", salary: null, applyBy: null, isJobPosting: true, benefits: [],
  summary: "Flowbridge helps mid-size e-commerce and logistics companies remove manual work. We are hiring a No-Code Automation Developer to design, build and maintain business workflows.",
  responsibilities: [
    "Build and maintain workflows in Make, Zapier and n8n connecting CRMs, ERPs, e-commerce platforms and internal tools",
    "Work with REST APIs and webhooks, including authentication (OAuth2, API keys) and JSON data mapping",
    "Design data models in Airtable and Google Sheets; write simple SQL queries",
    "Add error handling, logging and monitoring so automations fail safely",
    "Talk to business teams (sales, finance, operations) to map their processes and estimate time saved",
    "Document workflows so others can maintain them",
  ],
  requirements: [
    must("2+ years building production automations with Make or Zapier", "experience"),
    must("Comfortable with APIs, webhooks and JSON"),
    must("Basic JavaScript for custom code steps"),
    must("Good English, clear written communication", "language"),
    nice("n8n self-hosted"),
    nice("AI steps (OpenAI/Claude) inside workflows"),
    nice("HubSpot or Pipedrive"),
    nice("Experience in logistics", "experience"),
  ],
});

export const JOB_RO = JobExtractionSchema.parse({
  title: "Dezvoltator Automatizări No-Code", company: "Automatix Solutions", location: "București", workMode: "hybrid",
  employmentType: "full_time", seniority: "mid", salary: null, applyBy: null, isJobPosting: true, benefits: [],
  summary: "Automatix Solutions implementează automatizări pentru agenții de marketing și companii de servicii. Căutăm un Dezvoltator Automatizări No-Code care să proiecteze și să întrețină fluxuri de lucru pentru clienții noștri.",
  responsibilities: [
    "Construirea și întreținerea fluxurilor în Make și n8n, integrând CRM-uri (HubSpot, Pipedrive), formulare și platforme de email marketing",
    "Lucrul cu API-uri REST și webhook-uri, maparea datelor JSON",
    "Gestionarea erorilor și monitorizarea scenariilor în producție",
    "Analiza proceselor clienților și propunerea de automatizări care reduc munca manuală",
    "Documentarea fluxurilor și instruirea clienților",
  ],
  requirements: [
    must("Minimum 1–2 ani experiență cu Make sau n8n", "experience"),
    must("Cunoștințe de API-uri, webhook-uri și JSON"),
    must("SQL de bază, Excel / Google Sheets avansat"),
    must("Limba engleză nivel mediu", "language"),
    nice("Integrarea de pași AI în fluxuri"),
    nice("Experiență cu agenții de marketing", "experience"),
    nice("n8n self-hosted"),
  ],
});

export type GoldenCase = {
  id: string;
  what: string;
  cv: CvContent;
  job: JobExtraction;
  /** The language the person uses the app in: questions and answer options should be in it. */
  interfaceLanguage: Language;
  /** The language the tailored CV text should be written in (here: the ad's language). */
  tailoringLanguage: Language;
  /** A few questions a thoughtful coach would ask. Not an answer key: a yardstick for the reader. */
  goodQuestions: string[];
};

export const CASES: GoldenCase[] = [
  {
    id: "en-cv--en-ad", what: "English CV, English ad, English interface", cv: CV_EN, job: JOB_EN, interfaceLanguage: "en", tailoringLanguage: "en",
    goodQuestions: [
      "About how many automations do you keep running today?",
      "Which teams used the automations you built?",
      "When an automation stopped working, what did you usually do?",
      "The ad asks for webhooks and JSON. Did you use them in this role?",
      "What were the Excel reports for the clinic manager about?",
    ],
  },
  {
    id: "en-cv--ro-ad", what: "English CV, Romanian ad (language mismatch), Romanian interface", cv: CV_EN, job: JOB_RO, interfaceLanguage: "ro", tailoringLanguage: "ro",
    goodQuestions: [
      "Anunțul cere webhook-uri și JSON. Le-ai folosit în acest rol?",
      "Ai lucrat cu n8n în acest rol, sau doar cu Make și Zapier?",
      "Ai scris interogări SQL în acest rol?",
    ],
  },
  {
    id: "ro-cv--ro-ad", what: "Romanian CV, Romanian ad, Romanian interface", cv: CV_RO, job: JOB_RO, interfaceLanguage: "ro", tailoringLanguage: "ro",
    goodQuestions: [
      "Cam câte scenarii ții în funcțiune acum în Make și n8n?",
      "Pentru câți clienți ai făcut legături între aplicații?",
      "Când un scenariu dădea eroare, ce făceai de obicei?",
      "Anunțul cere API-uri REST și webhook-uri. Le-ai folosit în acest rol?",
      "Macro-urile din Excel: ce făceau și cine le folosea?",
    ],
  },
  {
    id: "ro-cv--en-ad", what: "Romanian CV, English ad (language mismatch), English interface", cv: CV_RO, job: JOB_EN, interfaceLanguage: "en", tailoringLanguage: "en",
    goodQuestions: [
      "The ad asks for basic JavaScript in custom code steps. Did you write any in this role?",
      "Did you use webhooks or map JSON data in your Make and n8n scenarios?",
      "Which CRM did your scenarios connect, besides HubSpot?",
    ],
  },
];

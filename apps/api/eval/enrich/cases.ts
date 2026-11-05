// Fictional people only. Score cases carry the grades a careful reviewer expects, in the order
// contribution / clarity / specificity / impact. Bullets marked `zero` are checked another way (see run.eval.ts).
import type { Experience, Grade, Locale, Note } from "@resumora/shared";

type G = Grade;
const M: G = "missing";
const P: G = "partial";
const S: G = "specific";

export type Expected = { grades: [G, G, G, G] } | { zero: "placeholder" | "exactDuplicate" | "paraphrasedDuplicate" };
export type ScoreCase = { id: string; locale: Locale; title: string; bullets: { text: string; expected: Expected }[] };

const g = (c: G, cl: G, s: G, i: G): Expected => ({ grades: [c, cl, s, i] });

export type ImproveCase = {
  id: string; locale: Locale; role: Experience; bulletId: string; notes: Note[];
  expectNumber?: string; forbidNumber?: string;
};
export type DumpCase = { id: string; locale: Locale; role: Experience; ramble: string };

const ROLE: Experience = {
  id: "role", company: "Fictional Co", title: "Customer Support Assistant", location: "",
  startDate: "2021-01", endDate: "2023-06", current: false, description: "", bullets: [], notes: [],
};
const ASKED_AT = "2026-11-05T10:00:00.000Z";

export const IMPROVE_CASES: ImproveCase[] = [
  {
    id: "focus-en-vague-answer", locale: "en", bulletId: "b1", expectNumber: "60",
    role: { ...ROLE, bullets: [{ id: "b1", text: "Helped customers." }] },
    notes: [{ id: "n1", question: "What did you handle?", answer: "About 60 customer calls a day, mostly booking questions, using Zendesk.", via: ["type"], askedAt: ASKED_AT }],
  },
  {
    id: "focus-en-rangeOnly", locale: "en", bulletId: "b1", expectNumber: "10–50",
    role: { ...ROLE, title: "Trainer", bullets: [{ id: "b1", text: "Trained new staff." }] },
    notes: [{ id: "n1", question: "How many new staff did you train?", answer: "10–50 a week", via: ["pick"], askedAt: ASKED_AT }],
  },
  {
    id: "focus-en-80-result", locale: "en", bulletId: "b1",
    role: { ...ROLE, title: "Support Engineer", bullets: [{ id: "b1", text: "Investigated failed API requests using application logs." }] },
    notes: [{ id: "n1", question: "What was the result?", answer: "Found expired API keys and restored customers' access by rotating those keys.", via: ["type"], askedAt: ASKED_AT }],
  },
  {
    id: "focus-ro-role", locale: "ro", bulletId: "b1",
    role: { ...ROLE, title: "Lucrător depozit", bullets: [{ id: "b1", text: "Ajutat la pregătirea comenzilor." }] },
    notes: [{ id: "n1", question: "Ce ai făcut concret?", answer: "Am scanat codurile de bare în SAP și am împachetat coletele pentru curier.", via: ["type"], askedAt: ASKED_AT }],
  },
  {
    id: "focus-en-duplicate-trap", locale: "en", bulletId: "b1",
    role: { ...ROLE, title: "Payroll Assistant", bullets: [
      { id: "b1", text: "Helped with payroll." }, { id: "b2", text: "Prepared payroll files in Sage." },
    ] },
    notes: [{ id: "n1", question: "What did you do for payroll?", answer: "Prepared payroll files in Sage and checked overtime entries so staff were paid correctly.", via: ["type"], askedAt: ASKED_AT }],
  },
  {
    id: "focus-en-forbid-number", locale: "en", bulletId: "b1", forbidNumber: "30%",
    role: { ...ROLE, title: "Accounts Assistant", bullets: [{ id: "b1", text: "Helped with invoices." }] },
    notes: [{ id: "n1", question: "What changed?", answer: "Checked supplier invoices in Excel and caught duplicate charges. A percentage reduction would sound better, but I never measured it.", via: ["type"], askedAt: ASKED_AT }],
  },
];

export const DUMP_CASES: DumpCase[] = [
  {
    id: "focus-en-brain-dump", locale: "en",
    role: { ...ROLE, title: "Payroll Assistant" },
    ramble: "I prepared payroll for 75 staff using Sage. I checked overtime entries against timesheets and fixed missing bank details before the payroll run.",
  },
  {
    id: "focus-ro-brain-dump", locale: "ro",
    role: { ...ROLE, title: "Lucrător depozit" },
    ramble: "Scanam codurile de bare în SAP și împachetam coletele pentru curier. Verificam adresele de livrare și corectam etichetele greșite înainte de expediere.",
  },
];

export const SCORE_CASES: ScoreCase[] = [
  {
    id: "en-hr-coordinator", locale: "en", title: "HR Coordinator",
    bullets: [
      { text: "Responsible for various administrative tasks.", expected: g(P, S, M, M) },
      { text: "Prepared employment contracts for temporary workers.", expected: g(S, S, S, M) },
      { text: "Coordinated onboarding documentation between recruiters and payroll teams.", expected: g(S, S, S, M) },
    ],
  },
  {
    id: "en-market-analyst", locale: "en", title: "Market Analyst",
    bullets: [
      { text: "Supported Romanian market-entry planning through partner outreach.", expected: g(P, S, P, P) },
      { text: "Increased efficiency by 75% using advanced solutions.", expected: g(M, P, M, P) },
    ],
  },
  {
    id: "en-support-engineer", locale: "en", title: "Support Engineer",
    bullets: [
      { text: "Investigated failed API requests using application logs.", expected: g(S, S, S, M) },
      { text: "Cut onboarding time from 3 days to 20 minutes by introducing video ID checks.", expected: g(S, S, S, S) },
    ],
  },
  {
    id: "en-placeholder", locale: "en", title: "Shop Supervisor",
    bullets: [
      { text: "TBD", expected: { zero: "placeholder" } },
      { text: "Scheduled weekly shifts for 12 cashiers.", expected: g(S, S, S, S) },
      { text: "Counted the cash drawers at closing and reported differences to the store manager.", expected: g(S, S, S, M) },
    ],
  },
  {
    id: "en-exact-duplicate", locale: "en", title: "Accounts Clerk",
    bullets: [
      { text: "Prepared monthly invoices for 30 clients.", expected: g(S, S, S, S) },
      { text: "Prepared monthly invoices for 30 clients.", expected: { zero: "exactDuplicate" } },
      { text: "Chased overdue invoices by phone and email.", expected: g(S, S, S, M) },
    ],
  },
  {
    id: "en-paraphrased-duplicate", locale: "en", title: "Customer Service Agent",
    bullets: [
      { text: "Answered customer emails about delivery delays.", expected: g(S, S, S, M) },
      { text: "Replied to customers' emails regarding late deliveries.", expected: { zero: "paraphrasedDuplicate" } },
      { text: "Updated the order tracking sheet each morning.", expected: g(S, S, S, M) },
    ],
  },
  {
    id: "en-nurse", locale: "en", title: "Ward Nurse",
    bullets: [
      { text: "Administered scheduled medication and monitored vital signs for 12 patients on a surgical ward.", expected: g(S, S, S, P) },
      { text: "Trained new nurses on the ward's patient handover checklist.", expected: g(S, S, S, M) },
      { text: "Cared for patients.", expected: g(P, S, M, M) },
    ],
  },
  {
    id: "en-warehouse-lead", locale: "en", title: "Warehouse Team Lead",
    bullets: [
      { text: "Scheduled shifts for a team of 18 pickers and loaders each week.", expected: g(S, S, S, S) },
      { text: "Reduced mispicks by introducing a barcode check at packing.", expected: g(S, S, S, P) },
      { text: "Handled warehouse stuff.", expected: g(M, P, M, M) },
    ],
  },
  {
    id: "en-vague-results", locale: "en", title: "Marketing Assistant",
    bullets: [
      { text: "Improved customer satisfaction significantly.", expected: g(M, S, M, P) },
      { text: "Helped the team achieve better results.", expected: g(M, P, M, P) },
      { text: "Managed social media accounts for a local bakery, posting three times a week.", expected: g(S, S, S, S) },
    ],
  },
  {
    id: "ro-contabil", locale: "ro", title: "Contabil",
    bullets: [
      { text: "Întocmit situații financiare lunare pentru 25 de clienți.", expected: g(S, S, S, S) },
      { text: "Înregistrat facturile de la furnizori în programul de contabilitate.", expected: g(S, S, S, M) },
      { text: "Participat la proiecte diverse.", expected: g(P, P, M, M) },
    ],
  },
  {
    id: "ro-administrativ", locale: "ro", title: "Asistent administrativ",
    bullets: [
      { text: "Responsabil de diverse sarcini administrative.", expected: g(P, S, M, M) },
      { text: "Pregătit contracte de muncă pentru lucrători temporari.", expected: g(S, S, S, M) },
      { text: "Coordonat documentația de onboarding între recrutori și echipa de salarizare.", expected: g(S, S, S, M) },
    ],
  },
  {
    id: "ro-placeholder", locale: "ro", title: "Coordonator livrări",
    bullets: [
      { text: "de completat", expected: { zero: "placeholder" } },
      { text: "Organizat livrări zilnice către 15 magazine din București.", expected: g(S, S, S, S) },
      { text: "Rezolvat reclamațiile clienților prin telefon.", expected: g(S, S, S, M) },
    ],
  },
  {
    id: "ro-rezultate-vagi", locale: "ro", title: "Specialist vânzări",
    bullets: [
      { text: "Îmbunătățit eficiența cu 75% prin soluții avansate.", expected: g(M, P, M, P) },
      { text: "Am contribuit la creșterea vânzărilor.", expected: g(M, S, M, P) },
      { text: "Redus timpul de onboarding de la 3 zile la 20 de minute prin verificarea ID-ului video.", expected: g(S, S, S, S) },
    ],
  },
  {
    id: "ro-asistent-medical", locale: "ro", title: "Asistent medical",
    bullets: [
      { text: "Administrat medicamente și monitorizat parametrii vitali pentru pacienții de pe secția de chirurgie.", expected: g(S, S, S, M) },
      { text: "Instruit asistenți noi privind procedura de predare a turei.", expected: g(S, S, S, M) },
      { text: "Îngrijit pacienți.", expected: g(P, S, M, M) },
    ],
  },
  {
    id: "ro-duplicat-parafrazat", locale: "ro", title: "Agent relații clienți",
    bullets: [
      { text: "Răspuns la e-mailurile clienților despre întârzierile livrărilor.", expected: g(S, S, S, M) },
      { text: "Răspuns clienților prin e-mail cu privire la livrări întârziate.", expected: { zero: "paraphrasedDuplicate" } },
      { text: "Actualizat zilnic tabelul de urmărire a comenzilor.", expected: g(S, S, S, M) },
    ],
  },
];

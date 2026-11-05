// Fictional people only. Score cases carry the grades a careful reviewer expects, in the order
// contribution / clarity / specificity / impact. Bullets marked `zero` are checked another way (see run.eval.ts).
import type { Experience, Grade, Locale } from "@resumora/shared";

type G = Grade;
const M: G = "missing";
const P: G = "partial";
const S: G = "specific";

export type Expected = { grades: [G, G, G, G] } | { zero: "placeholder" | "exactDuplicate" | "paraphrasedDuplicate" };
export type ScoreCase = { id: string; locale: Locale; title: string; bullets: { text: string; expected: Expected }[] };

const g = (c: G, cl: G, s: G, i: G): Expected => ({ grades: [c, cl, s, i] });

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

export type RewriteCase = { id: string; trap: string; locale: Locale; role: Experience; usesNumber?: string; rangeOnly?: string };

const role = (id: string, title: string, bullets: string[], notes: [string, string, "pick" | "type"][] = []): Experience => ({
  id, company: "Fictional Co", title, location: "", startDate: "2021-01", endDate: "2023-06", current: false, description: "",
  bullets: bullets.map((text, i) => ({ id: `b${i + 1}`, text })),
  notes: notes.map(([question, answer, via], i) => ({ id: `n${i + 1}`, question, answer, via: [via], askedAt: "2026-11-05T09:00:00.000Z" })),
});

export const REWRITE_CASES: RewriteCase[] = [
  {
    id: "vague-number", trap: "A bullet already holds a vague number (40%); the note explains the work but adds no figures.", locale: "en",
    role: role("r1", "Support Team Lead", ["Improved response times by 40% across the support desk.", "Handled escalations."], [
      ["What did you do to improve response times?", "I set up a shared inbox with saved replies and a rota for who answers first.", "type"],
    ]),
  },
  {
    id: "answer-adds-number", trap: "The note gives a real figure (about 60 calls a day); the rewrite may use it.", locale: "en", usesNumber: "60",
    role: role("r2", "Receptionist", ["Answered customer calls.", "Kept the visitor log."], [
      ["About how many calls did you take a day?", "About 60 calls a day, mostly booking questions.", "type"],
    ]),
  },
  {
    id: "no-answers", trap: "No notes at all: the rewrite must not add any number.", locale: "en",
    role: role("r3", "Dispatcher", ["Did various admin tasks.", "Prepared delivery schedules for drivers."]),
  },
  {
    id: "duplicate-pair", trap: "Two bullets say the same thing; one note belongs to both.", locale: "en",
    role: role("r4", "Store Assistant", ["Helped customers find products.", "Assisted shoppers in finding items.", "Restocked shelves in the morning."], [
      ["What kind of products did customers ask about most?", "Mostly garden tools and paint.", "type"],
    ]),
  },
  {
    id: "romanian-role", trap: "A Romanian role: the rewrite must stay in Romanian.", locale: "ro",
    role: role("r5", "Asistent de depozit", ["Ajutat la pregătirea comenzilor.", "Răspuns de diverse activități în depozit."], [
      ["Ce ai făcut concret la pregătirea comenzilor?", "Am scanat codurile de bare și am împachetat coletele pentru curier.", "type"],
    ]),
  },
  {
    id: "range-only", trap: "The note is only a picked range (10–50 a week); the rewrite may use the range, never an exact number.", locale: "en", rangeOnly: "10–50",
    role: role("r6", "Training Assistant", ["Trained new staff.", "Prepared welcome packs."], [
      ["How many new people did you train?", "10–50 a week", "pick"],
    ]),
  },
];

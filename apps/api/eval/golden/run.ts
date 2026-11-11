// Runs the prompts as they are in this checkout on the golden set and collects what the person would see:
// enrichment questions per role, tailoring questions per role, and the rewrites tailoring proposes.
// Then it looks for the known bad patterns. The outputs are compared side by side in report.ts.
import { fingerprint, isRoleSection, type CvContent, type TailorSection } from "@resumora/shared";
import type { AiCallLog, ModelDeps } from "../../src/ai/call-model.ts";
import { createApp, type AppDeps } from "../../src/app.ts";
import { memoryCvRepo } from "../../src/cv/memory-repo.ts";
import { memoryInsightsRepo } from "../../src/enrich/memory-repo.ts";
import { scoreRole } from "../../src/enrich/score.ts";
import { memoryJobs } from "../../src/jobs/memory-repo.ts";
import { memoryTailorDocs, memoryTailorRepo } from "../../src/tailor/memory-repo.ts";
import type { GoldenCase } from "./cases.ts";

export type Asked = { text: string; options: string[]; kind?: string };
export type Rewrite = { before: string; after: string; inferred: boolean };
export type RoleOutput = {
  roleId: string;
  title: string;
  company: string;
  period: string;
  past: boolean;
  enrichQuestions: Asked[];
  tailorQuestions: Asked[];
  rewrites: Rewrite[];
  hits: string[];
};
export type CaseOutput = { id: string; what: string; tailoredIn: string | null; roles: RoleOutput[]; problems: string[]; calls: number };

// ---- the known bad patterns ----

const OTHER_OPTION = /^\s*(other|others|something else|none of (the|these) above|none|n\/a|altele|altceva|alt(ul|a)?|niciuna|niciunul|nimic din cele de mai sus)\b[\s:.()\w-]*$/i;
/** Tools and ideas that did not exist in everyday work before these years. */
const NEW_THINGS: Array<[RegExp, number]> = [
  [/\b(gpt(-?\d)?|chatgpt|openai|claude|llms?|large language models?|generative ai|genai|copilot)\b/i, 2022],
  [/\b(n8n)\b/i, 2019],
];
const AI_WORD = /\b(ai|artificial intelligence|inteligență artificială|ia)\b/i;
const OLD_TEMPLATE = /we think you know|credem că (știi|cunoști)/i;
const OTHER_ROLES = /\b(your previous roles?|in your (other|earlier) roles?|rolurile (tale )?anterioare|în alte roluri)\b/i;
const RO_MARKS = /[ăâîșț]|\b(și|sau|care|pentru|este|ești|cum|câte|câți|cât|ce|ai|în|cu|la|din|acest|această)\b/i;
const EN_MARKS = /\b(the|and|or|which|what|how|did|do|you|your|with|for|this|that|in|of|to)\b/i;
/** English: a past role's bullet that opens with a present-tense verb. */
const EN_PRESENT_OPENING = /^(build|maintain|manage|lead|design|create|develop|support|handle|coordinate|automate|connect|fix|write|run|prepare|sell|arrange|deliver|ensure|validate|monitor|document|analy[sz]e)s?\b/i;
/** Romanian: a past role's bullet that opens with a present-tense verb form. */
const RO_PRESENT_OPENING = /^(construiesc|întrețin|gestionez|coordonez|proiectez|creez|dezvolt|rezolv|automatizez|conectez|scriu|pregătesc|vând|aranjez|asigur|monitorizez|documentez|analizez|introduc|primesc)\b/i;

function looksLike(text: string): "en" | "ro" | "unclear" {
  const words = text.toLowerCase().split(/\s+/);
  const ro = words.filter((w) => RO_MARKS.test(w)).length;
  const en = words.filter((w) => EN_MARKS.test(w)).length;
  if (ro === en) return "unclear";
  return ro > en ? "ro" : "en";
}

function endYear(role: CvContent["experience"][number]): number | null {
  const year = Number((role.endDate || "").slice(0, 4));
  return role.current || !year ? null : year;
}

/** Every bad pattern found in one role's output, in plain words. */
export function patternHits(golden: GoldenCase, role: CvContent["experience"][number], out: Omit<RoleOutput, "hits">): string[] {
  const hits: string[] = [];
  const others = golden.cv.experience.filter((r) => r.id !== role.id).map((r) => r.company).filter((c) => c.length > 3);
  const ended = endYear(role);
  const questions = [...out.enrichQuestions.map((q) => ({ ...q, where: "enrichment" })), ...out.tailorQuestions.map((q) => ({ ...q, where: "tailoring" }))];
  for (const q of questions) {
    const shown = `“${q.text}”`;
    for (const company of others) if (q.text.toLowerCase().includes(company.toLowerCase())) hits.push(`names another employer (${company}) in a ${q.where} question: ${shown}`);
    if (OTHER_ROLES.test(q.text)) hits.push(`talks about other roles in a ${q.where} question: ${shown}`);
    if (OLD_TEMPLATE.test(q.text)) hits.push(`uses the "We think you know…" wording: ${shown}`);
    for (const option of q.options) if (OTHER_OPTION.test(option)) hits.push(`has an "other" answer option (“${option}”) on: ${shown}`);
    if (ended !== null) {
      for (const [pattern, since] of NEW_THINGS) if (ended < since && pattern.test(q.text)) hits.push(`asks a role that ended in ${ended} about something newer: ${shown}`);
      if (ended < 2022 && AI_WORD.test(q.text)) hits.push(`asks a role that ended in ${ended} about AI: ${shown}`);
    }
    const language = looksLike(q.text);
    if (language !== "unclear" && language !== golden.interfaceLanguage) hits.push(`${q.where} question is in ${language === "ro" ? "Romanian" : "English"}, the interface is in ${golden.interfaceLanguage === "ro" ? "Romanian" : "English"}: ${shown}`);
  }
  for (const rewrite of out.rewrites) {
    if (out.past && (EN_PRESENT_OPENING.test(rewrite.after) || RO_PRESENT_OPENING.test(rewrite.after))) hits.push(`past role rewritten in the present tense: “${rewrite.after}”`);
    const language = looksLike(rewrite.after);
    if (language !== "unclear" && language !== golden.tailoringLanguage) hits.push(`rewrite is in ${language === "ro" ? "Romanian" : "English"}, the tailored CV should be in ${golden.tailoringLanguage === "ro" ? "Romanian" : "English"}: “${rewrite.after}”`);
    for (const company of others) if (rewrite.after.toLowerCase().includes(company.toLowerCase())) hits.push(`rewrite names another employer (${company}): “${rewrite.after}”`);
  }
  return hits;
}

/** The same job theme pushed onto every role: a word from the ad's requirements that every role is asked about. */
export function forcedThemes(golden: GoldenCase, roles: RoleOutput[]): string[] {
  if (roles.length < 3) return [];
  const terms = new Set(golden.job.requirements.flatMap((r) => r.text.match(/\b[A-Za-z][A-Za-z0-9+#.-]{2,}\b/g) ?? []).map((t) => t.toLowerCase())
    .filter((t) => !["with", "and", "for", "the", "sau", "cu", "de", "years", "experience", "experiență", "good", "basic", "minimum", "ani", "nivel", "limba"].includes(t)));
  return [...terms].filter((term) => roles.every((role) => role.tailorQuestions.some((q) => q.text.toLowerCase().includes(term))))
    .map((term) => `every role is asked about “${term}”, whatever its dates or kind of work`);
}

// ---- running one case ----

type LooseQuestion = { text?: string; question?: string | null; options?: string[]; kind?: string };
const asked = (q: LooseQuestion): Asked | null => {
  const text = q.text ?? q.question ?? "";
  return text ? { text, options: q.options ?? [], kind: q.kind } : null;
};

export async function runCase(golden: GoldenCase, model: (calls: AiCallLog[]) => ModelDeps): Promise<CaseOutput> {
  const calls: AiCallLog[] = [];
  const runModel = model(calls);
  const userId = "golden-user";
  const out: CaseOutput = { id: golden.id, what: golden.what, tailoredIn: null, roles: [], problems: [], calls: 0 };
  const byRole = new Map<string, Omit<RoleOutput, "hits">>();
  for (const role of golden.cv.experience) {
    byRole.set(role.id, {
      roleId: role.id, title: role.title, company: role.company, period: `${role.startDate} – ${role.current ? "present" : role.endDate}`, past: !role.current,
      enrichQuestions: [], tailorQuestions: [], rewrites: [],
    });
  }

  const cv = memoryCvRepo();
  await cv.save(golden.cv, 0);

  // Enrichment: the questions a person gets for each role of the base CV.
  const insights = memoryInsightsRepo(userId);
  for (const role of golden.cv.experience) {
    try {
      const result = await scoreRole({ cv, insights, model: runModel, userId, ...({ interfaceLanguage: golden.interfaceLanguage }) } as Parameters<typeof scoreRole>[0],
        { roleId: role.id, fingerprint: fingerprint(role, golden.cv.locale) }) as unknown as { roleQuestions?: LooseQuestion[]; bullets?: LooseQuestion[] };
      const target = byRole.get(role.id)!;
      for (const q of [...(result.roleQuestions ?? []), ...(result.bullets ?? [])]) {
        const one = asked(q);
        if (one) target.enrichQuestions.push(one);
      }
    } catch (cause) {
      out.problems.push(`enrichment questions failed for ${role.title}: ${(cause as Error).message.slice(0, 200)}`);
    }
  }

  // Tailoring: through the API routes, as the web app does. No answers are given.
  const jobs = memoryJobs({ now: () => new Date() });
  const docs = memoryTailorDocs();
  const deps: AppDeps = {
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "golden" ? { id: userId, token } : null),
    cvRepo: () => cv,
    importRepo: () => { throw new Error("not used"); },
    jobRepo: (user) => jobs.repoFor(user.id),
    tailorRepo: (user) => memoryTailorRepo(user.id, new Map(), docs),
    insightsRepo: () => insights,
    model: () => runModel,
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
    log: () => {},
  };
  const app = createApp(deps);
  const post = async (path: string, body: unknown = {}) => {
    const res = await app.request(path, {
      method: "POST",
      // The interface language travels as a header once the server reads it; older code ignores it.
      headers: { authorization: "Bearer golden", "content-type": "application/json", "x-interface-language": golden.interfaceLanguage },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<Record<string, unknown>>;
  };

  try {
    const jobId = crypto.randomUUID();
    await jobs.repoFor(userId).create({ id: jobId, source: "link", url: "https://example.test/job", urlNormalized: jobId, rawText: "golden", jsonLd: null });
    await jobs.admin.finish(jobId, golden.job);
    const start = await post(`/v1/jobs/${jobId}/tailor`, { tone: "neutral" }) as { language?: string; run: { id: string; sections: TailorSection[]; currentRoleId?: string | null } };
    out.tailoredIn = start.language ?? null;
    let roleId = start.run.currentRoleId ?? null;
    for (const section of start.run.sections) {
      if (!isRoleSection(section)) continue; // questions and per-role rewrites are what the golden set is about
      do {
        const body = roleId ? { roleId } : {};
        const target = roleId ? byRole.get(roleId) : undefined;
        const original = new Map(golden.cv.experience.flatMap((role) => [[role.id, role.description] as const, ...role.bullets.map((b) => [b.id, b.text] as const)]));
        try {
          const { questions } = await post(`/v1/tailor-runs/${start.run.id}/sections/${section}/questions`, body) as { questions: LooseQuestion[] };
          for (const q of questions) { const one = asked(q); if (one && target) target.tailorQuestions.push(one); }
        } catch (cause) {
          out.problems.push(`tailoring questions failed for ${target?.title ?? section}: ${(cause as Error).message.slice(0, 200)}`);
        }
        const pass = await post(`/v1/tailor-runs/${start.run.id}/sections/${section}/run`, body) as { proposals: Array<{ itemId: string; text: string; inferred: boolean }> };
        for (const proposal of pass.proposals) {
          if (target) target.rewrites.push({ before: original.get(proposal.itemId) ?? "(new)", after: proposal.text, inferred: proposal.inferred });
        }
        const accepted = await post(`/v1/tailor-runs/${start.run.id}/sections/${section}/accept`, body) as { run: { currentSection: string | null; currentRoleId?: string | null } };
        roleId = accepted.run.currentRoleId ?? null;
        if (accepted.run.currentSection !== section) break;
      } while (roleId);
    }
  } catch (cause) {
    out.problems.push(`tailoring failed: ${(cause as Error).message.slice(0, 300)}`);
  }

  out.roles = golden.cv.experience.map((role) => {
    const collected = byRole.get(role.id)!;
    return { ...collected, hits: patternHits(golden, role, collected) };
  });
  const themes = forcedThemes(golden, out.roles);
  if (themes.length && out.roles[0]) out.roles[0].hits.push(...themes);
  if (out.tailoredIn && out.tailoredIn !== golden.tailoringLanguage) out.problems.push(`tailoring started in "${out.tailoredIn}", expected "${golden.tailoringLanguage}"`);
  out.calls = calls.length;
  return out;
}

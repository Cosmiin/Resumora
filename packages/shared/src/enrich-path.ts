import { z } from "zod";
import { MAX_TEXT, type Experience } from "./cv.ts";
import { MAX_PROPOSAL, UNSCORED_TOPICS, type Question, type RoleQuestion, type RoleResult } from "./enrich.ts";

/** The short enrichment path asks at most this many questions per round, across the whole CV. */
export const PATH_BUDGET = 8;

/** Two questions are the same when their words are, whatever the spacing or capitals. */
export const questionKey = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

const LEGAL_ENDINGS = ["s.r.l.", "srl", "s.a.", "sa", "inc.", "inc", "ltd.", "ltd", "llc", "gmbh", "ag", "plc", "corp.", "corp", "co."];

/**
 * One key per company, so roles at the same employer share one answer: lower case, spaces collapsed, a legal ending
 * ("SRL", "Inc.", "Ltd"…) dropped. Empty for a blank name; a name that is only a legal ending is kept.
 */
export function companyKey(name: string): string {
  let key = name.trim().replace(/\s+/g, " ").toLowerCase().replace(/,$/, "");
  for (const ending of LEGAL_ENDINGS) {
    if (key.endsWith(` ${ending}`)) {
      key = key.slice(0, -ending.length - 1).replace(/,$/, "").trim();
      break;
    }
  }
  return key;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The tool is named in the role's own text (title, description, lines) or in an answer the person gave. */
export function toolShown(role: Pick<Experience, "title" | "description" | "bullets" | "notes">, tool: string): boolean {
  const name = tool.trim();
  if (name === "") return false;
  // Whole words of the tool, so "BI" is not found in "mobile" and "C" is not "C++".
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}+#])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}+#])`, "iu");
  const texts = [role.title, role.description, ...role.bullets.map((b) => b.text), ...role.notes.map((n) => n.answer)];
  return texts.some((text) => pattern.test(text));
}

/**
 * POST /v1/enrich/companies: what each company does, when the AI knows it for sure. Keys are `companyKey`s.
 * selfEmployed: the name is the person working for themselves (self-employed, freelancing), so there is no company to
 * describe and nothing to ask.
 */
export const CompaniesAnswerSchema = z.object({
  companies: z.array(z.object({
    key: z.string().max(MAX_TEXT), proposal: z.string().max(MAX_PROPOSAL).nullable(), selfEmployed: z.boolean().optional(),
  }).strict()).max(80),
}).strict();
export type CompaniesAnswer = z.infer<typeof CompaniesAnswerSchema>;

/** POST /v1/enrich/tools: the tools each role likely used, those its text names first. */
export const MAX_ROLE_TOOLS = 8;
export const ToolsAnswerSchema = z.object({
  roles: z.array(z.object({ roleId: z.string().max(64), tools: z.array(z.string().min(1).max(40)).max(MAX_ROLE_TOOLS) }).strict()).max(80),
}).strict();
export type ToolsAnswer = z.infer<typeof ToolsAnswerSchema>;

/** One question of the path's budget, with the role it is about. */
export type BudgetItem =
  | { roleId: string; kind: "role"; question: RoleQuestion }
  | { roleId: string; kind: "line"; question: Question };

/** A question about the whole role counts as this much of a line's gap (a line's gap is 100 minus its score). */
const ROLE_QUESTION_VALUE = 40;

/**
 * The questions worth the most across the whole CV. Company and tools are asked on their own screens, so they never
 * come here; a question whose key is in `asked` is left out. A line question is worth its gap to 100, a question about
 * the whole role a fixed 40, both times the role's weight. The top `size` are returned in CV order, a role's questions
 * about the whole role before its line questions, so the person moves from role to role as rarely as possible.
 * Questions about the four "worth adding" items (leadership, seniority, people, domain) don't move the score, so they
 * are picked only when no other question is left (score/9).
 */
export function pickBudget(input: {
  items: readonly { id: string; result: RoleResult | undefined }[];
  weights: ReadonlyMap<string, number>;
  asked: ReadonlySet<string>;
  size?: number;
}): BudgetItem[] {
  const size = input.size ?? PATH_BUDGET;
  const candidates: { item: BudgetItem; value: number; order: number; tier: number }[] = [];
  input.items.forEach(({ id, result }, roleIndex) => {
    if (!result) return;
    const weight = input.weights.get(id) ?? 1;
    // A role question is asked once per role; a line question once per line (two lines may share a wording).
    const seen = new Set<string>();
    const fresh = (text: string, line = "") => {
      const key = questionKey(text);
      if (key === "" || input.asked.has(key) || seen.has(`${line}\u0000${key}`)) return false;
      seen.add(`${line}\u0000${key}`);
      return true;
    };
    let within = 0;
    for (const question of result.roleQuestions) {
      if (question.topic === "company" || question.topic === "tools" || !fresh(question.text)) continue;
      const tier = UNSCORED_TOPICS.includes(question.topic) ? 2 : 1;
      candidates.push({ item: { roleId: id, kind: "role", question }, value: ROLE_QUESTION_VALUE * weight, order: roleIndex * 1000 + within++, tier });
    }
    for (const question of result.questions) {
      if (!fresh(question.text, question.bulletId)) continue;
      const score = result.bullets.find((b) => b.id === question.bulletId)?.score ?? 0;
      candidates.push({ item: { roleId: id, kind: "line", question }, value: (100 - score) * weight, order: roleIndex * 1000 + 500 + within++, tier: 1 });
    }
  });
  return candidates
    .sort((a, b) => a.tier - b.tier || b.value - a.value || a.order - b.order)
    .slice(0, size)
    .sort((a, b) => a.order - b.order)
    .map((c) => c.item);
}

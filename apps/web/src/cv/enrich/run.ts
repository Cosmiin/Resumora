import { BRAIN_DUMP_QUESTION, CONDITIONAL_TOPICS, type Question, type RoleQuestion, type RoleResult } from "@resumora/shared";

/** A role's questions are answered in one run of at most this many; the rest wait behind "A few more questions". */
export const RUN_MAX = 6;
/** At most this many quick checks (leadership, seniority, people, domain) in one run. */
export const RUN_CHECKS = 2;

/** One screen of a run: the opening box of a thin role, a question about the role, or one about a line. */
export type RunItem =
  | { key: string; kind: "box" }
  | { key: string; kind: "role"; question: RoleQuestion }
  | { key: string; kind: "line"; question: Question; followUp?: true };

/** Two questions are the same when their words are, whatever the spacing or capitals. */
export const questionKey = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** The text an item's answer is saved under. */
export const itemQuestion = (item: RunItem) => (item.kind === "box" ? BRAIN_DUMP_QUESTION : item.question.text);

/**
 * Every question a role's score leaves open, in the order a run asks them: the opening box of a thin role, what is
 * missing from the page (company, purpose, tools), up to two quick checks, the lines (weakest first, as the score
 * sorts them), then anything else about the role and the checks that did not fit. Questions already answered
 * (`answered` holds their keys) and repeats are left out. The first RUN_MAX are one run.
 */
export function buildRun(result: RoleResult | undefined, opts: { thin: boolean; answered: ReadonlySet<string> }): RunItem[] {
  const seen = new Set(opts.answered);
  const fresh = (text: string) => {
    const key = questionKey(text);
    if (key === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  const role = (result?.roleQuestions ?? []).filter((q) => fresh(q.text)).map((question): RunItem => ({ key: `role:${question.id}`, kind: "role", question }));
  const topicOf = (item: RunItem) => (item.kind === "role" ? item.question.topic : null);
  const core = (["company", "purpose", "tools"] as const).flatMap((topic) => role.filter((item) => topicOf(item) === topic));
  const checks = role.filter((item) => CONDITIONAL_TOPICS.includes(topicOf(item)!));
  const other = role.filter((item) => topicOf(item) === "other");
  const lines = (result?.questions ?? []).filter((q) => fresh(q.text)).map((question): RunItem => ({ key: `line:${question.bulletId}`, kind: "line", question }));
  const box: RunItem[] = opts.thin && !opts.answered.has(questionKey(BRAIN_DUMP_QUESTION)) ? [{ key: "box", kind: "box" }] : [];
  return [...box, ...core, ...checks.slice(0, RUN_CHECKS), ...lines, ...other, ...checks.slice(RUN_CHECKS)];
}

/** One run and what waits after it. */
export function splitRun(all: readonly RunItem[]): { items: RunItem[]; rest: RunItem[] } {
  return { items: all.slice(0, RUN_MAX), rest: all.slice(RUN_MAX) };
}

/** What the page can still be missing that a question about one line can add. */
export const GAPS = ["results", "tools", "scale"] as const;
export type Gap = (typeof GAPS)[number];

/**
 * The app's own questions, for a role below 80 that the reviewer has nothing left to ask about: one per thing the
 * page still does not show (a result, a tool, a size), each put to one line so its answer has a place to go.
 * A result is asked of the best line that has none; the others of the best lines not yet used.
 */
export function gapItems(result: RoleResult, bullets: readonly { id: string; text: string }[], ask: Record<Gap, string>): RunItem[] {
  const marks = result.coverage?.marks;
  if (!marks) return [];
  const grades = new Map(result.bullets.map((b) => [b.id, b]));
  const real = bullets.filter((b) => {
    const g = grades.get(b.id);
    return b.text.trim() !== "" && !!g && g.issue !== "example" && g.issue !== "duplicate";
  });
  const used = new Set<string>();
  const best = (list: typeof real) => [...list].sort((a, b) => grades.get(b.id)!.score - grades.get(a.id)!.score)[0];
  const items: RunItem[] = [];
  for (const gap of GAPS) {
    if (marks[gap] === "shown") continue;
    const free = real.filter((b) => !used.has(b.id));
    const line = (gap === "results" ? best(free.filter((b) => grades.get(b.id)!.impact !== "specific")) : undefined) ?? best(free) ?? best(real);
    if (!line) continue;
    used.add(line.id);
    items.push({ key: `gap:${gap}`, kind: "line", question: { bulletId: line.id, text: ask[gap], options: [], kind: gap === "results" ? "result" : "detail" } });
  }
  return items;
}

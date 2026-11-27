import type { JobExtraction, TailorQuestion } from "@resumora/shared";

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
/** One word in two forms ("metrics" and "metric", "debugging" and "debug"): a shared start of four letters or more, a short ending apart. */
const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 4);
/** How much of the ad a question shows. */
const MAX = 170;

/**
 * The ad's own sentence that names a requirement or keyword, cut to a short piece around it. Null when no sentence of
 * the ad has all of its words: then nothing is quoted (the ad is never paraphrased here).
 */
export function adLine(adText: string | null | undefined, label: string): string | null {
  // Every word counts, two-letter ones too: "BI tools" is not any sentence with "tool" in it.
  const needed = words(label).filter((word) => word.length >= 2);
  if (!adText || needed.length === 0) return null;
  const sentences = adText.split(/\n+/).flatMap((line) => line.split(/(?<=[.!?])\s+/)).map((part) => part.trim()).filter(Boolean);
  const hits = sentences.filter((sentence) => { const have = words(sentence); return needed.every((word) => have.some((other) => same(other, word))); });
  if (hits.length === 0) return null;
  // A real sentence over a heading or a label ("Team: Employee Relations & Transitions"); among those, the shortest.
  const full = hits.filter((sentence) => words(sentence).length >= 8);
  const best = (full.length > 0 ? full : hits).sort((a, b) => a.length - b.length)[0]!;
  if (best.length <= MAX) return best;
  // Too long: a piece of it around the first of the words, cut at word ends.
  const longest = [...needed].sort((x, y) => y.length - x.length)[0]!;
  const at = Math.max(0, best.toLowerCase().indexOf(longest.slice(0, 4)));
  let start = Math.max(0, at - Math.floor(MAX / 2));
  let end = Math.min(best.length, start + MAX);
  start = Math.max(0, end - MAX);
  if (start > 0) start = best.indexOf(" ", start) + 1;
  if (end < best.length) end = best.lastIndexOf(" ", end);
  return `${start > 0 ? "…" : ""}${best.slice(start, end).replace(/[,;:]$/, "")}${end < best.length ? "…" : ""}`;
}

/**
 * Why a gap question is asked: what kind of thing the ad wants it for (a must-have, a nice-to-have, a keyword), and
 * the ad's own words about it when they can be found.
 */
export function withWhy<Q extends TailorQuestion>(question: Q, job: Pick<JobExtraction, "requirements">, adText: string | null | undefined): Q {
  if (question.scope !== "all" || !question.gap) return question;
  const requirement = /^r\d+$/.test(question.gap) ? job.requirements[Number(question.gap.slice(1))] : undefined;
  const need = question.gap.startsWith("k:") ? "keyword" as const : requirement ? (requirement.kind === "must" ? "must" as const : "nice" as const) : undefined;
  if (!need) return question;
  const label = requirement?.text ?? question.gap.slice(2);
  const line = adLine(adText, label);
  return { ...question, need, ...(line ? { adLine: line } : {}) };
}

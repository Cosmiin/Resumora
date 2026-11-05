// Manual evaluation: scores synthetic roles and streams rewrites with the real AI providers.
// Run from the repo root: npm run eval:enrich
// Only some cases: EVAL_CASE=ro npm run eval:enrich   (matches the start of the case id)
// The full run is saved to apps/api/node_modules/.cache/eval/enrich-last.json for a closer look.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ModelScoreSchema, buildRoleResult, fingerprint, hasUnknownNumber, isAllowedOption, type Grade, type Experience } from "@resumora/shared";
import { callModel, providersFromEnv, type AiCallLog, type ModelDeps } from "../../src/ai/call-model.ts";
import { streamModel } from "../../src/ai/stream-model.ts";
import { BlockParser } from "../../src/enrich/blocks.ts";
import { checkProposal, rewriteEvents, roleSources } from "../../src/enrich/rewrite.ts";
import { rewriteRoleSystemPrompt, rewriteRoleUserMessage } from "../../src/enrich/rewrite-prompts.ts";
import { scoreSystemPrompt, scoreUserMessage } from "../../src/enrich/prompts.ts";
import { REWRITE_CASES, SCORE_CASES, type RewriteCase, type ScoreCase } from "./cases.ts";

const OUT = join(import.meta.dirname, "../../node_modules/.cache/eval/enrich-last.json");
/** USD per token, from openrouter.ai/api/v1/models on 2026-11-04 (same table as the import eval). */
const PRICES: Record<string, { input: number; output: number }> = {
  "openrouter:google/gemini-3.1-flash-lite": { input: 0.00000025, output: 0.0000015 },
  "openai:gpt-5.4-mini": { input: 0.00000075, output: 0.0000045 },
};
const MIN_GRADE_AGREEMENT = 0.9;
const GRADES: Grade[] = ["missing", "partial", "specific"];
const DIMENSIONS = ["contribution", "clarity", "specificity", "impact"] as const;

const envPick = (k: string) => process.env[k] ?? "";
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const usd = (n: number) => `$${n.toFixed(4)}`;
const within1 = (a: Grade, b: Grade) => Math.abs(GRADES.indexOf(a) - GRADES.indexOf(b)) <= 1;

function makeModel(calls: AiCallLog[]): ModelDeps {
  return {
    providers: providersFromEnv({
      OPENROUTER_API_KEY: envPick("OPENROUTER_API_KEY"),
      OPENROUTER_MODEL: envPick("OPENROUTER_MODEL"),
      OPENAI_API_KEY: envPick("OPENAI_API_KEY"),
      OPENAI_MODEL: envPick("OPENAI_MODEL"),
    }),
    fetch,
    logCall: async (entry: AiCallLog) => void calls.push(entry),
  };
}

/** Counts every call that reported tokens; a model with no price here is reported and counts as $0. */
function costOf(calls: AiCallLog[]): { cost: number; unpriced?: string } {
  let unpriced: string | undefined;
  const cost = calls.reduce((sum, c) => {
    const price = PRICES[`${c.provider}:${c.model}`];
    if (!price) unpriced = `${c.provider}:${c.model}`;
    return sum + (price ? (c.inputTokens ?? 0) * price.input + (c.outputTokens ?? 0) * price.output : 0);
  }, 0);
  return { cost, unpriced };
}

// ---------- score cases ----------

type BulletRow = { text: string; kind: "graded" | "zero"; zeroKind?: string; got: Record<string, Grade>; score: number; ok: boolean; dims: boolean[] };
type ScoreRow = { id: string; seconds: number; cost: number; unpriced?: string; bullets: BulletRow[]; optionsTotal: number; optionsWithNumber: number; error?: string };

async function runScoreCase(c: ScoreCase): Promise<ScoreRow> {
  const calls: AiCallLog[] = [];
  const role: Experience = {
    id: c.id, company: "Fictional Co", title: c.title, location: "", startDate: "2021-01", endDate: "2023-06", current: false, description: "",
    bullets: c.bullets.map((b, i) => ({ id: `b${i + 1}`, text: b.text })), notes: [],
  };
  const started = Date.now();
  const base = { id: c.id, bullets: [] as BulletRow[], optionsTotal: 0, optionsWithNumber: 0 };
  try {
    const answer = await callModel(makeModel(calls), {
      userId: "eval", task: "enrich_score", schema: ModelScoreSchema,
      system: scoreSystemPrompt(c.locale), user: scoreUserMessage(role),
      maxOutputTokens: Math.min(4000, 600 + 180 * role.bullets.length),
    });
    const options = answer.bullets.flatMap((b) => b.options);
    const result = buildRoleResult(role, answer, fingerprint(role, c.locale));
    const bullets = c.bullets.map((b, i): BulletRow => {
      const r = result.bullets[i]!;
      const got = { contribution: r.contribution, clarity: r.clarity, specificity: r.specificity, impact: r.impact };
      if ("zero" in b.expected) {
        // Placeholder and exact duplicate must score 0; a paraphrased duplicate is reported but not part of the bar.
        const required = b.expected.zero !== "paraphrasedDuplicate";
        return { text: b.text, kind: "zero", zeroKind: b.expected.zero, got, score: r.score, ok: !required || r.score === 0, dims: [] };
      }
      const want = b.expected.grades;
      const dims = DIMENSIONS.map((d, k) => within1(got[d], want[k]!));
      return { text: b.text, kind: "graded", got, score: r.score, ok: dims.every(Boolean), dims };
    });
    const { cost, unpriced } = costOf(calls);
    return { ...base, seconds: (Date.now() - started) / 1000, cost, unpriced, bullets, optionsTotal: options.length, optionsWithNumber: options.filter((o) => !isAllowedOption(o)).length };
  } catch (err) {
    const { cost, unpriced } = costOf(calls);
    return { ...base, seconds: (Date.now() - started) / 1000, cost, unpriced, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- rewrite cases ----------

const RO_DIACRITICS = /[ăâîșțşţ]/i;
const RO_STOP = new Set(["și", "de", "la", "pentru", "cu", "în", "din", "pe"]);
const EN_STOP = new Set(["the", "and", "for", "with", "of"]);
const words = (t: string) => t.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
const count = (t: string, set: Set<string>) => words(t).filter((w) => set.has(w)).length;
/** Romanian when it has Romanian letters or at least 2 Romanian stop words, and at most 1 English stop word. */
const looksRomanian = (t: string) => (RO_DIACRITICS.test(t) || count(t, RO_STOP) >= 2) && count(t, EN_STOP) <= 1;
const looksEnglish = (t: string) => !RO_DIACRITICS.test(t) && count(t, RO_STOP) < 2;

type Proposal = { replaces: string | null; before: string | null; after: string };
type RewriteRow = {
  id: string; seconds: number; cost: number; unpriced?: string; firstWordMs: number | null;
  ready: Proposal[]; dropped: { replaces: string | null; reason: string }[];
  rawUnknownNumbers: number; readyUnknownNumbers: number; languageOk: boolean; rangeOk: boolean; usedNumber: boolean | null; error?: string; pass: boolean;
};

async function runRewriteCase(c: RewriteCase): Promise<RewriteRow> {
  const calls: AiCallLog[] = [];
  const role = c.role;
  const keep = new Set<string>();
  const rawTexts: string[] = [];
  const started = Date.now();
  let firstWordMs: number | null = null;
  const ready: Proposal[] = [];
  const dropped: RewriteRow["dropped"] = [];
  const keys = new Map<number, string>();
  let error: string | undefined;
  const chunks = streamModel(makeModel(calls), {
    userId: "eval", task: "enrich_rewrite_role",
    system: rewriteRoleSystemPrompt(c.locale), user: rewriteRoleUserMessage(role, keep), maxOutputTokens: 2500,
  });
  // The raw end-block texts (before the check) come from a second parser fed with the same chunks.
  const raw = new BlockParser();
  const tapped = (async function* () {
    for await (const chunk of chunks) {
      for (const e of raw.push(chunk)) if (e.type === "end" && e.index >= 0) rawTexts.push(e.text);
      yield chunk;
    }
    for (const e of raw.end()) if (e.type === "end") rawTexts.push(e.text);
  })();
  for await (const e of rewriteEvents(tapped, (key, text) => checkProposal(role, key, text, keep))) {
    if (e.event === "start") keys.set(e.data.index, e.data.replaces ?? "new");
    if (e.event === "delta" && firstWordMs === null) firstWordMs = Date.now() - started;
    const replaces = (i: number) => (keys.get(i) === "new" ? null : keys.get(i) ?? null);
    if (e.event === "ready") ready.push({ replaces: replaces(e.data.index), before: role.bullets.find((b) => b.id === keys.get(e.data.index))?.text ?? null, after: e.data.text });
    if (e.event === "dropped") dropped.push({ replaces: replaces(e.data.index), reason: e.data.reason });
    if (e.event === "error") error = `${e.data.code}: ${e.data.message}`;
  }
  const sources = roleSources(role);
  const rawUnknownNumbers = rawTexts.filter((t) => hasUnknownNumber(t, sources)).length;
  const readyUnknownNumbers = ready.filter((p) => hasUnknownNumber(p.after, sources)).length;
  const languageOk = ready.every((p) => (c.locale === "ro" ? looksRomanian(p.after) : looksEnglish(p.after)));
  // A picked range may appear as the range, but no exact number may be left once the range is taken out.
  const rangeOk = !c.rangeOnly || ready.every((p) => !/\d/.test(p.after.replaceAll(c.rangeOnly!, " ").replace(/\d+\s*[–-]\s*\d+/g, " ")));
  const usedNumber = c.usesNumber ? ready.some((p) => new RegExp(`\\b${c.usesNumber}\\b`).test(p.after)) : null;
  const { cost, unpriced } = costOf(calls);
  const pass = !error && readyUnknownNumbers === 0 && languageOk && rangeOk;
  return { id: c.id, seconds: (Date.now() - started) / 1000, cost, unpriced, firstWordMs, ready, dropped, rawUnknownNumbers, readyUnknownNumbers, languageOk, rangeOk, usedNumber, error, pass };
}

// ---------- report ----------

function report(scores: ScoreRow[], rewrites: RewriteRow[]) {
  const out: string[] = [pad("score case", 26) + pad("bullets ok", 12) + pad("secs", 7) + pad("cost", 9) + "notes"];
  for (const r of scores) {
    const okCount = r.bullets.filter((b) => b.ok).length;
    out.push(pad(r.id, 26) + pad(r.error ? "-" : `${okCount}/${r.bullets.length}`, 12) + pad(r.seconds.toFixed(1), 7) + pad(usd(r.cost), 9) + (r.error ? `ERROR ${r.error}` : ""));
    for (const b of r.bullets.filter((x) => !x.ok)) {
      const detail = b.kind === "zero" ? `scored ${b.score}, expected 0 (${b.zeroKind})` : `got ${DIMENSIONS.map((d) => b.got[d]).join("/")}`;
      out.push(`    off: "${b.text.slice(0, 60)}" ${detail}`);
    }
    const paraphrase = r.bullets.find((b) => b.zeroKind === "paraphrasedDuplicate");
    if (paraphrase) out.push(`    paraphrased duplicate scored ${paraphrase.score}`);
  }
  out.push("", pad("rewrite case", 26) + pad("ready", 7) + pad("dropped", 9) + pad("1st word", 10) + pad("secs", 7) + pad("cost", 9) + pad("raw#", 6) + pad("lang", 6) + "result");
  for (const r of rewrites) {
    out.push(
      pad(r.id, 26) + pad(r.ready.length, 7) + pad(r.dropped.length, 9) + pad(r.firstWordMs === null ? "-" : `${r.firstWordMs} ms`, 10) + pad(r.seconds.toFixed(1), 7) + pad(usd(r.cost), 9) +
        pad(r.rawUnknownNumbers, 6) + pad(r.languageOk ? "ok" : "FAIL", 6) + (r.pass ? "PASS" : `FAIL${r.error ? ` (${r.error})` : ""}`),
    );
    for (const d of r.dropped) out.push(`    dropped ${d.replaces ?? "new"}: ${d.reason}`);
  }

  const bullets = scores.flatMap((r) => r.bullets);
  const graded = bullets.filter((b) => b.kind === "graded");
  const agree = graded.filter((b) => b.ok).length / Math.max(1, graded.length);
  const perDimension = DIMENSIONS.map((d, k) => `${d} ${graded.filter((b) => b.dims[k]).length}/${graded.length}`);
  const zeros = bullets.filter((b) => b.kind === "zero" && b.zeroKind !== "paraphrasedDuplicate");
  const paraphrases = bullets.filter((b) => b.zeroKind === "paraphrasedDuplicate");
  const all = [...scores, ...rewrites];
  const total = all.reduce((s, r) => s + r.cost, 0);
  const slowest = [...all].sort((a, b) => b.seconds - a.seconds)[0]!;
  const priciest = [...all].sort((a, b) => b.cost - a.cost)[0]!;
  const firstWords = rewrites.map((r) => r.firstWordMs).filter((x): x is number => x !== null);
  const optionsTotal = scores.reduce((s, r) => s + r.optionsTotal, 0);
  const optionsWithNumber = scores.reduce((s, r) => s + r.optionsWithNumber, 0);
  const rawUnknown = rewrites.reduce((s, r) => s + r.rawUnknownNumbers, 0);
  const readyUnknown = rewrites.reduce((s, r) => s + r.readyUnknownNumbers, 0);
  const unpriced = all.find((r) => r.unpriced)?.unpriced;
  const errors = scores.filter((r) => r.error).length + rewrites.filter((r) => r.error).length;

  const checks: [string, boolean][] = [
    [`every grade within one step on >= ${MIN_GRADE_AGREEMENT * 100}% of bullets (${graded.filter((b) => b.ok).length}/${graded.length} = ${(agree * 100).toFixed(1)}%)`, agree >= MIN_GRADE_AGREEMENT],
    [`placeholder and exact duplicate score 0 (${zeros.filter((b) => b.ok).length}/${zeros.length})`, zeros.every((b) => b.ok)],
    [`0 proposals with an unknown number after the check (${readyUnknown})`, readyUnknown === 0],
    ["rewrites stay in the case language", rewrites.every((r) => r.languageOk)],
    ["picked range never turned into an exact number", rewrites.every((r) => r.rangeOk)],
    ["no failed calls or broken streams", errors === 0],
  ];
  out.push(
    "",
    `per grade (within one step): ${perDimension.join(", ")}`,
    `paraphrased duplicates scored 0: ${paraphrases.filter((b) => b.score === 0).length}/${paraphrases.length} (reported, not in the bar)`,
    `options with an exact number before the filter: ${optionsWithNumber} of ${optionsTotal} (target 0, reported)`,
    `unknown numbers in rewrites: ${rawUnknown} before the check, ${readyUnknown} after`,
    `time to first word: average ${firstWords.length ? Math.round(firstWords.reduce((a, b) => a + b, 0) / firstWords.length) : "-"} ms, worst ${firstWords.length ? Math.max(...firstWords) : "-"} ms`,
    `slowest: ${slowest.id} ${slowest.seconds.toFixed(1)} s; most expensive: ${priciest.id} ${usd(priciest.cost)}; total cost ${usd(total)}`,
    unpriced ? `NOTE: no price for ${unpriced}, its cost counts as $0` : "",
  );
  for (const [name, pass] of checks) out.push(`${pass ? "PASS" : "FAIL"}  ${name}`);
  process.stdout.write(`\n${out.join("\n")}\n`);
  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ scores, rewrites }, null, 2));
  return checks.every(([, pass]) => pass);
}

it("scores the evaluation roles, streams the rewrites and meets the pass bar", async () => {
  const only = process.env.EVAL_CASE;
  const pick = <T extends { id: string }>(list: T[]) => list.filter((c) => !only || c.id.startsWith(only));
  const scores: ScoreRow[] = [];
  for (const c of pick(SCORE_CASES)) scores.push(await runScoreCase(c));
  const rewrites: RewriteRow[] = [];
  for (const c of pick(REWRITE_CASES)) rewrites.push(await runRewriteCase(c));
  expect(scores.length + rewrites.length).toBeGreaterThan(0);
  expect(report(scores, rewrites)).toBe(true);
});

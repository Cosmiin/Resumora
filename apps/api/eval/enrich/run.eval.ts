// Manual evaluation: scores synthetic roles with the real AI providers.
// Run from the repo root: npm run eval:enrich
// Only some cases: EVAL_CASE=ro npm run eval:enrich   (matches the start of the case id)
// The full run is saved to apps/api/node_modules/.cache/eval/enrich-last.json for a closer look.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ModelScoreSchema, buildRoleResult, fingerprint, isAllowedOption, type Grade, type Experience } from "@resumora/shared";
import { callModel, providersFromEnv, type AiCallLog, type ModelDeps } from "../../src/ai/call-model.ts";
import { scoreSystemPrompt, scoreUserMessage } from "../../src/enrich/prompts.ts";
import { SCORE_CASES, type ScoreCase } from "./cases.ts";

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

// ---------- report ----------

function report(scores: ScoreRow[]) {
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
  const bullets = scores.flatMap((r) => r.bullets);
  const graded = bullets.filter((b) => b.kind === "graded");
  const agree = graded.filter((b) => b.ok).length / Math.max(1, graded.length);
  const perDimension = DIMENSIONS.map((d, k) => `${d} ${graded.filter((b) => b.dims[k]).length}/${graded.length}`);
  const zeros = bullets.filter((b) => b.kind === "zero" && b.zeroKind !== "paraphrasedDuplicate");
  const paraphrases = bullets.filter((b) => b.zeroKind === "paraphrasedDuplicate");
  const total = scores.reduce((s, r) => s + r.cost, 0);
  const slowest = [...scores].sort((a, b) => b.seconds - a.seconds)[0]!;
  const priciest = [...scores].sort((a, b) => b.cost - a.cost)[0]!;
  const optionsTotal = scores.reduce((s, r) => s + r.optionsTotal, 0);
  const optionsWithNumber = scores.reduce((s, r) => s + r.optionsWithNumber, 0);
  const unpriced = scores.find((r) => r.unpriced)?.unpriced;
  const errors = scores.filter((r) => r.error).length;

  const checks: [string, boolean][] = [
    [`every grade within one step on >= ${MIN_GRADE_AGREEMENT * 100}% of bullets (${graded.filter((b) => b.ok).length}/${graded.length} = ${(agree * 100).toFixed(1)}%)`, agree >= MIN_GRADE_AGREEMENT],
    [`placeholder and exact duplicate score 0 (${zeros.filter((b) => b.ok).length}/${zeros.length})`, zeros.every((b) => b.ok)],
    ["no failed calls", errors === 0],
  ];
  out.push(
    "",
    `per grade (within one step): ${perDimension.join(", ")}`,
    `paraphrased duplicates scored 0: ${paraphrases.filter((b) => b.score === 0).length}/${paraphrases.length} (reported, not in the bar)`,
    `options with an exact number before the filter: ${optionsWithNumber} of ${optionsTotal} (target 0, reported)`,
    `slowest: ${slowest.id} ${slowest.seconds.toFixed(1)} s; most expensive: ${priciest.id} ${usd(priciest.cost)}; total cost ${usd(total)}`,
    unpriced ? `NOTE: no price for ${unpriced}, its cost counts as $0` : "",
  );
  for (const [name, pass] of checks) out.push(`${pass ? "PASS" : "FAIL"}  ${name}`);
  process.stdout.write(`\n${out.join("\n")}\n`);
  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ scores }, null, 2));
  return checks.every(([, pass]) => pass);
}

it("scores the evaluation roles and meets the pass bar", async () => {
  const only = process.env.EVAL_CASE;
  const pick = <T extends { id: string }>(list: T[]) => list.filter((c) => !only || c.id.startsWith(only));
  const scores: ScoreRow[] = [];
  for (const c of pick(SCORE_CASES)) scores.push(await runScoreCase(c));
  expect(scores.length).toBeGreaterThan(0);
  expect(report(scores)).toBe(true);
});

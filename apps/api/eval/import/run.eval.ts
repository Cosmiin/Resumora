// Manual evaluation: imports each of the 12 evaluation CVs with the real AI providers and scores
// the result against the answer key. Run from the repo root: npm run eval:import
// Only one case: EVAL_CASE=01 npm run eval:import   (matches the start of the folder name)
// Each result is saved to apps/api/node_modules/.cache/eval/results/<case>.json for a closer look.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { providersFromEnv, type AiCallLog } from "../../src/ai/call-model.ts";
import { extractText, sniffFormat } from "../../src/imports/extract-text.ts";
import { processImport } from "../../src/imports/process.ts";
import { scoreCase, type CaseScore, type Expected } from "./score.ts";

const CASES = join(import.meta.dirname, "cases");
const RESULTS = join(import.meta.dirname, "../../node_modules/.cache/eval/results");
/** USD per token, from openrouter.ai/api/v1/models on 2026-11-04 (gpt-5.4-mini: its `openai/gpt-5.4-mini` entry). */
const PRICES: Record<string, { input: number; output: number }> = {
  "openrouter:google/gemini-3.1-flash-lite": { input: 0.00000025, output: 0.0000015 },
  "openai:gpt-5.4-mini": { input: 0.00000075, output: 0.0000045 },
};
const MAX_SECONDS = 30;
const MAX_COST = 0.01;
const MIN_ACCURACY = 0.95;
/** The scan has no text layer: 10-scan relies on being the same CV as 04 (generate.ts renders case04 as a picture). */
const SCAN_SOURCE_CASE = "04-colour-sidebar";

type Row = { id: string; seconds: number; cost: number; score?: CaseScore; error?: string; pass: boolean };

const envPick = (k: string) => process.env[k] ?? "";
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const usd = (n: number) => `$${n.toFixed(4)}`;
const fileOf = (folder: string) => ["cv.pdf", "cv.docx"].find((f) => existsSync(join(CASES, folder, f)))!;
const bytesOf = (folder: string) => new Uint8Array(readFileSync(join(CASES, folder, fileOf(folder))));

async function sourceText(folder: string): Promise<string> {
  const bytes = bytesOf(folder === "10-scan" ? SCAN_SOURCE_CASE : folder);
  return (await extractText(bytes, sniffFormat(bytes)!)).text;
}

async function runCase(folder: string): Promise<Row> {
  const bytes = bytesOf(folder);
  const expected = JSON.parse(readFileSync(join(CASES, folder, "expected.json"), "utf8")) as Expected;
  const calls: AiCallLog[] = [];
  const model = {
    providers: providersFromEnv({
      OPENROUTER_API_KEY: envPick("OPENROUTER_API_KEY"),
      OPENROUTER_MODEL: envPick("OPENROUTER_MODEL"),
      OPENAI_API_KEY: envPick("OPENAI_API_KEY"),
      OPENAI_MODEL: envPick("OPENAI_MODEL"),
    }),
    fetch,
    logCall: async (entry: AiCallLog) => void calls.push(entry),
  };
  const started = Date.now();
  let result;
  let error: string | undefined;
  try {
    result = await processImport({ model }, { userId: "eval", bytes, format: sniffFormat(bytes)! });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const seconds = (Date.now() - started) / 1000;
  // Counts every call that reported tokens; a provider without a price here counts as $0.
  const unpriced = calls.find((c) => !PRICES[`${c.provider}:${c.model}`]);
  const cost = calls.reduce((sum, c) => {
    const price = PRICES[`${c.provider}:${c.model}`];
    return sum + (price ? (c.inputTokens ?? 0) * price.input + (c.outputTokens ?? 0) * price.output : 0);
  }, 0);
  if (unpriced) error = `no price for ${unpriced.provider}:${unpriced.model}`;
  if (!result) return { id: folder, seconds, cost, error, pass: false };
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(join(RESULTS, `${folder}.json`), JSON.stringify(result, null, 2));
  const score = scoreCase(expected, result, await sourceText(folder));
  const pass =
    score.sectionsOk && score.fieldAccuracy >= MIN_ACCURACY && score.invented.length === 0 &&
    score.diacriticsOk && score.flagsOk && seconds < MAX_SECONDS && cost < MAX_COST && !error;
  return { id: folder, seconds, cost, score, error, pass };
}

function printTable(rows: Row[]): void {
  const head = pad("case", 24) + pad("sections", 10) + pad("fields", 8) + pad("invented", 10) + pad("extra", 7) + pad("accents", 9) + pad("flags", 7) + pad("secs", 7) + pad("cost", 9) + "result";
  const out = [head];
  for (const r of rows) {
    const s = r.score;
    const mark = (ok: boolean | undefined) => (ok === undefined ? "-" : ok ? "ok" : "FAIL");
    out.push(
      pad(r.id, 24) + pad(mark(s?.sectionsOk), 10) + pad(s ? `${(s.fieldAccuracy * 100).toFixed(1)}%` : "-", 8) +
        pad(s ? s.invented.length : "-", 10) + pad(s ? s.extra.length : "-", 7) + pad(mark(s?.diacriticsOk), 9) + pad(mark(s?.flagsOk), 7) +
        pad(r.seconds.toFixed(1), 7) + pad(usd(r.cost), 9) + (r.pass ? "PASS" : r.error ? `FAIL (${r.error})` : "FAIL"),
    );
    const detail = (label: string, lines: string[] = []) => lines.forEach((l) => out.push(`    ${label}: ${l}`));
    detail("invented", s?.invented);
    detail("section", s?.sectionProblems);
    detail("accents", s?.brokenAccents);
    detail("extra item", s?.extra);
    detail("wrong skill group", s?.misplaced);
  }
  const scored = rows.filter((r) => r.score);
  const all = scored.length === rows.length;
  const checks: [string, boolean][] = [
    ["every section found and placed", all && scored.every((r) => r.score!.sectionsOk)],
    [`fields >= ${MIN_ACCURACY * 100}%`, all && scored.every((r) => r.score!.fieldAccuracy >= MIN_ACCURACY)],
    ["0 invented lines", all && scored.every((r) => r.score!.invented.length === 0)],
    ["word for word with accents", all && scored.every((r) => r.score!.diacriticsOk)],
    ["flags match", all && scored.every((r) => r.score!.flagsOk)],
    [`each import < ${MAX_SECONDS} s`, rows.every((r) => r.seconds < MAX_SECONDS)],
    [`each import < ${usd(MAX_COST)}`, rows.every((r) => r.cost < MAX_COST)],
  ];
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const slowest = Math.max(...rows.map((r) => r.seconds));
  out.push("", `total cost ${usd(total)}, slowest ${slowest.toFixed(1)} s, ${rows.filter((r) => r.pass).length}/${rows.length} cases pass`);
  for (const [name, pass] of checks) out.push(`${pass ? "PASS" : "FAIL"}  ${name}`);
  process.stdout.write(`\n${out.join("\n")}\n`);
}

it("imports the evaluation CVs and meets the pass bar", async () => {
  const only = process.env.EVAL_CASE;
  const folders = readdirSync(CASES).sort().filter((f) => !only || f.startsWith(only));
  expect(folders.length).toBeGreaterThan(0);
  const rows: Row[] = [];
  for (const folder of folders) rows.push(await runCase(folder));
  printTable(rows);
  expect(rows.every((r) => r.pass)).toBe(true);
});

// Runs the golden set with the real AI providers and writes the side-by-side report.
//   GOLDEN_LABEL=before npm run eval:golden    (the prompts as they were: run once, on the commit before the rework)
//   GOLDEN_LABEL=after  npm run eval:golden    (the reworked prompts: run after every prompt change)
// Each run is saved as eval/golden/run-<label>.json; REPORT.md is rebuilt from whichever of the two exist.
// One case only: GOLDEN_CASE=en-cv--ro-ad
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { providersFromEnv, type AiCallLog, type ModelDeps } from "../../src/ai/call-model.ts";
import { CASES } from "./cases.ts";
import { report, type SavedRun } from "./report.ts";
import { runCase, withHits } from "./run.ts";

const env = (key: string) => process.env[key] ?? "";
const providers = providersFromEnv({
  OPENROUTER_API_KEY: env("OPENROUTER_API_KEY"), OPENROUTER_MODEL: env("OPENROUTER_MODEL"), OPENROUTER_MODEL_STRONG: env("OPENROUTER_MODEL_STRONG"),
  OPENAI_API_KEY: env("OPENAI_API_KEY"), OPENAI_MODEL: env("OPENAI_MODEL"), OPENAI_MODEL_STRONG: env("OPENAI_MODEL_STRONG"),
});
const realModel = (calls: AiCallLog[]): ModelDeps => ({ providers, fetch, logCall: async (entry) => void calls.push(entry) });
const file = (label: string) => join(import.meta.dirname, `run-${label}.json`);
function load(label: string): SavedRun | null {
  if (!existsSync(file(label))) return null;
  const saved = JSON.parse(readFileSync(file(label), "utf8")) as SavedRun;
  // Judge the saved answers with today's checks, so both columns of the report are measured the same way.
  return { ...saved, cases: saved.cases.map((c) => { const golden = CASES.find((g) => g.id === c.id); return golden ? { ...c, roles: withHits(golden, c.roles) } : c; }) };
}

it("runs the golden set and writes the report", async () => {
  const label = env("GOLDEN_LABEL") || "after";
  expect(["before", "after"], "GOLDEN_LABEL must be before or after").toContain(label);
  expect(providers.length, "Configure a provider API key and model in apps/api/.dev.vars (or EVAL_DEV_VARS).").toBeGreaterThan(0);
  const only = env("GOLDEN_CASE");
  const cases = CASES.filter((c) => !only || c.id === only);
  const outputs = await Promise.all(cases.map((golden) => runCase(golden, realModel)));
  const commit = execSync("git rev-parse --short HEAD", { cwd: import.meta.dirname }).toString().trim();
  const run: SavedRun = { label, when: new Date().toISOString(), commit, cases: outputs };
  if (!only) writeFileSync(file(label), JSON.stringify(run, null, 2) + "\n");
  const markdown = report(CASES, label === "before" ? run : load("before"), label === "after" ? run : load("after"));
  if (!only) writeFileSync(join(import.meta.dirname, "REPORT.md"), markdown);
  const hits = outputs.reduce((sum, c) => sum + c.roles.reduce((n, r) => n + r.hits.length, 0), 0);
  process.stdout.write(`\n${label}: ${outputs.length} cases, ${outputs.reduce((n, c) => n + c.calls, 0)} AI calls, ${hits} bad patterns found, ${outputs.flatMap((c) => c.problems).length} problems\n`);
  for (const c of outputs) for (const problem of c.problems) process.stdout.write(`  ${c.id}: ${problem}\n`);
}, 40 * 60_000);

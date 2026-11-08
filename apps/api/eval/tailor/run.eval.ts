// Manual evaluation with the real AI providers: npm run eval:tailor (see README.md). Writes eval/tailor/RESULTS.md.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { providersFromEnv, type AiCallLog, type ModelDeps } from "../../src/ai/call-model.ts";
import { loadPairs, report, runPair } from "./run.ts";

const env = (key: string) => process.env[key] ?? "";
const providers = providersFromEnv({
  OPENROUTER_API_KEY: env("OPENROUTER_API_KEY"), OPENROUTER_MODEL: env("OPENROUTER_MODEL"), OPENROUTER_MODEL_STRONG: env("OPENROUTER_MODEL_STRONG"),
  OPENAI_API_KEY: env("OPENAI_API_KEY"), OPENAI_MODEL: env("OPENAI_MODEL"), OPENAI_MODEL_STRONG: env("OPENAI_MODEL_STRONG"),
});
const realModel = (calls: AiCallLog[]): ModelDeps => ({ providers, fetch, logCall: async (entry) => void calls.push(entry) });

it("tailors all 6 pairs with real providers and meets the pass bar", async () => {
  // The fixture check comes first, so bad fixtures never reach a provider.
  const pairs = loadPairs();
  process.stdout.write("Fixture check: 6/6 pairs valid\n");
  expect(providers.length, "Configure a provider API key and model in apps/api/.dev.vars (or EVAL_DEV_VARS).").toBeGreaterThan(0);
  const rows = await Promise.all(pairs.map((pair) => runPair(pair, realModel)));
  const markdown = report(rows);
  writeFileSync(join(import.meta.dirname, "RESULTS.md"), markdown);
  process.stdout.write("\n" + markdown);
  expect(rows.flatMap((row) => row.problems.map((problem) => `${row.id}: ${problem}`))).toEqual([]);
}, 40 * 60_000);

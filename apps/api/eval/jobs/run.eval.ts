// Manual evaluation with real providers: npm run eval:jobs
// EVAL_CASE=01 selects a folder prefix. EVAL_JOBS_DRY_RUN=1 validates fixtures only.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { providersFromEnv, type AiCallLog, type Provider } from "../../src/ai/call-model.ts";
import { processJob } from "../../src/jobs/process.ts";
import type { JobWork } from "../../src/jobs/repo.ts";

const CASES = join(import.meta.dirname, "cases");
const ExpectedSchema = z.strictObject({
  isJobPosting: z.boolean(),
  title: z.string().trim().min(1).optional(),
  company: z.string().trim().min(1).nullable().optional(),
  must: z.number().int().min(0).max(60).optional(),
  nice: z.number().int().min(0).max(60).optional(),
  salary: z.boolean().optional(),
});
type Case = { id: string; work: JobWork; expected: z.infer<typeof ExpectedSchema> };
type Row = { id: string; classificationOk: boolean; problems: string[]; calls: AiCallLog[] };
const envPick = (key: string) => process.env[key] ?? "";

function loadCases(): Case[] {
  const folders = readdirSync(CASES, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  expect(folders).toHaveLength(15);
  return folders.sort((a, b) => a.name.localeCompare(b.name)).map(({ name: id }) => {
    const folder = join(CASES, id);
    const expected = ExpectedSchema.parse(JSON.parse(readFileSync(join(folder, "expected.json"), "utf8")));
    const rawText = readFileSync(join(folder, "page.txt"), "utf8").trim();
    expect(rawText.length, id + " page text length").toBeGreaterThanOrEqual(200);
    expect(rawText.length, id + " page text length").toBeLessThanOrEqual(60_000);
    const jsonLdFile = join(folder, "jsonld.json");
    const jsonLd = existsSync(jsonLdFile)
      ? z.record(z.string(), z.unknown()).parse(JSON.parse(readFileSync(jsonLdFile, "utf8")))
      : null;
    return { id, expected, work: { id, userId: "eval", rawText, jsonLd } };
  });
}

async function runCase(c: Case, providers: Provider[]): Promise<Row> {
  const calls: AiCallLog[] = [];
  const result = await processJob({
    model: { providers, fetch, logCall: async (entry) => void calls.push(entry) },
  }, c.work);
  const isJobPosting = result.ok ? true : result.code === "not_a_job" ? false : undefined;
  const classificationOk = isJobPosting === c.expected.isJobPosting;
  const problems: string[] = [];
  if (!classificationOk) problems.push(result.ok ? "isJobPosting" : result.code);
  if (c.expected.isJobPosting && result.ok) {
    const actual = result.extracted;
    const expected = c.expected;
    if (expected.title !== undefined && actual.title.toLowerCase() !== expected.title.toLowerCase()) {
      problems.push("title");
    }
    if (expected.company !== undefined && actual.company?.toLowerCase() !== expected.company?.toLowerCase()) {
      problems.push("company");
    }
    for (const kind of ["must", "nice"] as const) {
      const count = actual.requirements.filter((item) => item.kind === kind).length;
      if (expected[kind] !== undefined && Math.abs(count - expected[kind]) > 1) problems.push(kind + " count");
    }
    if (expected.salary === false && actual.salary !== null) problems.push("invented salary");
  }
  return { id: c.id, classificationOk, problems, calls };
}

function report(rows: Row[]): void {
  const passed = rows.filter((row) => row.problems.length === 0).length;
  const calls = rows.flatMap((row) => row.calls);
  const input = calls.reduce((total, call) => total + (call.inputTokens ?? 0), 0);
  const output = calls.reduce((total, call) => total + (call.outputTokens ?? 0), 0);
  const lines = rows.map((row) => (row.problems.length ? "FAIL " : "PASS ") + row.id +
    (row.problems.length ? " (" + row.problems.join(", ") + ")" : ""));
  lines.push(
    "",
    passed + "/" + rows.length + " cases pass",
    "Average input tokens per case: " + (input / rows.length).toFixed(1),
    "Average output tokens per case: " + (output / rows.length).toFixed(1),
  );
  if (calls.some((call) => call.status === "ok" && (call.inputTokens === undefined || call.outputTokens === undefined))) {
    lines.push("Token averages are incomplete: a provider omitted usage.");
  }
  process.stdout.write("\n" + lines.join("\n") + "\n");
}

describe("job extraction evaluation", { concurrent: false }, () => {
  let cases: Case[] = [];

  it("loads all 15 cases and validates every expected.json before any model call", () => {
    const loaded = loadCases();
    expect(loaded.filter((c) => !c.expected.isJobPosting)).toHaveLength(2);
    cases = loaded;
    process.stdout.write("Dry case check: 15/15 cases valid\n");
  });

  it.skipIf(process.env.EVAL_JOBS_DRY_RUN === "1")("extracts jobs with real providers and meets the pass bar", async () => {
    // A failed dry check must prevent every provider call, including for a filtered run.
    expect(cases).toHaveLength(15);
    const providers = providersFromEnv({
      OPENROUTER_API_KEY: envPick("OPENROUTER_API_KEY"),
      OPENROUTER_MODEL: envPick("OPENROUTER_MODEL"),
      OPENAI_API_KEY: envPick("OPENAI_API_KEY"),
      OPENAI_MODEL: envPick("OPENAI_MODEL"),
    });
    expect(providers.length, "Configure a provider API key and model; the dry case check passed.").toBeGreaterThan(0);
    const selected = cases.filter((c) => !process.env.EVAL_CASE || c.id.startsWith(process.env.EVAL_CASE));
    expect(selected.length, "EVAL_CASE must match a case folder.").toBeGreaterThan(0);
    const rows: Row[] = [];
    for (const c of selected) rows.push(await runCase(c, providers));
    report(rows);
    expect(rows.every((row) => row.classificationOk), "Every isJobPosting must match.").toBe(true);
    expect(rows.filter((row) => row.problems.length === 0).length).toBeGreaterThanOrEqual(Math.ceil(rows.length * 13 / 15));
  });
});

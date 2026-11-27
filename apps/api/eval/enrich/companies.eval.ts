// Manual evaluation: which names the companies request takes for the person working for themselves, with the real AI.
// A self-employed or freelance role is asked nothing about its company (owner, 27 Nov 2026).
// Run from apps/api: npx vitest run --config vitest.eval.config.ts eval/enrich/companies
// The report is saved to node_modules/.cache/eval/companies-last.txt (the test runner may hide what a test prints).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { companyKey, emptyCv, type Experience } from "@resumora/shared";
import { providersFromEnv, type AiCallLog, type ModelDeps } from "../../src/ai/call-model.ts";
import { memoryCvRepo } from "../../src/cv/memory-repo.ts";
import { suggestCompanies } from "../../src/enrich/companies.ts";
import { memoryInsightsRepo } from "../../src/enrich/memory-repo.ts";

const OUT = join(import.meta.dirname, "../../node_modules/.cache/eval/companies-last.txt");
const envPick = (k: string) => process.env[k] ?? "";
/** Each name, and whether it is the person's own work (true) or a company (false). */
const NAMES: [string, boolean][] = [
  ["Self-Employed", true], ["Freelancing", true], ["Independent Shopify Projects", true], ["Own practice", true],
  ["Freelance web projects for local shops", true], ["Carbon Global", false], ["Elias Custom Metal Fabrication", false],
  ["Robert Half", false], ["Independent Media Group", false], ["Made By Society", false],
];
const role = (company: string, i: number): Experience => ({
  id: `r${i}`, company, title: "Consultant", location: "Remote", startDate: "2021-01", endDate: "2022-01", current: false,
  description: "", bullets: [{ id: `b${i}`, text: "Delivered projects for clients." }], notes: [],
});

it("the companies request knows the person's own work from a company", async () => {
  const calls: AiCallLog[] = [];
  const model: ModelDeps = {
    providers: providersFromEnv({
      OPENROUTER_API_KEY: envPick("OPENROUTER_API_KEY"), OPENROUTER_MODEL: envPick("OPENROUTER_MODEL"),
      OPENAI_API_KEY: envPick("OPENAI_API_KEY"), OPENAI_MODEL: envPick("OPENAI_MODEL"),
    }),
    fetch,
    logCall: async (entry: AiCallLog) => void calls.push(entry),
  };
  const cv = memoryCvRepo();
  await cv.save({ ...emptyCv("en"), experience: NAMES.map(([name], i) => role(name, i)) }, 0);
  const { companies } = await suggestCompanies({ cv, insights: memoryInsightsRepo("eval"), model, userId: "eval" });
  const report: string[] = [];
  let wrong = 0;
  for (const [name, own] of NAMES) {
    const got = companies.find((c) => c.key === companyKey(name));
    const said = got?.selfEmployed === true;
    if (said !== own) wrong++;
    report.push(`${said === own ? "ok   " : "WRONG"} ${name.padEnd(40)} ${said ? "own work, not asked" : got?.proposal ? `company: ${got.proposal}` : "company, asked"}`);
  }
  report.push(`wrong: ${wrong} of ${NAMES.length} · model calls: ${calls.length}`);
  console.log(report.join("\n"));
  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, report.join("\n"));
  expect(companies.length).toBe(NAMES.length);
});

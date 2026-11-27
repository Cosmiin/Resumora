// Manual evaluation: which lines the Shape step proposes to merge, with the real AI. Two fictional roles: one whose
// eight lines are all different work (modelled on a real run of 27 Nov 2026, where two pairs of unrelated lines were
// proposed as "the same work" and joined into one long sentence), and one with two pairs that do say the same thing.
// Run from apps/api: npx vitest run --config vitest.eval.config.ts eval/enrich/shape
// The report is saved to node_modules/.cache/eval/shape-last.txt (the test runner may hide what a test prints).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { emptyCv, fingerprint, type Experience } from "@resumora/shared";
import { providersFromEnv, type AiCallLog, type ModelDeps } from "../../src/ai/call-model.ts";
import { memoryCvRepo } from "../../src/cv/memory-repo.ts";
import { memoryInsightsRepo } from "../../src/enrich/memory-repo.ts";
import { scoreRole } from "../../src/enrich/score.ts";
import { proposeShape } from "../../src/enrich/shape.ts";

const OUT = join(import.meta.dirname, "../../node_modules/.cache/eval/shape-last.txt");
const envPick = (k: string) => process.env[k] ?? "";
const role = (id: string, title: string, company: string, lines: string[]): Experience => ({
  id, title, company, location: "", startDate: "2023-01", endDate: "", current: true, description: "", notes: [],
  bullets: lines.map((text, i) => ({ id: `${id}${i + 1}`, text })),
});

/** Eight lines, eight different pieces of work: nothing to merge. */
const DISTINCT = role("d", "System Integration Specialist", "Fictional Interim", [
  "Elicited and structured business requirements into development-ready user stories, conducted User Acceptance Testing (UAT), and served as the bridge between business stakeholders and technical implementation.",
  "Configured operational reporting dashboards using Airtable, Softr, and Make.com to provide data-driven decision support and identify operational bottlenecks.",
  "Safely managed sensitive employee and payroll data through role-based access, restricted API credentials, and synchronization rules.",
  "Led change management projects by piloting workflow improvements and retiring manual trackers to ensure consistent operating procedures.",
  "Built Make.com scenarios that sync candidate records between Airtable and the applicant tracking system.",
  "Wrote handover guides for 12 recruiters moving to the new intake forms.",
  "Resolved integration incidents reported by the payroll team within one business day.",
  "Negotiated the renewal of 3 software contracts with vendors.",
]);
/** Eight lines; lines 1+2 and 3+4 describe the same work twice. */
const OVERLAP = role("o", "Ecommerce Manager", "Fictional Society", [
  "Full ownership of the Shopify ecommerce channel, including detailed monthly reporting to the CEO and business owners, along with ongoing data-driven improvement recommendations.",
  "Tracked KPIs, including traffic, conversions, sales, AOV, and CLTV, and provided clear reports to the CEO and growth team.",
  "Full ownership and management of Shopify ecommerce projects, overseeing successful implementations and launches, optimization, scaling, and ongoing operational maintenance across Romania, Europe, and the United States.",
  "Managed projects efficiently and maintained ongoing collaboration with internal and external stakeholders, ensuring alignment with strategic objectives.",
  "Ran paid campaigns on Meta and TikTok with a monthly budget of 5,000 EUR.",
  "Set up email flows in Omnisend for abandoned carts and post-purchase reviews.",
  "Maintained regular communication with the customer support team, contributing to the resolution of customer issues.",
  "Coordinated product photo shoots with 2 freelance photographers.",
]);

it("Shape proposes only merges of lines that say the same thing", async () => {
  const calls: AiCallLog[] = [];
  const model: ModelDeps = {
    providers: providersFromEnv({
      OPENROUTER_API_KEY: envPick("OPENROUTER_API_KEY"), OPENROUTER_MODEL: envPick("OPENROUTER_MODEL"),
      OPENAI_API_KEY: envPick("OPENAI_API_KEY"), OPENAI_MODEL: envPick("OPENAI_MODEL"),
    }),
    fetch,
    logCall: async (entry: AiCallLog) => void calls.push(entry),
  };
  const report: string[] = [];
  const say = (line: string) => { report.push(line); console.log(line); };
  const kept: Record<string, number> = {};
  for (const r of [DISTINCT, OVERLAP]) {
    const cv = memoryCvRepo();
    await cv.save({ ...emptyCv("en"), experience: [r] }, 0);
    const deps = { cv, insights: memoryInsightsRepo("eval"), model, userId: "eval" };
    const input = { roleId: r.id, fingerprint: fingerprint(r, "en") };
    await scoreRole(deps, input);
    const { merges } = await proposeShape(deps, input);
    kept[r.id] = merges.length;
    say(`=== ${r.title}: ${merges.length} merge(s) proposed ===`);
    for (const m of merges) {
      const lines = m.ids.map((id) => r.bullets.find((b) => b.id === id)!.text);
      say(`  ${m.ids.join(" + ")} (${lines.map((t) => t.length).join(" + ")} characters -> ${m.text.length})`);
      say(`    ${m.text}`);
    }
  }
  say(`model calls: ${calls.length}`);
  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, report.join("\n"));
  expect(kept.d).toBe(0);
});

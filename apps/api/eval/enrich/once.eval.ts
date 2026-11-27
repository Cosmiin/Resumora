// Manual evaluation: "one answer lands once". Rewrites every line of one role from the same answers, with the real AI,
// and counts in how many lines each answer's fact ends up. Fictional role, modelled on a real run of 27 Nov 2026 where
// one answer ("UX and product") was written into all five lines.
// Run from apps/api: npx vitest run --config vitest.eval.config.ts eval/enrich/once
// EVAL_TAGGED=0 leaves out what each answer is about (how notes were saved before), to compare.
// EVAL_PLACE=0 leaves out the step that places what the lines did not take (a role's own run had none before).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { emptyCv, fingerprint, type Experience, type Note } from "@resumora/shared";
import { providersFromEnv, type AiCallLog, type ModelDeps } from "../../src/ai/call-model.ts";
import { memoryCvRepo } from "../../src/cv/memory-repo.ts";
import { improveBullet } from "../../src/enrich/improve.ts";
import { memoryInsightsRepo } from "../../src/enrich/memory-repo.ts";
import { placeAnswers } from "../../src/enrich/use-answers.ts";

const TAGGED = process.env.EVAL_TAGGED !== "0";
const PLACE = process.env.EVAL_PLACE !== "0";
/** The report is also saved here (the test runner may hide what a test prints). */
const OUT = join(import.meta.dirname, `../../node_modules/.cache/eval/once-${TAGGED ? "tagged" : "untagged"}.txt`);
const envPick = (k: string) => process.env[k] ?? "";
const ASKED_AT = "2026-11-27T10:00:00.000Z";
const about = (tag: object) => (TAGGED ? tag : {});
const note = (id: string, question: string, answer: string, tag: object): Note =>
  ({ id, question, answer, via: ["pick"], askedAt: ASKED_AT, ...about(tag) }) as Note;

const ROLE: Experience = {
  id: "role", company: "Northfield Research", title: "Qualitative Market Researcher", location: "",
  startDate: "2020-01", endDate: "2021-12", current: false, description: "",
  bullets: [
    { id: "b1", text: "Conducted in-depth analyses of B2C consumer behavior and purchasing decision-making processes." },
    { id: "b2", text: "Collected and interpreted qualitative and quantitative data through interviews, focus groups, and observation, generating strategic insights." },
    { id: "b3", text: "Identified actionable insights to optimize brand messaging, product offerings, and conversion funnels." },
    { id: "b4", text: "Contributed to the development of data-driven strategies and customer journey mapping." },
    { id: "b5", text: "Presented findings and recommendations in structured reports for decision-makers." },
  ],
  notes: [
    note("n1", "What was this role for?", "UX and product insights, Brand and messaging research", { topic: "purpose" }),
    note("n2", "Which tools did you use?", "Google Sheets", { topic: "tools" }),
    note("n3", "What did you analyze this for, and for whom?", "For UX or product decisions", { bulletId: "b1" }),
    note("n4", "How many projects or clients did you typically handle for these B2C analyses?", "6–10 projects", { bulletId: "b1" }),
    note("n5", "How often or for how many projects did you do this?", "For one-off studies", { bulletId: "b2" }),
    note("n6", "How many projects or clients did you typically handle for these studies?", "10–20 projects", { bulletId: "b2" }),
  ],
};

/** A fact from an answer, and the one line it belongs to (null: no single line; it should not be spread). */
const FACTS: { name: string; pattern: RegExp; home: string | null }[] = [
  { name: "6–10 projects", pattern: /6\s*[-–—]\s*10/, home: "b1" },
  { name: "10–20 projects", pattern: /10\s*[-–—]\s*20/, home: "b2" },
  { name: "UX / product decisions", pattern: /\bUX\b/i, home: "b1" },
  { name: "Google Sheets", pattern: /google sheets/i, home: null },
  { name: "one-off studies", pattern: /one-off/i, home: "b2" },
];

it("one answer lands once", async () => {
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
  await cv.save({ ...emptyCv("en"), experience: [ROLE] }, 0);
  const deps = { cv, insights: memoryInsightsRepo("eval"), model, userId: "eval" };
  const input = { roleId: ROLE.id, fingerprint: fingerprint(ROLE, "en") };

  // Each line is rewritten on its own from the saved role, as a role's run and the path do.
  const out: { id: string; text: string | null; next: string | null }[] = [];
  for (const b of ROLE.bullets) {
    const answer = await improveBullet(deps, { ...input, bulletId: b.id });
    out.push({
      id: b.id, text: "proposal" in answer ? answer.proposal.text : null,
      next: "needsDetail" in answer ? (answer.nextQuestion?.text ?? null) : null,
    });
  }

  // Then what the answers say that no line took is placed once, by the step that sees the whole role.
  let description = "";
  const added: string[] = [];
  if (PLACE) {
    const changes = out.flatMap((o) => (o.text ? [{ id: `c-${o.id}`, kind: "bullet" as const, bulletId: o.id, text: o.text }] : []));
    const placed = await placeAnswers(deps, { ...input, changes, questions: ROLE.notes.map((n) => n.question) });
    for (const c of placed.changes) {
      if (c.kind === "description") description = c.text;
      else if (c.kind === "new") added.push(c.text);
      else if (c.kind === "bullet") out.find((o) => o.id === c.bulletId)!.text = c.text;
    }
  }

  const report: string[] = [];
  const say = (line: string) => { report.push(line); console.log(line); };
  say(`=== one answer lands once (${TAGGED ? "answers say what they are about" : "answers untagged"}, ${PLACE ? "with" : "without"} the placing step) ===`);
  if (description) say(`description: ${description}`);
  for (const o of out) say(`${o.id}: ${o.text ?? "(kept as it is)"}${o.next ? `\n    follow-up: ${o.next}` : ""}`);
  for (const text of added) say(`new line: ${text}`);
  let strayed = 0;
  for (const f of FACTS) {
    const lines = [...out, ...added.map((text, i) => ({ id: `new${i + 1}`, text }))].filter((o) => o.text && f.pattern.test(o.text)).map((o) => o.id);
    const stray = lines.filter((id) => id !== f.home);
    const spread = f.home === null ? Math.max(0, lines.length - 1) : stray.length;
    strayed += spread;
    say(`${f.name.padEnd(26)} in ${lines.length} line(s): ${lines.join(", ") || "-"}${spread ? `   <- ${spread} too many` : ""}`);
  }
  say(`facts written where they do not belong: ${strayed} · model calls: ${calls.length}`);
  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, report.join("\n"));
  expect(out.length).toBe(ROLE.bullets.length);
});

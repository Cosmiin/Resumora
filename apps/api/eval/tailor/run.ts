// The tailoring eval: Score 1 (3×, for stability), the full tailoring run through the API routes
// (every section, accepted as the web does with no answers and no confirmed flags), Score 2, then the CV as a PDF.
// Real providers: npm run eval:tailor (writes RESULTS.md). The fake model runs in `npm test` (test/tailor-eval.test.ts).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { z } from "zod";
import {
  CvContentSchema, hasUnknownNumber, JobExtractionSchema, TAILOR_SECTIONS, type CvContent, type JobExtraction, type MatchScore,
} from "@resumora/shared";
import type { AiCallLog, ModelDeps, Provider } from "../../src/ai/call-model.ts";
import { createApp, type AppDeps } from "../../src/app.ts";
import { memoryCvRepo } from "../../src/cv/memory-repo.ts";
import { memoryJobs } from "../../src/jobs/memory-repo.ts";
import { memoryTailorDocs, memoryTailorRepo } from "../../src/tailor/memory-repo.ts";
import { scoreMatch } from "../../src/tailor/score.ts";

export const FIXTURES = join(import.meta.dirname, "fixtures.json");
/** USD per token, from openrouter.ai/api/v1/models on 2026-11-04 (same table as the enrich eval). */
const PRICES: Record<string, { input: number; output: number }> = {
  "openrouter:google/gemini-3.1-flash-lite": { input: 0.00000025, output: 0.0000015 },
  "openai:gpt-5.4-mini": { input: 0.00000075, output: 0.0000045 },
};
export const LIMITS = { invented: 0, costUsd: 0.05, pages: 2, spread: 3 };

const PairSchema = z.object({
  id: z.string(), description: z.string(), locale: z.string(), cv: CvContentSchema, job: JobExtractionSchema,
});
export type Pair = z.infer<typeof PairSchema>;

export type Row = {
  id: string;
  score1: (number | null)[];
  spread: number | null;
  score2: number | null;
  keywordsBefore: number | null;
  keywordsAfter: number | null;
  invented: string[];
  costUsd: number;
  unpriced: string[];
  pages: number | null;
  problems: string[];
};

/** All 6 pairs, each CV checked against the CV schema and each job against the job schema, before any model call. */
export function loadPairs(file = FIXTURES): Pair[] {
  return z.array(PairSchema).length(6).parse(JSON.parse(readFileSync(file, "utf8")));
}

/** Every written text of a CV (no ids, layout, photo or metadata). */
function cvTexts(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(cvTexts);
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !["id", "layout", "schemaVersion", "locale", "photo", "enrichedAt"].includes(key) && !key.endsWith("Id"))
      .flatMap(([, entry]) => cvTexts(entry));
  }
  return [];
}

/** Invented facts: a number in the tailored CV that neither the Base CV nor the job has, or an employer the Base CV doesn't have. */
export function inventedFacts(base: CvContent, job: JobExtraction, tailored: CvContent): string[] {
  const sources = [...cvTexts(base), ...cvTexts(job)];
  const numbers = cvTexts(tailored).filter((text) => hasUnknownNumber(text, sources)).map((text) => `number: ${text}`);
  const employers = new Set(base.experience.map((role) => role.company.trim().toLowerCase()));
  const newEmployers = tailored.experience.filter((role) => role.company.trim() && !employers.has(role.company.trim().toLowerCase()))
    .map((role) => `employer: ${role.company}`);
  return [...numbers, ...newEmployers];
}

/** Share of keyword labels found in the CV (met or partial), in percent. */
function keywordCoverage(score: MatchScore | null): number | null {
  const keywords = score?.labels.filter((label) => label.kind === "keyword") ?? [];
  if (keywords.length === 0) return null;
  return Math.round(100 * keywords.filter((label) => label.status !== "missing").length / keywords.length);
}

function costOf(calls: AiCallLog[]): { cost: number; unpriced: string[] } {
  const unpriced = new Set<string>();
  const cost = calls.reduce((sum, call) => {
    const price = PRICES[`${call.provider}:${call.model}`];
    if (!price) { unpriced.add(`${call.provider}:${call.model}`); return sum; }
    return sum + (call.inputTokens ?? 0) * price.input + (call.outputTokens ?? 0) * price.output;
  }, 0);
  return { cost, unpriced: [...unpriced] };
}

type PdfBuilder = (content: CvContent, template: string) => Promise<Blob>;
let pdfBuilder: Promise<PdfBuilder> | null = null;

/**
 * The web app's own PDF builder. Its fonts are Vite asset URLs (for browsers), so registration is pointed at the
 * local font files, as in the web PDF tests. The path is not a literal so the API typecheck doesn't pull in web code.
 */
function webPdfBuilder(): Promise<PdfBuilder> {
  pdfBuilder ??= (async () => {
    const { Font } = await import("@react-pdf/renderer");
    const require = createRequire(import.meta.url);
    const local = (url: string) => {
      const file = url.split("?")[0]!.split("/").at(-1)!;
      return require.resolve(`@fontsource/${file.split("-latin")[0]}/files/${file}`);
    };
    const register = Font.register.bind(Font);
    Font.register = ((data: Parameters<typeof Font.register>[0]) => register("fonts" in data
      ? { ...data, fonts: data.fonts.map((font) => ({ ...font, src: local(font.src) })) }
      : { ...data, src: local(data.src) })) as typeof Font.register;
    const path = join(import.meta.dirname, "../../../web/src/export/pdf.tsx");
    const web = await import(/* @vite-ignore */ path) as { buildCvPdf: PdfBuilder };
    return web.buildCvPdf;
  })();
  return pdfBuilder;
}

export async function pageCount(content: CvContent): Promise<number> {
  const { getDocumentProxy } = await import("unpdf");
  const blob = await (await webPdfBuilder())(content, "classic");
  return (await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()))).numPages;
}

/** One pair: Score 1 three times, then a whole tailoring run as the web runs it, then Score 2 and the PDF's pages. */
export async function runPair(pair: Pair, model: (calls: AiCallLog[]) => ModelDeps): Promise<Row> {
  const row: Row = {
    id: pair.id, score1: [], spread: null, score2: null, keywordsBefore: null, keywordsAfter: null,
    invented: [], costUsd: 0, unpriced: [], pages: null, problems: [],
  };
  const runCalls: AiCallLog[] = [];
  const stabilityCalls: AiCallLog[] = [];
  const userId = "eval-user";
  let first: MatchScore | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      const score = await scoreMatch({ model: model(i === 0 ? runCalls : stabilityCalls) }, { userId, cv: pair.cv, job: pair.job, keptInferred: new Set() });
      first ??= score;
      row.score1.push(score.total);
    } catch (cause) {
      row.score1.push(null);
      row.problems.push(`score 1 failed: ${(cause as Error).message}`);
    }
  }
  const totals = row.score1.filter((total): total is number => total !== null);
  row.spread = totals.length === 3 ? Math.max(...totals) - Math.min(...totals) : null;
  row.keywordsBefore = keywordCoverage(first);

  const cv = memoryCvRepo();
  await cv.save(pair.cv, 0);
  const jobs = memoryJobs({ now: () => new Date() });
  const docs = memoryTailorDocs();
  const scores = new Map();
  const deps: AppDeps = {
    appOrigin: "http://127.0.0.1:5173",
    verifyToken: async (token) => (token === "eval" ? { id: userId, token } : null),
    cvRepo: () => cv,
    importRepo: () => { throw new Error("not used"); },
    jobRepo: (user) => jobs.repoFor(user.id),
    tailorRepo: (user) => memoryTailorRepo(user.id, scores, docs),
    insightsRepo: () => { throw new Error("not used"); },
    model: () => model(runCalls),
    queue: { send: async () => {} },
    jobQueue: { send: async () => {} },
    log: () => {},
  };
  const app = createApp(deps);
  const post = async (path: string, body: unknown = {}) => {
    const res = await app.request(path, {
      method: "POST", headers: { authorization: "Bearer eval", "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  };

  try {
    const jobId = crypto.randomUUID();
    await jobs.repoFor(userId).create({ id: jobId, source: "link", url: "https://example.test/job", urlNormalized: jobId, rawText: "eval", jsonLd: null });
    await jobs.admin.finish(jobId, pair.job);
    const start = await post(`/v1/jobs/${jobId}/tailor`, { tone: "neutral" }) as { run: { id: string } };
    let score2: MatchScore | null = null;
    for (const section of TAILOR_SECTIONS) {
      await post(`/v1/tailor-runs/${start.run.id}/sections/${section}/run`);
      // No decisions: proposals are kept, flagged ones fall back to the Base wording, inferred ones stay unreviewed.
      score2 = (await post(`/v1/tailor-runs/${start.run.id}/sections/${section}/accept`)).score as MatchScore;
    }
    const tailored = [...docs.cvs.values()][0]!.content;
    row.score2 = score2?.total ?? null;
    row.keywordsAfter = keywordCoverage(score2);
    row.invented = inventedFacts(pair.cv, pair.job, tailored);
    row.pages = await pageCount(tailored);
  } catch (cause) {
    row.problems.push(`tailoring failed: ${(cause as Error).message.slice(0, 300)}`);
  }

  const cost = costOf(runCalls);
  row.costUsd = cost.cost;
  row.unpriced = cost.unpriced;
  if (row.invented.length > LIMITS.invented) row.problems.push(`${row.invented.length} invented facts`);
  if (row.spread !== null && row.spread > LIMITS.spread) row.problems.push(`Score 1 spread ${row.spread} > ${LIMITS.spread}`);
  if (row.costUsd >= LIMITS.costUsd) row.problems.push(`cost $${row.costUsd.toFixed(4)} ≥ $${LIMITS.costUsd}`);
  if (row.unpriced.length) row.problems.push(`no price for ${row.unpriced.join(", ")} (add it to PRICES)`);
  if (row.pages !== null && row.pages > LIMITS.pages) row.problems.push(`${row.pages} pages > ${LIMITS.pages}`);
  return row;
}

const show = (value: number | null, suffix = "") => value === null ? "—" : `${value}${suffix}`;

/** The results as Markdown: one row per pair, then the totals against the pass bar. */
export function report(rows: Row[], when = new Date()): string {
  const lifts = rows.flatMap((row) => row.score1[0] != null && row.score2 !== null ? [row.score2 - row.score1[0]] : []);
  const costs = rows.map((row) => row.costUsd);
  const lines = [
    "# Tailoring eval results",
    "",
    `Run: ${when.toISOString()} · pairs: ${rows.length} · pass bar: 0 invented facts, Score 1 spread ≤ ${LIMITS.spread}, cost < $${LIMITS.costUsd} per run (no letter), ≤ ${LIMITS.pages} pages.`,
    "",
    "| Pair | Score 1 (3 runs) | Spread | Score 2 | Lift | Keywords before → after | Invented facts | Cost per run | Pages | Result |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((row) => {
      const lift = row.score1[0] != null && row.score2 !== null ? row.score2 - row.score1[0] : null;
      return `| ${row.id} | ${row.score1.map((total) => show(total)).join(" / ")} | ${show(row.spread)} | ${show(row.score2)} | ${lift === null ? "—" : (lift >= 0 ? "+" : "") + lift} | ${show(row.keywordsBefore, "%")} → ${show(row.keywordsAfter, "%")} | ${row.invented.length} | $${row.costUsd.toFixed(4)} | ${show(row.pages)} | ${row.problems.length ? "FAIL: " + row.problems.join("; ").replace(/\|/g, "/") : "pass"} |`;
    }),
    "",
    `Invented facts in total: ${rows.reduce((sum, row) => sum + row.invented.length, 0)}`,
    `Average Score 1 → 2 lift: ${lifts.length ? (lifts.reduce((a, b) => a + b, 0) / lifts.length).toFixed(1) : "—"}`,
    `Cost per run: average $${(costs.reduce((a, b) => a + b, 0) / Math.max(1, costs.length)).toFixed(4)}, highest $${Math.max(0, ...costs).toFixed(4)}`,
    `Pages: at most ${Math.max(0, ...rows.map((row) => row.pages ?? 0))}`,
    `Result: ${rows.filter((row) => row.problems.length === 0).length}/${rows.length} pairs pass`,
  ];
  const invented = rows.flatMap((row) => row.invented.map((fact) => `- ${row.id}: ${fact}`));
  if (invented.length) lines.push("", "## Invented facts", "", ...invented);
  return lines.join("\n") + "\n";
}

/**
 * A fake model that answers each tailoring call the way the real one must: every requirement labelled with
 * evidence quoted from the CV, one job keyword, the layout unchanged. Its only proposals condense the bullets of
 * roles older than the newest two to their first words (as the experience prompt asks), so a long CV can fit 2 pages.
 */
const firstWords = (text: string, count: number) => text.split(/\s+/).filter(Boolean).slice(0, count).join(" ");

export function fakeTailorModel(calls: AiCallLog[]): ModelDeps {
  const provider: Provider = { name: "openai", url: "https://fake.test", apiKey: "fake", model: "gpt-5.4-mini" };
  const reply = (body: { messages: { role: string; content: unknown }[]; response_format: { json_schema: { name: string } } }) => {
    const task = body.response_format.json_schema.name;
    const user = String(body.messages[1]?.content);
    const system = String(body.messages[0]?.content);
    if (task === "tailor_score") {
      const input = JSON.parse(user) as { cv: CvContent; requirements: { ref: string; text: string }[]; responsibilities: string[] };
      const evidence = cvTexts(input.cv)[0]?.slice(0, 20) ?? null;
      const term = (input.requirements[0]?.text ?? input.responsibilities[0] ?? "").split(/\s+/)[0] ?? "";
      return {
        labels: [
          ...input.requirements.map((r, i) => ({ ref: r.ref, kind: "requirement", status: i % 2 === 0 && evidence ? "met" : "missing", evidence: i % 2 === 0 ? evidence : null, inferred: false })),
          ...(term ? [{ ref: `k:${term}`, kind: "keyword", status: evidence ? "met" : "missing", evidence, inferred: false }] : []),
        ],
        cvSeniority: "mid",
      };
    }
    if (task === "tailor_verify") return { results: [] };
    if (system.startsWith("You finish tailoring")) {
      const input = JSON.parse(user) as { order: string[]; headline: string };
      return { order: input.order, headline: input.headline };
    }
    const input = JSON.parse(user) as { section: string; items: CvContent["experience"] };
    if (input.section !== "experience") return { proposals: [] };
    return {
      proposals: input.items.slice(2).flatMap((role) => [
        { itemId: role.id, field: "description", text: firstWords(role.description, 6), inferred: false },
        ...role.bullets.map((bullet) => ({ itemId: bullet.id, field: "text", text: firstWords(bullet.text, 6), inferred: false })),
      ].filter((proposal) => proposal.text)),
    };
  };
  return {
    providers: [provider],
    fetch: (async (_url: string, init: RequestInit) => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply(JSON.parse(String(init.body)))) } }],
      usage: { prompt_tokens: 1000, completion_tokens: 200 },
    }), { status: 200 })) as typeof fetch,
    logCall: async (entry) => void calls.push(entry),
  };
}

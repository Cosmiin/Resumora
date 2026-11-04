// Offline evaluation helper. It never dispatches inference or reads credentials.
// node --experimental-strip-types scripts/evaluate-experience.mjs --requests --locale ro
// node --experimental-strip-types scripts/evaluate-experience.mjs --responses /tmp/results.json
import fs from "node:fs/promises";
import { experienceAssessmentPrompt } from "../packages/contracts/src/intelligence/experience-assessment-prompt.ts";
import {
  assessmentSchema,
  parseAssessment,
} from "../apps/api/src/intelligence/experience-assessment.ts";
import { experiencePolicy } from "../packages/contracts/src/intelligence/experience-policy.ts";

const fixtures = JSON.parse(
  await fs.readFile(
    new URL(
      "../apps/api/fixtures/experience-calibration.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const args = process.argv.slice(2),
  value = (flag) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
if (args.includes("--requests")) {
  const locale = value("--locale") ?? "en";
  if (!["en", "ro"].includes(locale)) throw Error("Use --locale en or ro");
  for (const c of fixtures.cases) {
    const points = c.points.map((text, index) => ({ id: `p${index}`, text }));
    process.stdout.write(
      JSON.stringify({
        caseId: c.id,
        policyVersion: experiencePolicy.version,
        system: experienceAssessmentPrompt,
        input: {
          locale,
          documentLocale: c.documentLocale,
          role: c.role,
          scope: "complete",
          points,
        },
        schema: assessmentSchema(points.map((p) => p.id)),
      }) + "\n",
    );
  }
} else if (args.includes("--responses")) {
  // Rows: {caseId, locale, output: <raw model JSON>, model?, latencyMs?, reportedCostUsd?}.
  const rows = JSON.parse(await fs.readFile(value("--responses"), "utf8"));
  if (!Array.isArray(rows) || !rows.length)
    throw Error("Expected a non-empty array of evaluation responses");
  let checked = 0,
    correct = 0,
    valid = 0,
    issues = 0,
    points = 0,
    unnecessaryQuestions = 0;
  const failures = [],
    latencies = [],
    costs = [],
    scores = new Map();
  for (const row of rows) {
    const c = fixtures.cases.find((c) => c.id === row.caseId);
    if (!c || !["en", "ro"].includes(row.locale))
      throw Error("Unknown reference case or feedback locale");
    try {
      const parsed = parseAssessment(
        row.output,
        c.points.map((text, index) => ({
          id: `p${index}`,
          point: {
            start: index * 10000,
            end: index * 10000 + text.length,
            text,
          },
        })),
        row.locale,
        "complete",
      );
      valid++;
      const score =
        parsed.points.reduce((n, p) => n + p.score, 0) / parsed.points.length;
      const key = `${row.model ?? "unspecified"}:${row.caseId}:${row.locale}`;
      scores.set(key, [...(scores.get(key) ?? []), score]);
      for (const [index, p] of parsed.points.entries()) {
        const expected = c.expected[index];
        points++;
        if (p.issue === expected.issue) issues++;
        for (const dimension of ["contribution", "clarity", "specificity"]) {
          checked++;
          if (p[dimension] === expected[dimension]) correct++;
          else
            failures.push({
              caseId: c.id,
              dimension,
              expected: expected[dimension],
              actual: p[dimension],
            });
        }
        if (
          expected.issue === "none" &&
          row.output.points.find((p) => p.id === `p${index}`)
            ?.suggestedQuestion !== null
        )
          unnecessaryQuestions++;
      }
    } catch (e) {
      failures.push({ caseId: c.id, error: e.message });
    }
    if (Number.isFinite(row.latencyMs) && row.latencyMs >= 0)
      latencies.push(row.latencyMs);
    if (Number.isFinite(row.reportedCostUsd) && row.reportedCostUsd >= 0)
      costs.push(row.reportedCostUsd);
  }
  latencies.sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        policyVersion: experiencePolicy.version,
        referenceStatus: fixtures.status,
        responses: rows.length,
        validResponses: valid,
        gradeAgreement: checked ? correct / checked : null,
        issueAgreement: points ? issues / points : null,
        unnecessaryQuestions,
        latencyMs: latencies.length
          ? {
              mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
              p95: latencies[Math.ceil(latencies.length * 0.95) - 1],
            }
          : null,
        reportedCostUsd:
          costs.length === rows.length
            ? costs.reduce((a, b) => a + b, 0)
            : null,
        repeatedScoreRanges: [...scores]
          .filter(([, s]) => s.length > 1)
          .map(([key, s]) => ({
            key,
            runs: s.length,
            range: Math.max(...s) - Math.min(...s),
          })),
        failures,
        humanReviewRequired: [
          "feedback language",
          "unsupported assertions",
          "diagnostic usefulness",
          "whole-experience observations",
        ],
      },
      null,
      2,
    ),
  );
} else
  throw Error(
    "Use --requests [--locale en|ro], or --responses /absolute/path/results.json",
  );

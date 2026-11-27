import { describe, expect, it } from "vitest";
import type { JobExtraction, MatchLabel, MatchScore } from "@resumora/shared";
import { openGaps } from "./gaps.ts";

const job = {
  requirements: [
    { text: "Payroll accuracy", kind: "must", category: "skill" },
    { text: "Team leadership", kind: "must", category: "experience" },
    { text: "Workflow design", kind: "nice", category: "skill" },
  ],
} as JobExtraction;
const label = (ref: string, status: MatchLabel["status"], inferred = false): MatchLabel =>
  ({ ref, kind: ref.startsWith("k:") ? "keyword" : "requirement", status, evidence: null, inferred });
const score = (labels: MatchLabel[], requirementTexts = job.requirements.map((r) => r.text)): MatchScore =>
  ({ policy: "match/1", total: 70, band: "strong", parts: { requirements: null, keywords: null, seniority: null, langEdu: null }, capped: false, requirementTexts, labels });

describe("openGaps", () => {
  it("keeps what the Base CV misses, shows only partly, or only hints at; leaves out what it covers", () => {
    const base = score([label("r0", "met"), label("r1", "partial"), label("r2", "met", true), label("k:Kissflow", "missing"), label("k:Excel", "met")]);
    expect(openGaps(base, null, job)).toEqual([
      { ref: "r1", kind: "requirement", text: "Team leadership", status: "partial" },
      { ref: "r2", kind: "requirement", text: "Workflow design", status: "met" },
      { ref: "k:Kissflow", kind: "keyword", text: "Kissflow", status: "missing" },
    ]);
  });

  it("drops a gap the tailored CV already covers, a keyword whatever its case", () => {
    const base = score([label("r1", "missing"), label("k:Queue health", "missing"), label("k:Kissflow", "missing")]);
    const tailored = score([label("r1", "met"), label("k:queue health", "met"), label("k:Kissflow", "met", true)]);
    expect(openGaps(base, tailored, job).map((gap) => gap.ref)).toEqual(["k:Kissflow"]);
  });

  it("does not close a requirement from a tailored score made for other requirements", () => {
    const base = score([label("r1", "missing"), label("k:Kissflow", "missing")]);
    const tailored = score([label("r1", "met"), label("k:Kissflow", "met")], ["Something else"]);
    expect(openGaps(base, tailored, job).map((gap) => gap.ref)).toEqual(["r1"]);
  });

  it("leaves out a requirement label the job no longer has", () => {
    expect(openGaps(score([label("r9", "missing")]), null, job)).toEqual([]);
  });
});

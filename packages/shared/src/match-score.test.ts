import { describe, expect, it } from "vitest";
import { bandOf, computeMatchScore, MatchScoreSchema, type JobExtraction, type MatchLabel } from "./index.ts";

const job: JobExtraction = {
  title: "Developer", company: null, location: null, workMode: "unknown",
  employmentType: "unknown", seniority: "senior", salary: null, summary: "",
  responsibilities: [], benefits: [], applyBy: null, isJobPosting: true,
  requirements: [
    { text: "TypeScript", kind: "must", category: "skill" },
    { text: "React", kind: "nice", category: "skill" },
    { text: "English", kind: "must", category: "language" },
    { text: "Degree", kind: "nice", category: "education" },
  ],
};
const labels: MatchLabel[] = [
  ...job.requirements.map((requirement, index): MatchLabel => ({
    ref: `r${index}`, kind: "requirement", status: "met", evidence: requirement.text, inferred: false,
  })),
  { ref: "TypeScript", kind: "keyword", status: "met", evidence: "TypeScript", inferred: false },
];
const input = { job, labels, cvSeniority: "senior" as const, keptInferred: new Set<string>() };

describe("computeMatchScore", () => {
  it("scores all met inputs at 100 with the policy weights", () => {
    const score = computeMatchScore(input);
    expect(score).toEqual({
      policy: "match/1", total: 100, band: "excellent", capped: false, labels,
      parts: {
        requirements: { points: 1, max: 50 }, keywords: { points: 1, max: 30 },
        seniority: { points: 1, max: 10 }, langEdu: { points: 1, max: 10 },
      },
    });
    expect(MatchScoreSchema.parse(score)).toEqual(score);
  });

  it("caps at 69 when one must is missing and everything else is met", () => {
    const score = computeMatchScore({
      ...input, labels: labels.map((label) => label.ref === "r0" ? { ...label, status: "missing" } : label),
    });
    expect(score).toMatchObject({ total: 69, band: "fair", capped: true });
  });

  it("weighs must requirements twice as much as nice requirements", () => {
    const score = computeMatchScore({
      ...input, job: { ...job, requirements: job.requirements.slice(0, 2), seniority: "unknown" },
      labels: [labels[0]!, { ...labels[1]!, status: "missing" }],
    });
    expect(score.parts.requirements).toEqual({ points: 2 / 3, max: 100 });
    expect(score).toMatchObject({ total: 67, band: "fair", capped: false });
  });

  it("rescales requirements and keywords to 62.5 and 37.5", () => {
    const score = computeMatchScore({
      ...input, job: { ...job, requirements: job.requirements.slice(0, 2), seniority: "unknown" },
    });
    expect(score.parts).toEqual({
      requirements: { points: 1, max: 62.5 }, keywords: { points: 1, max: 37.5 },
      seniority: null, langEdu: null,
    });
  });

  it("returns no score when nothing can be measured", () => {
    const score = computeMatchScore({
      ...input, job: { ...job, requirements: [], seniority: "unknown" }, labels: [], cvSeniority: null,
    });
    expect(score).toEqual({
      policy: "match/1", total: null, band: null, capped: false, labels: [],
      parts: { requirements: null, keywords: null, seniority: null, langEdu: null },
    });
  });

  it.each([
    ["intern", 0], ["junior", 0], ["mid", 0.5], ["senior", 1], ["lead", 0.5],
  ] as const)("scores CV seniority %s against senior", (cvSeniority, points) => {
    const score = computeMatchScore({ ...input, cvSeniority });
    expect(score.parts.seniority).toEqual({ points, max: 10 });
  });

  it.each([null, "unknown"] as const)("omits seniority when the CV level is %s", (cvSeniority) => {
    expect(computeMatchScore({ ...input, cvSeniority }).parts.seniority).toBeNull();
  });

  it("scores language and education labels without including other categories", () => {
    const score = computeMatchScore({
      ...input, labels: labels.map((label) => {
        if (label.ref === "r0" || label.ref === "r3") return { ...label, status: "missing" };
        if (label.ref === "r2") return { ...label, status: "partial" };
        return label;
      }),
    });
    expect(score.parts.langEdu).toEqual({ points: 0.25, max: 10 });
  });

  it("counts unconfirmed inferred labels as partial until kept, without changing labels", () => {
    const inferredLabels = labels.map((label) => ({ ...label, inferred: true }));
    const unconfirmed = computeMatchScore({ ...input, labels: inferredLabels });
    expect(unconfirmed).toMatchObject({ total: 55, capped: false, labels: inferredLabels });
    expect(unconfirmed.parts.requirements?.points).toBe(0.5);
    expect(unconfirmed.parts.keywords?.points).toBe(0.5);
    expect(unconfirmed.parts.langEdu?.points).toBe(0.5);
    expect(computeMatchScore({
      ...input, labels: inferredLabels, keptInferred: new Set(inferredLabels.map((label) => label.ref)),
    }).total).toBe(100);
    expect(inferredLabels.every((label) => label.status === "met")).toBe(true);
  });

  it("counts partial keywords as half and missing keywords as zero", () => {
    const score = computeMatchScore({
      ...input, job: { ...job, requirements: [], seniority: "unknown" },
      labels: [
        { ...labels[4]!, status: "partial" },
        { ...labels[4]!, ref: "React", status: "missing" },
      ],
    });
    expect(score.parts.keywords).toEqual({ points: 0.25, max: 100 });
    expect(score).toMatchObject({ total: 25, band: "low", capped: false });
  });

  it("treats an unlabelled requirement as missing instead of reporting full coverage", () => {
    const score = computeMatchScore({ ...input, labels: labels.filter((label) => label.ref !== "r0") });
    expect(score.parts.requirements?.points).toBe(2 / 3);
    expect(score).toMatchObject({ total: 69, capped: true });
  });
});

describe("bandOf", () => {
  it.each([
    [100, "excellent"], [85, "excellent"], [84, "strong"], [70, "strong"],
    [69, "fair"], [50, "fair"], [49, "low"], [0, "low"],
  ] as const)("maps %s to %s", (total, band) => {
    expect(bandOf(total)).toBe(band);
  });
});

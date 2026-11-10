import type { JobExtraction } from "./jobs.ts";
import type { MatchLabel, MatchScore } from "./tailor.ts";

export type Seniority = JobExtraction["seniority"];
export type Band = NonNullable<MatchScore["band"]>;

type MatchInput = {
  job: JobExtraction;
  labels: MatchLabel[];
  cvSeniority: Seniority | null;
  keptInferred: Set<string>;
};

export function bandOf(total: number): Band {
  if (total >= 85) return "excellent";
  if (total >= 70) return "strong";
  if (total >= 50) return "fair";
  return "low";
}

function labelPoints(label: MatchLabel | undefined, keptInferred: Set<string>): number {
  if (!label) return 0;
  if (label.inferred && !keptInferred.has(label.ref)) return 0.5;
  return label.status === "met" ? 1 : label.status === "partial" ? 0.5 : 0;
}

// Requirement refs use their zero-based job.requirements index: r0, r1, ...
function requirementLabel(labels: MatchLabel[], index: number): MatchLabel | undefined {
  return labels.find((label) => label.kind === "requirement" && label.ref === `r${index}`);
}

const components: {
  id: keyof MatchScore["parts"];
  weight: number;
  compute(input: MatchInput): { points: number } | null;
}[] = [
  {
    id: "requirements",
    weight: 50,
    compute({ job, labels, keptInferred }) {
      if (!job.requirements.length) return null;
      let points = 0;
      let max = 0;
      job.requirements.forEach((requirement, index) => {
        const weight = requirement.kind === "must" ? 2 : 1;
        points += weight * labelPoints(requirementLabel(labels, index), keptInferred);
        max += weight;
      });
      return { points: points / max };
    },
  },
  {
    id: "keywords",
    weight: 30,
    compute({ labels, keptInferred }) {
      const keywords = labels.filter((label) => label.kind === "keyword");
      if (!keywords.length) return null;
      return { points: keywords.reduce((sum, label) => sum + labelPoints(label, keptInferred), 0) / keywords.length };
    },
  },
  {
    id: "seniority",
    weight: 10,
    compute({ job, cvSeniority }) {
      if (!cvSeniority || cvSeniority === "unknown" || job.seniority === "unknown") return null;
      const levels: Seniority[] = ["intern", "junior", "mid", "senior", "lead"];
      const distance = Math.abs(levels.indexOf(cvSeniority) - levels.indexOf(job.seniority));
      return { points: distance === 0 ? 1 : distance === 1 ? 0.5 : 0 };
    },
  },
  {
    id: "langEdu",
    weight: 10,
    compute({ job, labels, keptInferred }) {
      const points = job.requirements.flatMap((requirement, index) =>
        requirement.category === "language" || requirement.category === "education"
          ? [labelPoints(requirementLabel(labels, index), keptInferred)] : []);
      if (!points.length) return null;
      return { points: points.reduce((sum, value) => sum + value, 0) / points.length };
    },
  },
];

export function computeMatchScore(input: MatchInput): MatchScore {
  const parts: MatchScore["parts"] = { requirements: null, keywords: null, seniority: null, langEdu: null };
  let weight = 0;
  for (const component of components) {
    const result = component.compute(input);
    if (result === null) continue;
    parts[component.id] = { points: result.points, max: component.weight };
    weight += component.weight;
  }

  let sum = 0;
  for (const part of Object.values(parts)) {
    if (part === null) continue;
    part.max = part.max * 100 / weight;
    sum += part.points * part.max;
  }

  const cappedBy = input.job.requirements.filter((requirement, index) =>
    requirement.kind === "must"
      && labelPoints(requirementLabel(input.labels, index), input.keptInferred) === 0)
    .map((requirement) => requirement.text);
  const capped = cappedBy.length > 0;
  const total = weight === 0 ? null : Math.min(Math.round(sum), capped ? 69 : 100);
  return {
    policy: "match/1", total, band: total === null ? null : bandOf(total),
    parts, capped, cappedBy, requirementTexts: input.job.requirements.map((requirement) => requirement.text), labels: input.labels,
  };
}

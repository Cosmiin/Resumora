import {
  detailDimensions,
  qualityIssues,
  diagnosticText,
  isExperienceReview,
  pointNeedsExample,
  pointQualityScore,
  type AssessedPoint,
  type DetailGrade,
  type ExperienceReview,
  type PointRef,
} from "@resumora/contracts/intelligence/experience";

const object = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const grade = { type: "string", enum: ["missing", "partial", "specific"] };
const text = { type: ["string", "null"] };
export function assessmentSchema(
  ids: string[] = [],
  scope: "complete" | "partial" = "complete",
) {
  const id = ids.length ? { type: "string", enum: ids } : { type: "string" };
  const nullableId = { anyOf: [id, { type: "null" }] };
  const references = { type: "array", maxItems: 3, items: id };
  const observation = object({
    status: {
      type: "string",
      enum: ["clear", "needs_attention", "insufficient_context"],
    },
    strength: text,
    improvement: text,
    evidencePointIds: references,
  });
  const experience = object({
    distinctiveness: observation,
    professionalValue: observation,
    coherence: observation,
    priorityPointId: nullableId,
  });
  return object({
    points: {
      type: "array",
      ...(ids.length ? { minItems: ids.length, maxItems: ids.length } : {}),
      items: object({
        id,
        meaningful: { type: "boolean" },
        contribution: grade,
        clarity: grade,
        specificity: grade,
        issue: { type: "string", enum: qualityIssues },
        duplicateOf: nullableId,
        strength: text,
        improvement: text,
        suggestedQuestion: text,
      }),
    },
    dimensions: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: object({
        dimension: { type: "string", enum: detailDimensions },
        grade,
        evidencePointIds: references,
      }),
    },
    experience:
      scope === "partial"
        ? { type: "null" }
        : { anyOf: [experience, { type: "null" }] },
  });
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const fail = (): never => {
  throw Error("EXPERIENCE_SCORE_GRADES");
};
const validGrade = (v: unknown): v is DetailGrade["grade"] =>
  ["missing", "partial", "specific"].includes(String(v));
export function parseAssessment(
  raw: unknown,
  sources: { id: string; point: PointRef }[],
  locale: string,
  scope: "complete" | "partial",
) {
  if (
    !record(raw) ||
    Object.keys(raw).some(
      (k) => !["points", "dimensions", "experience"].includes(k),
    ) ||
    !Array.isArray(raw.points) ||
    raw.points.length !== sources.length ||
    new Set(raw.points.map((p) => p?.id)).size !== sources.length ||
    !Array.isArray(raw.dimensions) ||
    raw.dimensions.length !== 4 ||
    !Object.hasOwn(raw, "experience") ||
    (scope === "partial" && raw.experience !== null)
  )
    fail();
  const value = raw as {
    points: Record<string, unknown>[];
    dimensions: Record<string, unknown>[];
    experience: unknown;
  };
  const points: AssessedPoint[] = sources.map((source, index) => {
    const p = value.points.find((p) => p?.id === source.id);
    if (
      !record(p) ||
      Object.keys(p).some(
        (k) =>
          ![
            "id",
            "meaningful",
            "contribution",
            "clarity",
            "specificity",
            "issue",
            "duplicateOf",
            "strength",
            "improvement",
            "suggestedQuestion",
          ].includes(k),
      ) ||
      typeof p.meaningful !== "boolean" ||
      !validGrade(p.contribution) ||
      !validGrade(p.clarity) ||
      !validGrade(p.specificity) ||
      !qualityIssues.includes(p.issue as any)
    )
      fail();
    const g = p!;
    if (
      g.issue === "duplicate"
        ? !sources.slice(0, index).some((s) => s.id === g.duplicateOf)
        : g.duplicateOf !== null
    )
      fail();
    const meaningful =
      g.meaningful === true && !pointNeedsExample(source.point.text);
    const issue = !meaningful
      ? "example"
      : g.issue === "duplicate"
        ? "duplicate"
        : g.contribution !== "specific"
          ? "contribution"
          : g.clarity !== "specific"
            ? g.issue === "terminology"
              ? "terminology"
              : "clarity"
            : g.specificity !== "specific"
              ? ["methods", "scope", "outcome"].includes(String(g.issue))
                ? g.issue
                : "specificity"
              : "none";
    const compatible = issue === g.issue;
    const strength =
      meaningful && compatible && diagnosticText(g.strength)
        ? g.strength
        : null;
    let improvement =
      compatible && issue !== "none" && diagnosticText(g.improvement)
        ? g.improvement
        : null;
    let suggestedQuestion =
      improvement &&
      diagnosticText(g.suggestedQuestion) &&
      (String(g.suggestedQuestion).match(/\?/g)?.length ?? 0) <= 1
        ? g.suggestedQuestion
        : null;
    if (issue === "duplicate") {
      improvement =
        new Intl.Locale(locale).language === "ro"
          ? "Acest punct repetă o contribuție anterioară. Combină formulările fără a adăuga informații nesusținute."
          : new Intl.Locale(locale).language === "en" ? "This repeats an earlier contribution. Combine the wording without adding unsupported information." : improvement;
      suggestedQuestion = null;
    }
    const result = {
      id: source.id,
      point: source.point,
      meaningful,
      contribution: meaningful ? g.contribution : "missing",
      clarity: meaningful ? g.clarity : "missing",
      specificity: meaningful ? g.specificity : "missing",
      issue,
      duplicateOf: issue === "duplicate" ? g.duplicateOf : null,
      strength,
      improvement,
      suggestedQuestion,
    } as Omit<AssessedPoint, "score">;
    return { ...result, score: pointQualityScore(result) };
  });
  const seen = new Set<string>();
  const dimensions: DetailGrade[] = value.dimensions.map((d) => {
    if (
      !record(d) ||
      Object.keys(d).some(
        (k) => !["dimension", "grade", "evidencePointIds"].includes(k),
      ) ||
      !detailDimensions.includes(d.dimension as any) ||
      seen.has(String(d.dimension)) ||
      !validGrade(d.grade) ||
      !Array.isArray(d.evidencePointIds) ||
      d.evidencePointIds.length > 3 ||
      new Set(d.evidencePointIds).size !== d.evidencePointIds.length ||
      d.evidencePointIds.some(
        (id) => typeof id !== "string" || !sources.some((s) => s.id === id),
      ) ||
      (d.grade === "missing"
        ? d.evidencePointIds.length !== 0
        : d.evidencePointIds.length === 0)
    )
      throw Error("EXPERIENCE_SCORE_EVIDENCE");
    seen.add(String(d.dimension));
    const evidence = (d.evidencePointIds as string[])
      .filter((id) =>
        points.some(
          (p) => p.id === id && p.meaningful && p.issue !== "duplicate",
        ),
      )
      .map((id) => sources.find((s) => s.id === id)!.point.text);
    return {
      dimension: d.dimension,
      grade: evidence.length ? d.grade : "missing",
      evidence,
    } as DetailGrade;
  });
  let experience: ExperienceReview | null = isExperienceReview(
    value.experience,
    points,
  )
    ? value.experience
    : null;
  if (experience && points.length < 2)
    experience = {
      ...experience,
      distinctiveness: {
        status: "insufficient_context",
        strength: null,
        improvement: null,
        evidencePointIds: [],
      },
    };
  return { points, dimensions, experience };
}

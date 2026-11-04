import { canonicalContentLocale, contentLocale, contentLanguagePolicyVersion } from "../editor/content-language.ts";
import { isAccepted, type BaseDraft } from "../editor/model.ts";
import { currentWording } from "../editor/wording.ts";
import { experienceTarget, experienceFields } from './experience-target.ts';
export { experienceTarget, experienceTargets } from './experience-target.ts';
import { answerEvidenceText } from "./model.ts";
import type { CareerFact } from "./context.ts";
import {
  experiencePolicy,
  experiencePolicies,
  legacyExperiencePolicyVersion,
  type ExperienceScoringPolicy,
} from "./experience-policy.ts";

export type PointRef = { start: number; end: number; text: string };
export type ExperienceIntent = "point" | "questions" | "skills" | "score" | "role" | "preview";
export type ExperienceRequest = {
  intent: ExperienceIntent;
  fingerprint: string;
  point?: PointRef;
  instruction?: string;
  scoreAttempt?: number;
  feedbackLocale?: string;
  candidate?: string;
};
export type DetailDimension = "contribution" | "methods" | "scope" | "outcome";
export const detailDimensions: DetailDimension[] = [
  "contribution",
  "methods",
  "scope",
  "outcome",
];
export type DetailGrade = {
  dimension: DetailDimension;
  grade: "missing" | "partial" | "specific";
  evidence: string[];
};
export const qualityIssues = [
  "example",
  "contribution",
  "clarity",
  "specificity",
  "methods",
  "scope",
  "outcome",
  "terminology",
  "duplicate",
  "none",
] as const;
export type QualityIssue = (typeof qualityIssues)[number];
export type PointQuality = {
  point: PointRef;
  meaningful: boolean;
  contribution: DetailGrade["grade"];
  clarity: DetailGrade["grade"];
  specificity: DetailGrade["grade"];
  issue: QualityIssue;
  score: number;
};
export type AssessedPoint = PointQuality & {
  id: string;
  duplicateOf: string | null;
  strength: string | null;
  improvement: string | null;
  suggestedQuestion: string | null;
};
export type ExperienceObservation = {
  status: "clear" | "needs_attention" | "insufficient_context";
  strength: string | null;
  improvement: string | null;
  evidencePointIds: string[];
};
export type ExperienceReview = {
  distinctiveness: ExperienceObservation;
  professionalValue: ExperienceObservation;
  coherence: ExperienceObservation;
  priorityPointId: string | null;
};
export type DiagnosticAssessment = {
  rubric: "experience-quality/3";
  policyVersion: string;
  feedbackLocale: string;
  scope: "complete" | "partial";
  dimensions: DetailGrade[];
  points: AssessedPoint[];
  experience: ExperienceReview | null;
  score: number;
};
export type DetailAssessment =
  | DiagnosticAssessment
  | {
      rubric: "experience-detail/1";
      dimensions: DetailGrade[];
      score: number;
    }
  | {
      rubric: "experience-quality/2";
      policyVersion?: string;
      dimensions: DetailGrade[];
      points: PointQuality[];
      score: number;
    };
export function isWritingAssessment(
  value: DetailAssessment | undefined,
): value is Exclude<DetailAssessment, { rubric: "experience-detail/1" }> {
  return (
    value?.rubric === "experience-quality/2" ||
    value?.rubric === "experience-quality/3"
  );
}
export const feedbackLanguage = (value: string): string => {
  const locale = canonicalContentLocale(value);
  if (!locale) throw new Error("CONTENT_LOCALE_INVALID");
  return locale;
};
export function assessmentFeedback(
  value: DetailAssessment | undefined,
  locale: string,
): DiagnosticAssessment | undefined {
  return value?.rubric === "experience-quality/3" &&
    value.feedbackLocale === feedbackLanguage(locale)
    ? value
    : undefined;
}
export function priorityExperiencePoint(
  value: Exclude<DetailAssessment, { rubric: "experience-detail/1" }>,
) {
  const rank = (p: PointQuality) =>
    !p.meaningful
      ? 0
      : p.issue === "duplicate"
        ? 1
        : p.contribution !== "specific"
          ? 2
          : p.clarity !== "specific"
            ? 3
            : 4;
  const fallback = value.points
    .filter((p) => p.issue !== "none")
    .sort((a, b) => rank(a) - rank(b) || a.score - b.score)[0];
  if (value.rubric === "experience-quality/3") {
    const selected = value.points.find(
      (p) => p.id === value.experience?.priorityPointId && p.issue !== "none",
    );
    if (selected && (!fallback || rank(selected) === rank(fallback)))
      return selected;
  }
  return fallback;
}
export type CoachingQuestion = {
  id: string;
  dimension: "ownership" | "tools" | "scale" | "impact";
  text: string;
  hint?: string;
};
export type SkillSuggestion = {
  id: string;
  label: string;
  category: "technicalSkills" | "professionalSkills";
  importance?: "core" | "supporting";
};
export type ExperienceResult = {
  schemaVersion: "experience-assistant/1";
  targetId: string;
  fingerprint: string;
} & (
  | { intent: "role"; text: string; explanation: string; factIds: string[] }
  | { intent: "preview"; candidate: string; assessment: DetailAssessment }
  | {
      intent: "point";
      point?: PointRef;
      text: string;
      explanation: string;
      factIds: string[];
      needsDetails?: string;
      assessment?: DetailAssessment;
      proposedAssessment?: DetailAssessment;
    }
  | { intent: "questions"; point?: PointRef; questions: CoachingQuestion[] }
  | { intent: "skills"; skills: SkillSuggestion[]; extractionVersion?: "skills-inventory/1" | "skills-inventory/2" }
  | { intent: "score"; assessment: DetailAssessment }
);
export type ExperienceSession = {
  version: 1;
  roleProposal?: Extract<ExperienceResult, { intent: 'role' }>;
  candidate?: string;
  preview?: Extract<ExperienceResult, { intent: 'preview' }>;
  guided?: boolean;
  acceptedText?: string;
  previewFailed?: boolean;
  skillsIdentity?: string;
  skillsFailed?: boolean;
  acceptedScore?: { before?: number; after: number; text: string };
  supersededAnswerIds?: string[];
  editor?: {
    baseText: string;
    point?: PointRef;
    text: string;
    mode: "edit" | "add";
  };
  round?: {
    id: string;
    fingerprint: string;
    feedbackLocale?: string;
    point?: PointRef;
    questions: CoachingQuestion[];
    answerIds: string[];
  };
  rounds?: NonNullable<ExperienceSession["round"]>[];
  questionPreparations?: {
    id: string;
    request: ExperienceRequest;
    status: "pending" | "ready" | "failed" | "unknown";
    questions?: CoachingQuestion[];
  }[];
  pending?: { id: string; request: ExperienceRequest };
  scorePending?: {
    id: string;
    request: ExperienceRequest;
    body: string;
    scoreIdentity?: string;
  };
  scoreError?: "failed" | "unknown" | "not_started";
  proposal?: Extract<ExperienceResult, { intent: "point" }>;
  skills?: Extract<ExperienceResult, { intent: "skills" }>;
  skillChoices?: Record<
    string,
    {
      selected: boolean;
      dismissed?: boolean;
      label: string;
      category: "technicalSkills" | "professionalSkills";
    }
  >;
  assessment?: {
    fingerprint: string;
    body: string;
    value: DetailAssessment;
    scoreIdentity?: string;
    scoreAttempt?: number;
  };
  undo?: { before: string; after: string; sources: CareerFact[] };
};
export function experienceText(d: BaseDraft, id: string): string {
  const r = experienceTarget(d, id);
  if (!r) throw Error("INVALID_TARGET");
  return (
    currentWording(d, id) ??
    experienceFields(d, r).map(f => f.id === r.context.id ? f.value : `• ${f.value}`)
      .filter(Boolean)
      .join("\n\n")
  );
}
/** Raw offsets preserve every unselected byte, including list markers and spacing. */
export function experiencePoints(text: string): PointRef[] {
  const out: PointRef[] = [];
  const re = /[^\n]+(?:\n(?!\s*(?:[-*•]|\d+[.)])\s|\s*\n)[^\n]+)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0],
      leading = raw.match(/^\s*(?:(?:[-*•]|\d+[.)])\s+)?/)![0].length;
    const content = raw.slice(leading).trimEnd();
    if (content)
      out.push({
        start: m.index + leading,
        end: m.index + leading + content.length,
        text: content,
      });
  }
  return out;
}
export function replaceExperiencePoint(
  body: string,
  point: PointRef | undefined,
  text: string,
): string {
  if (!text.trim() || text.length > 2000) throw Error("INVALID_POINT");
  if (point) {
    if (
      !experiencePoints(body).some(
        (p) =>
          p.start === point.start &&
          p.end === point.end &&
          p.text === point.text,
      )
    )
      throw Error("STALE_INPUT");
    return body.slice(0, point.start) + text.trim() + body.slice(point.end);
  }
  const ordered = body.match(/(?:^|\n)\s*(\d+)[.)]\s+[^\n]+(?=\s*$)/);
  return (
    body +
    (body ? "\n\n" : "") +
    (ordered ? `${Number(ordered[1]) + 1}. ` : "• ") +
    text.trim()
  );
}
export function experienceFacts(d: BaseDraft, id: string): CareerFact[] {
  const role = experienceTarget(d, id);
  if (!role) throw Error("INVALID_TARGET");
  const facts: CareerFact[] = experienceFields(d, role)
    .map((f) => ({
      id: f.id,
      text: f.value,
      sourceId: f.sourceId,
      ...(f.sourceClaimId ? { sourceClaimId: f.sourceClaimId } : {}),
      ...(f.sourceLineage
        ? { sourceLineage: structuredClone(f.sourceLineage) }
        : {}),
    }));
  for (const a of d.answers)
    if (
      a.targetId === id &&
      a.status === "confirmed" &&
      !(d.presentation.hiddenFields ?? []).includes(a.cvFieldId ?? '') &&
      !d.experienceEnrichment?.[id]?.supersededAnswerIds?.includes(a.id) &&
      a.sourceId &&
      answerEvidenceText(a).trim()
    )
      facts.push({
        id: a.id,
        text: answerEvidenceText(a),
        sourceId: a.sourceId,
      });
  return facts;
}
export function experienceIdentity(d: BaseDraft, id: string): string {
  const r = experienceTarget(d, id);
  if (!r) throw Error("INVALID_TARGET");
  return JSON.stringify([
    experienceText(d, id),
    experienceFacts(d, id),
    r.title.value,
    r.company?.value ?? '',
    contentLocale(d),
    contentLanguagePolicyVersion,
  ]);
}
export async function experienceFingerprint(
  d: BaseDraft,
  id: string,
): Promise<string> {
  const input = experienceIdentity(d, id);
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
/** Only inputs actually sent to the scorer. Coaching evidence and UI locale are excluded. */
export function experienceScoreIdentity(
  d: BaseDraft,
  id: string,
  locale: string = contentLocale(d),
): string {
  const role = experienceTarget(d, id);
  if (!role) throw Error("INVALID_TARGET");
  return JSON.stringify([
    experiencePolicy.version,
    role.title.value.slice(0, 200),
    contentLocale(d),
    contentLanguagePolicyVersion,
    feedbackLanguage(locale),
    experienceText(d, id),
  ]);
}
async function scoreHash(value: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export const experienceScoreFingerprint = (
  d: BaseDraft,
  id: string,
  locale: string = contentLocale(d),
) => scoreHash(experienceScoreIdentity(d, id, locale));
/** Stable receipt across tabs, revisions and remounts; no new generation on a retry. */
export async function experienceScoreOperationId(
  d: BaseDraft,
  id: string,
  attempt = 0,
  locale: string = contentLocale(d),
): Promise<string> {
  const hash = await scoreHash(
    JSON.stringify([d.id, id, experienceScoreIdentity(d, id, locale), attempt]),
  );
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function currentExperienceAssessment(
  d: BaseDraft,
  id: string,
  locale?: string,
) {
  if (!experienceTarget(d, id)) return undefined;
  const saved = d.experienceEnrichment?.[id]?.assessment;
  const language =
    saved?.value.rubric === "experience-quality/3"
      ? saved.value.feedbackLocale
      : d.language;
  return isWritingAssessment(saved?.value) &&
    saved.value.rubric === experiencePolicy.rubric &&
    (saved.value.policyVersion ?? legacyExperiencePolicyVersion) ===
      experiencePolicy.version &&
    saved.body === experienceText(d, id) &&
    (!saved.scoreIdentity ||
      saved.scoreIdentity === experienceScoreIdentity(d, id, language)) &&
    language === feedbackLanguage(locale ?? contentLocale(d))
    ? saved.value
    : undefined;
}
export function detailScore(dimensions: DetailGrade[]): number {
  return Math.round(
    dimensions.reduce(
      (sum, g) => sum + { missing: 0, partial: 12.5, specific: 25 }[g.grade],
      0,
    ),
  );
}
/** Obvious placeholders are never upgraded by inference or borrowed role context. */
export function pointNeedsExample(text: string): boolean {
  const value = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .replace(/\s+/g, " ");
  return (
    !value ||
    /^(.)\1*$/.test(value) ||
    /^(?:placeholder|test|testing|todo|tbd|asdf|asdas|dasda asdas|n am facut nimic special|nam facut nimic special|nothing special|lorem ipsum)$/.test(
      value,
    )
  );
}
export function pointQualityScore(
  p: Omit<PointQuality, "score">,
  weights: ExperienceScoringPolicy["weights"] = experiencePolicy.weights,
): number {
  if (
    !p.meaningful ||
    pointNeedsExample(p.point.text) ||
    p.issue === "duplicate"
  )
    return 0;
  const level = { missing: 0, partial: 0.5, specific: 1 };
  return Math.round(
    weights.contribution * level[p.contribution] +
      weights.clarity * level[p.clarity] +
      weights.specificity * level[p.specificity],
  );
}
export function experienceQualityScore(
  points: PointQuality[],
  weights: ExperienceScoringPolicy["weights"] = experiencePolicy.weights,
): number {
  return points.length
    ? Math.round(
        points.reduce((sum, p) => sum + pointQualityScore(p, weights), 0) /
          points.length,
      )
    : 0;
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const string = (v: unknown, max = 2000): v is string =>
  typeof v === "string" && v.length <= max;
const strings = (v: unknown, max = 24): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => string(x));
export function isPoint(v: unknown): v is PointRef {
  return (
    record(v) &&
    keys(v, ["start", "end", "text"]) &&
    Number.isSafeInteger(v.start) &&
    Number.isSafeInteger(v.end) &&
    Number(v.start) >= 0 &&
    Number(v.end) > Number(v.start) &&
    string(v.text, 20000) &&
    Number(v.end) - Number(v.start) === v.text.length
  );
}
export function isExperienceRequest(v: unknown): v is ExperienceRequest {
  return (
    record(v) &&
    keys(v, [
      "intent",
      "fingerprint",
      "point",
      "instruction",
      "scoreAttempt",
      "feedbackLocale",
      "candidate",
    ]) &&
    (v.feedbackLocale === undefined ||
      (typeof v.feedbackLocale === "string" && canonicalContentLocale(v.feedbackLocale) === v.feedbackLocale)) &&
    (v.scoreAttempt === undefined ||
      (v.intent === "score" &&
        Number.isSafeInteger(v.scoreAttempt) &&
        Number(v.scoreAttempt) > 0 &&
        Number(v.scoreAttempt) <= 100)) &&
    ["point", "questions", "skills", "score", "role", "preview"].includes(String(v.intent)) &&
    (v.intent === 'preview' ? string(v.candidate, 12000) && !!v.candidate.trim() : v.candidate === undefined) &&
    typeof v.fingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(v.fingerprint) &&
    (v.point === undefined || isPoint(v.point)) &&
    (v.instruction === undefined || string(v.instruction)) &&
    (!["skills", "score", "role", "preview"].includes(String(v.intent)) ||
      (v.point === undefined && v.instruction === undefined))
  );
}
function isQuestion(v: unknown): v is CoachingQuestion {
  return (
    record(v) &&
    keys(v, ["id", "dimension", "text", "hint"]) &&
    (v.hint === undefined || (string(v.hint, 500) && !!v.hint.trim())) &&
    string(v.id, 128) &&
    ["ownership", "tools", "scale", "impact"].includes(String(v.dimension)) &&
    string(v.text, 500) &&
    !!v.text.trim()
  );
}
export const diagnosticText = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && !!v.trim() && v.length <= 240);
export function isExperienceReview(
  v: unknown,
  points: AssessedPoint[],
): v is ExperienceReview {
  if (
    !record(v) ||
    !keys(v, [
      "distinctiveness",
      "professionalValue",
      "coherence",
      "priorityPointId",
    ])
  )
    return false;
  const ids = new Set(
    points
      .filter((p) => p.meaningful && p.issue !== "duplicate")
      .map((p) => p.id),
  );
  if (
    v.priorityPointId !== null &&
    !points.some((p) => p.id === v.priorityPointId && p.issue !== "none")
  )
    return false;
  return [v.distinctiveness, v.professionalValue, v.coherence].every(
    (o) =>
      record(o) &&
      keys(o, ["status", "strength", "improvement", "evidencePointIds"]) &&
      ["clear", "needs_attention", "insufficient_context"].includes(
        String(o.status),
      ) &&
      diagnosticText(o.strength) &&
      diagnosticText(o.improvement) &&
      strings(o.evidencePointIds, 3) &&
      new Set(o.evidencePointIds).size === o.evidencePointIds.length &&
      o.evidencePointIds.every((id) => ids.has(id)) &&
      (o.status === "insufficient_context"
        ? o.strength === null &&
          o.improvement === null &&
          o.evidencePointIds.length === 0
        : o.evidencePointIds.length > 0 &&
          (o.status !== "clear" ||
            (o.strength !== null && o.improvement === null))),
  );
}
export function isAssessment(v: unknown): v is DetailAssessment {
  if (!record(v)) return false;
  const modern = v.rubric === "experience-quality/3",
    writing = modern || v.rubric === "experience-quality/2";
  if (
    !keys(v, [
      "rubric",
      "dimensions",
      "score",
      ...(writing ? ["points", "policyVersion"] : []),
      ...(modern ? ["feedbackLocale", "scope", "experience"] : []),
    ]) ||
    ![
      "experience-detail/1",
      "experience-quality/2",
      "experience-quality/3",
    ].includes(String(v.rubric)) ||
    !Array.isArray(v.dimensions) ||
    v.dimensions.length !== 4
  )
    return false;
  const version = v.policyVersion ?? legacyExperiencePolicyVersion;
  const policy =
    typeof version === "string" && Object.hasOwn(experiencePolicies, version)
      ? experiencePolicies[version]
      : undefined;
  if (writing && (!policy || policy.rubric !== v.rubric)) return false;
  if (
    !v.dimensions.every(
      (g) =>
        record(g) &&
        keys(g, ["dimension", "grade", "evidence"]) &&
        detailDimensions.includes(g.dimension as DetailDimension) &&
        ["missing", "partial", "specific"].includes(String(g.grade)) &&
        Array.isArray(g.evidence) &&
        g.evidence.length <= 3 &&
        g.evidence.every((q) => string(q, modern ? 6000 : 2000)) &&
        (g.grade === "missing"
          ? g.evidence.length === 0
          : g.evidence.length > 0),
    ) ||
    new Set(v.dimensions.map((g) => g.dimension)).size !== 4
  )
    return false;
  if (!writing) return v.score === detailScore(v.dimensions as DetailGrade[]);
  if (!Array.isArray(v.points) || v.points.length > 500) return false;
  const points = v.points;
  if (
    !points.every(
      (p, index) =>
        record(p) &&
        keys(p, [
          "point",
          "meaningful",
          "contribution",
          "clarity",
          "specificity",
          "issue",
          "score",
          ...(modern
            ? [
                "id",
                "duplicateOf",
                "strength",
                "improvement",
                "suggestedQuestion",
              ]
            : []),
        ]) &&
        isPoint(p.point) &&
        typeof p.meaningful === "boolean" &&
        [p.contribution, p.clarity, p.specificity].every((g) =>
          ["missing", "partial", "specific"].includes(String(g)),
        ) &&
        qualityIssues.includes(p.issue as QualityIssue) &&
        p.score === pointQualityScore(p as PointQuality, policy!.weights) &&
        (!modern ||
          (typeof p.id === "string" &&
            /^p[0-9]+$/.test(p.id) &&
            diagnosticText(p.strength) &&
            diagnosticText(p.improvement) &&
            diagnosticText(p.suggestedQuestion) &&
            (p.suggestedQuestion === null || p.improvement !== null) &&
            (p.issue !== "none" ||
              (p.meaningful &&
                p.contribution === "specific" &&
                p.clarity === "specific" &&
                p.specificity === "specific" &&
                p.improvement === null &&
                p.suggestedQuestion === null)) &&
            (p.issue === "duplicate"
              ? points.slice(0, index).some((q) => q.id === p.duplicateOf) &&
                p.suggestedQuestion === null
              : p.duplicateOf === null))),
    )
  )
    return false;
  if (
    new Set(points.map((p) => p.point.start)).size !== points.length ||
    v.score !==
      experienceQualityScore(points as PointQuality[], policy!.weights)
  )
    return false;
  if (!modern) return true;
  return (
    (typeof v.feedbackLocale === "string" && canonicalContentLocale(v.feedbackLocale) === v.feedbackLocale) &&
    ["complete", "partial"].includes(String(v.scope)) &&
    new Set(points.map((p) => p.id)).size === points.length &&
    (v.experience === null ||
      (v.scope === "complete" &&
        isExperienceReview(v.experience, points as AssessedPoint[])))
  );
}
export function isExperienceResult(v: unknown): v is ExperienceResult {
  if (
    !record(v) ||
    v.schemaVersion !== "experience-assistant/1" ||
    !string(v.targetId, 128) ||
    typeof v.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.fingerprint)
  )
    return false;
  const common = ["schemaVersion", "targetId", "fingerprint", "intent"];
  switch (v.intent) {
    case 'role':
      return keys(v, [...common, 'text', 'explanation', 'factIds']) &&
        string(v.text, 12000) && !!v.text.trim() && !/[<>]|```/.test(v.text) &&
        string(v.explanation, 500) && strings(v.factIds) && v.factIds.length > 0;
    case 'preview':
      return keys(v, [...common, 'candidate', 'assessment']) && string(v.candidate, 12000) && !!v.candidate.trim() && isAssessment(v.assessment);
    case "point":
      return (
        keys(v, [
          ...common,
          "point",
          "text",
          "explanation",
          "factIds",
          "needsDetails",
          "assessment",
          "proposedAssessment",
        ]) &&
        (v.point === undefined || isPoint(v.point)) &&
        string(v.text) &&
        (v.needsDetails !== undefined
          ? string(v.needsDetails, 500) &&
            !!v.needsDetails.trim() &&
            v.text === ""
          : !!v.text.trim()) &&
        !/[\n\r<>]/.test(v.text) &&
        !/^\s*(?:[-*•]|\d+[.)])\s+/.test(v.text) &&
        string(v.explanation, 500) &&
        strings(v.factIds) &&
        (v.needsDetails !== undefined
          ? v.factIds.length === 0
          : v.factIds.length > 0) &&
        (v.assessment === undefined || isAssessment(v.assessment)) &&
        (v.proposedAssessment === undefined ||
          isAssessment(v.proposedAssessment))
      );
    case "questions":
      return (
        keys(v, [...common, "point", "questions"]) &&
        (v.point === undefined || isPoint(v.point)) &&
        Array.isArray(v.questions) &&
        v.questions.length <= 3 &&
        v.questions.every(isQuestion) &&
        new Set(v.questions.map((q) => q.id)).size === v.questions.length
      );
    case "skills":
      return (
        keys(v, [...common, "skills", "extractionVersion"]) &&
        (v.extractionVersion === undefined || ["skills-inventory/1", "skills-inventory/2"].includes(String(v.extractionVersion))) &&
        Array.isArray(v.skills) &&
        v.skills.length <= 60 &&
        ["technicalSkills", "professionalSkills"].every(category =>
          (v.skills as { category?: string }[]).filter(s => s?.category === category).length <= 30) &&
        v.skills.every(
          (s) =>
            record(s) &&
            keys(s, ["id", "label", "category", "evidence", "factIds", "basis", "importance", "rationale"]) &&
            (s.importance === undefined || ["core", "supporting"].includes(String(s.importance))) &&
            string(s.id, 128) &&
            string(s.label, 100) &&
            !!s.label.trim() &&
            ["technicalSkills", "professionalSkills"].includes(
              String(s.category),
            ),
        ) &&
        new Set(v.skills.map((s) => s.id)).size === v.skills.length
      );
    case "score":
      return keys(v, [...common, "assessment"]) && isAssessment(v.assessment);
    default:
      return false;
  }
}
/** Additive, bounded session metadata; never a second source of CV text. */
export function isExperienceSessions(
  v: unknown,
): v is Record<string, ExperienceSession> {
  if (
    !record(v) ||
    Object.keys(v).length > 100 ||
    JSON.stringify(v).length > 400000
  )
    return false;
  return Object.values(v).every((s) => {
    if (
      !record(s) ||
      !keys(s, [
        "version",
        "roleProposal", "candidate", "preview", "guided", "acceptedText", "previewFailed", "skillsIdentity", "skillsFailed", "acceptedScore",
        "supersededAnswerIds",
        "editor",
        "round",
        "rounds",
        "questionPreparations",
        "pending",
        "scorePending",
        "scoreError",
        "proposal",
        "skills",
        "skillChoices",
        "assessment",
        "undo",
      ]) ||
      s.version !== 1
    )
      return false;
    if (s.roleProposal !== undefined && !(isExperienceResult(s.roleProposal) && s.roleProposal.intent === 'role')) return false;
    if (s.preview !== undefined && !(isExperienceResult(s.preview) && s.preview.intent === 'preview')) return false;
    if (s.candidate !== undefined && !string(s.candidate, 12000)) return false;
    if (s.acceptedText !== undefined && !string(s.acceptedText, 12000)) return false;
    if (s.guided !== undefined && typeof s.guided !== 'boolean') return false;
    if (s.previewFailed !== undefined && typeof s.previewFailed !== 'boolean') return false;
    if (s.skillsIdentity !== undefined && !string(s.skillsIdentity, 110000)) return false;
    if (s.skillsFailed !== undefined && typeof s.skillsFailed !== 'boolean') return false;
    if (s.acceptedScore !== undefined && !(record(s.acceptedScore) && keys(s.acceptedScore, ['before','after','text']) &&
      string(s.acceptedScore.text, 12000) && Number.isInteger(s.acceptedScore.after) && Number(s.acceptedScore.after) >= 0 && Number(s.acceptedScore.after) <= 100 &&
      (s.acceptedScore.before === undefined || (Number.isInteger(s.acceptedScore.before) && Number(s.acceptedScore.before) >= 0 && Number(s.acceptedScore.before) <= 100)))) return false;
    if (
      s.supersededAnswerIds !== undefined &&
      !strings(s.supersededAnswerIds, 300)
    )
      return false;
    if (
      s.editor !== undefined &&
      !(
        record(s.editor) &&
        keys(s.editor, ["baseText", "point", "text", "mode"]) &&
        string(s.editor.baseText, 100000) &&
        string(s.editor.text, 20000) &&
        ["edit", "add"].includes(String(s.editor.mode)) &&
        (s.editor.point === undefined || isPoint(s.editor.point))
      )
    )
      return false;
    const validRound = (round: unknown) => (
        record(round) &&
        keys(round, [
          "id",
          "fingerprint",
          "feedbackLocale",
          "point",
          "questions",
          "answerIds",
        ]) &&
        string(round.id, 128) &&
        string(round.fingerprint, 64) &&
        (round.feedbackLocale === undefined || (typeof round.feedbackLocale === "string" && canonicalContentLocale(round.feedbackLocale) === round.feedbackLocale)) &&
        (round.point === undefined || isPoint(round.point)) &&
        Array.isArray(round.questions) &&
        round.questions.length <= 3 &&
        round.questions.every(isQuestion) &&
        strings(round.answerIds, 3) &&
        round.questions.length === round.answerIds.length
    );
    if (s.questionPreparations !== undefined && !(
      Array.isArray(s.questionPreparations) && s.questionPreparations.length <= 3 &&
      new Set(s.questionPreparations.map((p) => record(p) ? p.id : null)).size === s.questionPreparations.length &&
      s.questionPreparations.every((p) => record(p) &&
        keys(p, ["id", "request", "status", "questions"]) &&
        string(p.id, 128) && !!p.id && isExperienceRequest(p.request) &&
        p.request.intent === "questions" && p.request.point !== undefined &&
        p.request.feedbackLocale !== undefined &&
        ["pending", "ready", "failed", "unknown"].includes(String(p.status)) &&
        (p.status === "ready"
          ? Array.isArray(p.questions) && p.questions.length <= 3 &&
            p.questions.every(isQuestion) && new Set(p.questions.map((q) => q.id)).size === p.questions.length
          : p.questions === undefined))
    )) return false;
    if (s.round !== undefined && !validRound(s.round)) return false;
    if (s.rounds !== undefined && !(Array.isArray(s.rounds) && s.rounds.length <= 100 && s.rounds.every(validRound))) return false;
    if (
      s.pending !== undefined &&
      !(
        record(s.pending) &&
        keys(s.pending, ["id", "request"]) &&
        string(s.pending.id, 128) &&
        isExperienceRequest(s.pending.request)
      )
    )
      return false;
    if (
      s.scoreError !== undefined &&
      !["failed", "unknown", "not_started"].includes(String(s.scoreError))
    )
      return false;
    if (
      s.scorePending !== undefined &&
      !(
        record(s.scorePending) &&
        keys(s.scorePending, ["id", "request", "body", "scoreIdentity"]) &&
        (s.scorePending.scoreIdentity === undefined ||
          string(s.scorePending.scoreIdentity, 110000)) &&
        string(s.scorePending.id, 128) &&
        isExperienceRequest(s.scorePending.request) &&
        s.scorePending.request.intent === "score" &&
        string(s.scorePending.body, 100000)
      )
    )
      return false;
    if (
      s.proposal !== undefined &&
      !(isExperienceResult(s.proposal) && s.proposal.intent === "point")
    )
      return false;
    if (
      s.skills !== undefined &&
      !(isExperienceResult(s.skills) && s.skills.intent === "skills")
    )
      return false;
    if (
      s.skillChoices !== undefined &&
      !(
        record(s.skillChoices) &&
        // Current results remain capped at 30; exclusions may span earlier runs.
        Object.keys(s.skillChoices).length <= 300 &&
        Object.values(s.skillChoices).every(
          (c) =>
            record(c) &&
            keys(c, ["selected", "label", "category", "dismissed"]) &&
            (c.dismissed === undefined || typeof c.dismissed === "boolean") &&
            typeof c.selected === "boolean" &&
            string(c.label, 100) &&
            ["technicalSkills", "professionalSkills"].includes(
              String(c.category),
            ),
        )
      )
    )
      return false;
    if (
      s.assessment !== undefined &&
      !(
        record(s.assessment) &&
        keys(s.assessment, ["fingerprint", "body", "value", "scoreIdentity", "scoreAttempt"]) &&
        (s.assessment.scoreAttempt === undefined || (Number.isSafeInteger(s.assessment.scoreAttempt) && Number(s.assessment.scoreAttempt) >= 0 && Number(s.assessment.scoreAttempt) <= 100)) &&
        (s.assessment.scoreIdentity === undefined ||
          string(s.assessment.scoreIdentity, 110000)) &&
        string(s.assessment.fingerprint, 64) &&
        string(s.assessment.body, 100000) &&
        isAssessment(s.assessment.value) &&
        (s.assessment.value.rubric !== "experience-quality/2" ||
          (() => {
            const expected = experiencePoints(s.assessment.body as string);
            const actual = s.assessment.value as Extract<
              DetailAssessment,
              { rubric: "experience-quality/2" }
            >;
            return (
              expected.length === actual.points.length &&
              expected.every(
                (p, i) =>
                  p.start === actual.points[i].point.start &&
                  p.end === actual.points[i].point.end &&
                  p.text === actual.points[i].point.text,
              )
            );
          })())
      )
    )
      return false;
    if (s.undo !== undefined) {
      const u = s.undo;
      if (
        !record(u) ||
        !keys(u, ["before", "after", "sources"]) ||
        !string(u.before, 100000) ||
        !string(u.after, 100000) ||
        !Array.isArray(u.sources)
      )
        return false;
      if (
        !u.sources.every((f) => {
          if (
            !record(f) ||
            !keys(f, [
              "id",
              "text",
              "sourceId",
              "sourceClaimId",
              "sourceLineage",
            ]) ||
            !string(f.id, 128) ||
            !string(f.text, 100000) ||
            !string(f.sourceId, 128)
          )
            return false;
          if (f.sourceClaimId !== undefined && !string(f.sourceClaimId, 128))
            return false;
          return (
            f.sourceLineage === undefined ||
            (Array.isArray(f.sourceLineage) &&
              f.sourceLineage.every(
                (l) =>
                  record(l) &&
                  keys(l, ["sourceId", "sourceClaimId"]) &&
                  string(l.sourceId, 128) &&
                  (l.sourceClaimId === undefined ||
                    string(l.sourceClaimId, 128)),
              ))
          );
        })
      )
        return false;
    }
    return true;
  });
}

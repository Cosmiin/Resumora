import { clone, type BaseDraft, type Answer } from "./model.ts";
import { isBaseDraft } from "./transport.ts";
import { isUuid } from "../jobs/connected.ts";

export const draftKinds = [
  "intake",
  "import-review",
  "job-review",
  "tailor-review",
  "job-answer",
  "translation-review",
  "resume",
] as const;
export type DraftKind = (typeof draftKinds)[number];
export type WorkspaceDraft<T = Record<string, unknown>> = {
  id: string;
  kind: DraftKind;
  revision: number;
  value: T;
  updatedAt: string;
  submittedJobId?: string | null;
};
export type JobAnswer = {
  id: string;
  requirementId: string;
  targetId: string;
  questionText: string;
  text: string;
  status: "confirmed" | "unknown" | "skipped";
  revision: number;
};
export type JobAnswers = { revision: number; answers: JobAnswer[] };
export type CareerOperation = {
  id: string;
  kind: "questions" | "rewrite" | "integration";
  state:
    "processing" | "ready" | "unknown" | "failed" | "accepted" | "rejected";
  input: Record<string, unknown>;
  result: unknown;
  createdAt: string;
};
export const resumeId = "00000000-0000-4000-8000-000000000001";
export const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown, max = 20000) =>
  typeof v === "string" && v.length <= max && !v.includes("\0");
export function validateWorkspaceValue(
  kind: DraftKind,
  value: unknown,
): Record<string, unknown> {
  if (
    !object(value) ||
    new TextEncoder().encode(JSON.stringify(value)).length > 900000
  )
    throw Error("invalidRequest");
  const allowed: Record<DraftKind, string[]> = {
    intake: ["text", "sourceUrl"],
    "import-review": [
      "draft",
      "selected",
      "targets",
      "ownerConfirmed",
      "profileId",
      "profileFingerprint",
    ],
    "job-review": ["review", "basisRevision"],
    "tailor-review": ["decisions", "operationId"],
    "job-answer": [
      "entries",
      "focused",
      "integrationSelection",
      "integrationOperationId",
    ],
    "translation-review": ["values", "confirmed", "step", "proposalId"],
    resume: ["route"],
  };
  if (Object.keys(value).some((k) => !allowed[kind].includes(k)))
    throw Error("invalidRequest");
  if (
    kind === "intake" &&
    (!string(value.text, 200000) || !string(value.sourceUrl, 4096))
  )
    throw Error("invalidRequest");
  if (
    kind === "resume" &&
    (!string(value.route, 512) ||
      !/^#\/(profile|jobs)(?:\/|$)/.test(String(value.route)))
  )
    throw Error("invalidRequest");
  if (
    kind === "import-review" &&
    value.draft !== undefined &&
    !isBaseDraft(value.draft)
  )
    throw Error("invalidRequest");
  if (
    kind === "import-review" &&
    value.selected !== undefined &&
    (!Array.isArray(value.selected) ||
      value.selected.length > 250 ||
      !value.selected.every((v) => string(v, 256)))
  )
    throw Error("invalidRequest");
  if (
    kind === "import-review" &&
    value.targets !== undefined &&
    (!object(value.targets) ||
      Object.entries(value.targets).some(
        ([k, v]) => !string(k, 128) || !string(v, 128),
      ))
  )
    throw Error("invalidRequest");
  if (
    kind === "import-review" &&
    value.ownerConfirmed !== undefined &&
    typeof value.ownerConfirmed !== "boolean"
  )
    throw Error("invalidRequest");
  if (
    kind === "job-review" &&
    value.review !== null &&
    value.review !== undefined &&
    (!object(value.review) ||
      value.review.schemaVersion !== "vacancy-extraction/3" ||
      !object(value.review.overview) ||
      !Array.isArray(value.review.requirements))
  )
    throw Error("invalidRequest");
  if (
    kind === "tailor-review" &&
    (!object(value.decisions) ||
      !string(value.operationId, 128) ||
      Object.values(value.decisions).some(
        (v) =>
          !object(v) ||
          Object.keys(v).some((k) => !["accept", "text"].includes(k)) ||
          typeof v.accept !== "boolean" ||
          (v.text !== undefined && !string(v.text)),
      ))
  )
    throw Error("invalidRequest");
  if (
    kind === "job-answer" &&
    (!object(value.entries) ||
      Object.values(value.entries).some(
        (v) =>
          !object(v) ||
          Object.keys(v).some(
            (k) =>
              !["requirementId", "targetId", "questionText", "text", "question", "operationId", "suggestionId"].includes(
                k,
              ),
          ) ||
          !["requirementId", "targetId", "questionText", "text"].every((k) =>
            string(v[k], 6000),
          ) ||
          (v.question !== undefined && !string(v.question, 2000)) ||
          (v.operationId !== undefined && !isUuid(v.operationId)) ||
          (v.suggestionId !== undefined && (!string(v.suggestionId,256) || !String(v.suggestionId).trim())),
      ))
  )
    throw Error("invalidRequest");
  if (
    kind === "job-answer" &&
    value.integrationOperationId !== undefined &&
    !(
      value.integrationOperationId === "" ||
      isUuid(value.integrationOperationId)
    )
  )
    throw Error("invalidRequest");
  if (
    kind === "job-answer" &&
    value.integrationSelection !== undefined &&
    (!object(value.integrationSelection) ||
      Object.keys(value.integrationSelection).some(
        (k) =>
          ![
            "answerIds",
            "targetId",
            "snapshotId",
            "revision",
            "answersRevision",
          ].includes(k),
      ) ||
      !Array.isArray(value.integrationSelection.answerIds) ||
      !value.integrationSelection.answerIds.every(isUuid) ||
      !string(value.integrationSelection.targetId, 128))
  )
    throw Error("invalidRequest");
  if (
    kind === "translation-review" &&
    (!object(value.values) ||
      Object.values(value.values).some((v) => !string(v)) ||
      !Array.isArray(value.confirmed) ||
      !value.confirmed.every((v) => string(v, 256)) ||
      !Number.isSafeInteger(value.step) ||
      Number(value.step) < 0 ||
      !isUuid(value.proposalId))
  )
    throw Error("invalidRequest");
  return value;
}
export function parseJobAnswer(value: unknown): Omit<JobAnswer, "revision"> {
  if (
    !object(value) ||
    Object.keys(value).sort().join(",") !==
      "id,questionText,requirementId,status,targetId,text" ||
    !isUuid(value.id) ||
    !["confirmed", "unknown", "skipped"].includes(String(value.status)) ||
    !["questionText", "targetId", "requirementId"].every(
      (k) => string(value[k], 6000) && String(value[k]).trim(),
    ) ||
    !string(value.text, 6000) ||
    (value.status === "confirmed" && !String(value.text).trim())
  )
    throw Error("invalidRequest");
  return value as unknown as Omit<JobAnswer, "revision">;
}
/** A confirmed job answer is copied only for a pinned generation or explicit profile integration. */
export function withJobAnswers(
  draft: BaseDraft,
  jobId: string,
  answers: JobAnswer[],
): BaseDraft {
  const next = clone(draft);
  for (const a of answers.filter((a) => a.status === "confirmed")) {
    if (
      !next.roles.some((r) => r.id === a.targetId) &&
      !next.optionalSections
        .flatMap((s) => s.entries)
        .some((e) => e.id === a.targetId)
    )
      continue;
    const id = `job_${a.id}`,
      sourceId = `job_source_${a.id}`;
    const answer: Answer = {
      id,
      targetId: a.targetId,
      question: "context",
      questionText: a.questionText,
      text: a.text,
      status: "confirmed",
      sourceId,
      origin: { jobId, answerId: a.id, answerRevision: a.revision },
    };
    next.answers = next.answers.filter((v) => v.id !== id);
    next.answers.push(answer);
    next.sources = next.sources.filter((v) => v.id !== sourceId);
    next.sources.push({
      id: sourceId,
      kind: "answer",
      label: "Confirmed job answer",
      text: a.text,
      locator: `job:${jobId}:answer:${a.id}:${a.revision}`,
    });
  }
  return next;
}

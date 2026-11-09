import { z } from "zod";
import {
  MatchScoreSchema, ProposalSchema, SteeringSchema, TailorLanguageSchema, TailorQuestionSchema, TailorRunSchema, ToneSchema,
  type Answer, type MatchScore, type Proposal, type Steering, type TailorQuestion, type TailorRun, type TailorSection, type Tone,
} from "@resumora/shared";
import { apiFetch } from "../lib/api.ts";

const run = (id: string) => `/v1/tailor-runs/${encodeURIComponent(id)}`;

export type AcceptBody = {
  decisions: { itemId: string; keep: boolean }[];
  inferred: { itemId: string; keep: boolean }[];
  flags: { questionId: string; confirmed: boolean }[];
  /** Experience: the role being accepted (the run's current role). */
  roleId?: string;
};

/** Experience steps name the run's current role; other sections send none. */
const roleBody = (roleId?: string) => (roleId ? { roleId } : {});

export function startTailoring(jobId: string, steering: Steering): Promise<{ run: TailorRun }> {
  return apiFetch(`/v1/jobs/${encodeURIComponent(jobId)}/tailor`, {
    method: "POST", json: steering,
    schema: z.object({ run: TailorRunSchema, tailoredCvId: z.string(), language: TailorLanguageSchema }),
  });
}

export function getRun(id: string): Promise<TailorRun> {
  return apiFetch(run(id), { schema: TailorRunSchema });
}

export async function askQuestions(id: string, section: TailorSection, roleId?: string): Promise<TailorQuestion[]> {
  const body = await apiFetch(`${run(id)}/sections/${section}/questions`, {
    method: "POST", json: roleBody(roleId), schema: z.object({ questions: z.array(TailorQuestionSchema) }),
  });
  return body.questions;
}

export async function sendAnswers(id: string, answers: Answer[]): Promise<void> {
  await apiFetch(`${run(id)}/answers`, { method: "POST", json: { answers }, schema: z.object({ ok: z.literal(true) }) });
}

/** `removed`: proposals the API left out because the CV, notes and answers don't back them up. */
export function runSection(id: string, section: TailorSection, roleId?: string): Promise<{ proposals: Proposal[]; questions: TailorQuestion[]; removed?: number }> {
  return apiFetch(`${run(id)}/sections/${section}/run`, {
    method: "POST", json: roleBody(roleId),
    schema: z.object({ proposals: z.array(ProposalSchema), questions: z.array(TailorQuestionSchema), removed: z.number().int().min(0).default(0) }),
  });
}

export function acceptSection(id: string, section: TailorSection, body: AcceptBody): Promise<{ run: TailorRun; score: MatchScore }> {
  return apiFetch(`${run(id)}/sections/${section}/accept`, {
    method: "POST", json: body, schema: z.object({ run: TailorRunSchema, score: MatchScoreSchema }),
  });
}

/** Score 1 (base) and the newest Score 2 (tailored) for the job. */
export function getScores(jobId: string): Promise<{ base: MatchScore | null; tailored: MatchScore | null }> {
  return apiFetch(`/v1/jobs/${encodeURIComponent(jobId)}/score`, {
    schema: z.object({ base: MatchScoreSchema.nullable(), tailored: MatchScoreSchema.nullable() }),
  });
}

/** One of the person's own bullets in each tone, for the tone cards; examples is null when the CV has no bullet. */
export function getToneExamples(jobId: string): Promise<{ bullet: string | null; examples: Record<Tone, string> | null }> {
  return apiFetch(`/v1/jobs/${encodeURIComponent(jobId)}/tone-examples`, {
    method: "POST", json: {},
    schema: z.object({ bullet: z.string().nullable(), examples: z.record(ToneSchema, z.string()).nullable() }),
  });
}

/** Going back (BackA): new answers for a finished role; its proposals come back for review. */
export function redoRole(id: string, roleId: string, answers: Answer[]): Promise<{ proposals: Proposal[]; removed?: number }> {
  return apiFetch(`${run(id)}/roles/${encodeURIComponent(roleId)}/redo`, {
    method: "POST", json: { answers }, schema: z.object({ proposals: z.array(ProposalSchema), removed: z.number().int().min(0).default(0) }),
  });
}

/** Accepts a redone role; the run stays on its current step. */
export function acceptRole(id: string, roleId: string, body: AcceptBody): Promise<{ run: TailorRun; score: MatchScore }> {
  return apiFetch(`${run(id)}/roles/${encodeURIComponent(roleId)}/accept`, {
    method: "POST", json: body, schema: z.object({ run: TailorRunSchema, score: MatchScoreSchema }),
  });
}

/** New steering redoes every step with the stored answers, in a new run. */
export function changeSteering(id: string, steering: Steering): Promise<{ run: TailorRun }> {
  return apiFetch(`${run(id)}/steering`, { method: "POST", json: steering, schema: z.object({ run: TailorRunSchema }) });
}

/** The run's stored steering, to start the Tone and questions screens from it. */
export async function getSteering(id: string): Promise<Steering> {
  return (await apiFetch(`${run(id)}/steering`, { schema: z.object({ steering: SteeringSchema }) })).steering;
}

import { z } from "zod";
import {
  MatchScoreSchema, SteeringSchema, TailorLanguageSchema, TailorQuestionSchema, TailorRunSchema, ToneSchema,
  type Answer, type MatchScore, type Steering, type TailorLanguage, type TailorQuestion, type TailorRun, type TailorSection, type Tone,
} from "@resumora/shared";
import { apiFetch } from "../lib/api.ts";

const run = (id: string) => `/v1/tailor-runs/${encodeURIComponent(id)}`;

/** A role step names its role; other sections send none. */
const roleBody = (roleId?: string) => (roleId ? { roleId } : {});

/** `language`: the one picked from the bar's menu; without it the person's default decides. */
export function startTailoring(jobId: string, steering: Steering, language?: TailorLanguage): Promise<{ run: TailorRun; language: TailorLanguage; restarted?: true }> {
  return apiFetch(`/v1/jobs/${encodeURIComponent(jobId)}/tailor`, {
    method: "POST", json: language ? { ...steering, language } : steering,
    // `restarted`: the job was tailored from a CV that has since been replaced, so it starts again from the current one.
    schema: z.object({ run: TailorRunSchema, tailoredCvId: z.string(), language: TailorLanguageSchema, restarted: z.literal(true).optional() }),
  });
}

export function getRun(id: string): Promise<TailorRun> {
  return apiFetch(run(id), { schema: TailorRunSchema });
}

export async function sendAnswers(id: string, answers: Answer[]): Promise<void> {
  await apiFetch(`${run(id)}/answers`, { method: "POST", json: { answers }, schema: z.object({ ok: z.literal(true) }) });
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

/** New steering redoes every step with the stored answers, in a new run. */
export function changeSteering(id: string, steering: Steering): Promise<{ run: TailorRun }> {
  return apiFetch(`${run(id)}/steering`, { method: "POST", json: steering, schema: z.object({ run: TailorRunSchema }) });
}

/** The run's stored steering, to start the Tone and questions screens from it. */
export async function getSteering(id: string): Promise<Steering> {
  return (await apiFetch(`${run(id)}/steering`, { schema: z.object({ steering: SteeringSchema }) })).steering;
}

/** Every question of the tailoring in one call: one per gap, with the roles whose lines hint at it. Asked once per run. */
export async function askGaps(id: string): Promise<TailorQuestion[]> {
  const body = await apiFetch(`${run(id)}/gap-questions`, { method: "POST", json: {}, schema: z.object({ questions: z.array(TailorQuestionSchema) }) });
  return body.questions;
}

/** Makes one step and writes it straight into the tailored CV: any step of the run, several at the same time. */
export function writeStep(id: string, section: TailorSection, roleId?: string): Promise<{ changed: number; removed: number }> {
  return apiFetch(`${run(id)}/steps/write`, {
    method: "POST", json: { section, ...roleBody(roleId) }, schema: z.object({ changed: z.number().int().min(0), removed: z.number().int().min(0) }),
  });
}

/** Ends a run whose steps were written with `writeStep`: the tailored CV is scored once. */
export function finishRun(id: string): Promise<{ run: TailorRun; score: MatchScore }> {
  return apiFetch(`${run(id)}/finish`, { method: "POST", json: {}, schema: z.object({ run: TailorRunSchema, score: MatchScoreSchema }) });
}

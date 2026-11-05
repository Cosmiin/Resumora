import { z } from "zod";
import type { Experience } from "./cv.ts";
import { buildRoleResult, EnrichParseError, type ModelBullet, type RoleResult } from "./enrich.ts";

export const BRAIN_DUMP_QUESTION = "What did a normal week here look like?";
export const MAX_PENDING = 5;

export function mergeGrades(
  role: Experience,
  stored: RoleResult | null,
  graded: ModelBullet[],
  fingerprintValue: string,
): RoleResult {
  const bullets = role.bullets.map(({ id }): ModelBullet => {
    const fresh = graded.find((b) => b.id === id);
    if (fresh) return fresh;
    const old = stored?.bullets.find((b) => b.id === id);
    if (!old) throw new EnrichParseError(`Missing grades for bullet id: ${id}`);
    return {
      id,
      meaningful: old.issue !== "example",
      contribution: old.contribution,
      clarity: old.clarity,
      specificity: old.specificity,
      impact: old.impact,
      issue: old.issue,
      duplicateOf: null,
      tip: old.tip,
      question: old.question,
      options: stored?.questions.find((q) => q.bulletId === id)?.options ?? [],
    };
  });
  return buildRoleResult(role, { bullets, nextStepId: stored?.nextStep?.bulletId ?? null }, fingerprintValue);
}

export const ImproveAnswerSchema = z.union([
  z.object({ needsDetail: z.literal(true) }).strict(),
  z.object({
    proposal: z.object({ bulletId: z.string(), text: z.string() }),
    bulletBefore: z.number().int(),
    bulletAfter: z.number().int(),
    roleBefore: z.number().int().nullable(),
    roleAfter: z.number().int(),
  }).strict(),
]);
export type ImproveAnswer = z.infer<typeof ImproveAnswerSchema>;

export const BrainDumpAnswerSchema = z.object({
  proposals: z.array(z.object({ id: z.string(), text: z.string(), score: z.number().int() })).max(4),
  roleBefore: z.number().int().nullable(),
  roleAfterAll: z.number().int().nullable(),
}).strict();
export type BrainDumpAnswer = z.infer<typeof BrainDumpAnswerSchema>;

export const RoleFactsAnswerSchema = z.object({
  facts: z.array(z.string()).max(8),
  fromNotes: z.string(),
}).strict();
export type RoleFactsAnswer = z.infer<typeof RoleFactsAnswerSchema>;

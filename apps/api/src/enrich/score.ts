import {
  EnrichParseError,
  ModelScoreSchema,
  SCORE_POLICY,
  buildRoleResult,
  fingerprint,
  type Experience,
  type Locale,
  type ModelBullet,
  type RoleResult,
} from "@resumora/shared";
import { AiInputRejectedError, AiOutputTooLongError, AiUnavailableError, callModel, type ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import { scoreSystemPrompt, scoreUserMessage } from "./prompts.ts";
import type { InsightsRepo } from "./repo.ts";

export type ScoreDeps = { cv: CvRepo; insights: InsightsRepo; model: ModelDeps; userId: string };

export function aiError(err: unknown): never {
  if (err instanceof AiUnavailableError || err instanceof AiInputRejectedError) throw new ApiError(503, "ai_unavailable", "The AI service is unavailable right now. Try again soon.");
  if (err instanceof EnrichParseError || err instanceof AiOutputTooLongError) throw new ApiError(502, "ai_bad_answer", "The AI gave an answer we couldn't use. Try again.");
  throw err;
}

export async function gradeBullets(deps: ScoreDeps, role: Experience, locale: Locale, ids: readonly string[]): Promise<ModelBullet[]> {
  try {
    const answer = await callModel(deps.model, {
      userId: deps.userId,
      task: "enrich_score",
      schema: ModelScoreSchema,
      system: scoreSystemPrompt(locale),
      user: scoreUserMessage(role, ids),
      maxOutputTokens: 600 + 180 * ids.length,
    });
    const actual = new Set(answer.bullets.map((b) => b.id));
    if (answer.bullets.length !== ids.length || actual.size !== ids.length || !ids.every((id) => actual.has(id))) {
      throw new EnrichParseError("Model answer must contain exactly the requested bullet ids");
    }
    return answer.bullets;
  } catch (err) {
    aiError(err);
  }
}

const notSaved = () => new ApiError(409, "not_saved", "Your latest changes aren't saved yet. Try again in a moment.");

/**
 * Scores one role of the saved CV. A cached result for the same fingerprint and policy is returned
 * without another model call; otherwise the model grades the bullets and the app computes the numbers.
 * Role questions already answered in the role notes are omitted.
 * Also removes cached rows for roles that are no longer in the saved CV.
 */
export async function scoreRole(
  deps: ScoreDeps,
  input: { roleId: string; fingerprint: string },
): Promise<RoleResult> {
  const { content } = await deps.cv.get();
  const present = new Set(content.experience.map((r) => r.id));
  const stale = (await deps.insights.list()).filter((r) => !present.has(r.roleId)).map((r) => r.roleId);
  await deps.insights.remove(stale);

  const role = content.experience.find((r) => r.id === input.roleId);
  if (!role || fingerprint(role, content.locale) !== input.fingerprint) throw notSaved();

  const cached = await deps.insights.get(role.id);
  let result: RoleResult;
  if (cached && cached.fingerprint === input.fingerprint && cached.policy === SCORE_POLICY) {
    result = cached;
  } else {
    const pending = (await deps.insights.pending(role.id)).find((entry) => entry.fingerprint === input.fingerprint && entry.result.policy === SCORE_POLICY);
    if (pending) {
      result = pending.result;
    } else {
      try {
        const answer = await callModel(deps.model, {
          userId: deps.userId,
          task: "enrich_score",
          schema: ModelScoreSchema,
          system: scoreSystemPrompt(content.locale),
          user: scoreUserMessage(role),
          maxOutputTokens: Math.min(4000, 600 + 180 * role.bullets.length),
        });
        result = buildRoleResult(role, answer, input.fingerprint);
      } catch (err) {
        aiError(err);
      }
    }
    await deps.insights.put(role.id, result);
  }
  const answered = new Set(role.notes.map((note) => note.question.trim().toLowerCase()));
  return { ...result, roleQuestions: result.roleQuestions.filter((q) => !answered.has(q.text.trim().toLowerCase())) };
}

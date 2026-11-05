import {
  EnrichParseError,
  ModelScoreSchema,
  SCORE_POLICY,
  buildRoleResult,
  fingerprint,
  type RoleResult,
} from "@resumora/shared";
import { AiInputRejectedError, AiOutputTooLongError, AiUnavailableError, callModel, type ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import { scoreSystemPrompt, scoreUserMessage } from "./prompts.ts";
import type { InsightsRepo } from "./repo.ts";

const notSaved = () => new ApiError(409, "not_saved", "Your latest changes aren't saved yet. Try again in a moment.");

/**
 * Scores one role of the saved CV. A cached result for the same fingerprint and policy is returned
 * as it is; otherwise the model grades the bullets and the app computes the numbers.
 * Also removes cached rows for roles that are no longer in the saved CV.
 */
export async function scoreRole(
  deps: { cv: CvRepo; insights: InsightsRepo; model: ModelDeps; userId: string },
  input: { roleId: string; fingerprint: string },
): Promise<RoleResult> {
  const { content } = await deps.cv.get();
  const present = new Set(content.experience.map((r) => r.id));
  const stale = (await deps.insights.list()).filter((r) => !present.has(r.roleId)).map((r) => r.roleId);
  await deps.insights.remove(stale);

  const role = content.experience.find((r) => r.id === input.roleId);
  if (!role || fingerprint(role, content.locale) !== input.fingerprint) throw notSaved();

  const cached = await deps.insights.get(role.id);
  if (cached && cached.fingerprint === input.fingerprint && cached.policy === SCORE_POLICY) return cached;

  // No bullets: nothing to grade. The null-score result is cheap to rebuild, so it is not stored.
  if (role.bullets.length === 0) return buildRoleResult(role, { bullets: [], nextStepId: null }, input.fingerprint);

  let result: RoleResult;
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
    if (err instanceof AiUnavailableError || err instanceof AiInputRejectedError) throw new ApiError(503, "ai_unavailable", "The AI service is unavailable right now. Try again soon.");
    if (err instanceof EnrichParseError || err instanceof AiOutputTooLongError) throw new ApiError(502, "ai_bad_answer", "The AI gave an answer we couldn't use. Try again.");
    throw err;
  }
  await deps.insights.put(role.id, result);
  return result;
}

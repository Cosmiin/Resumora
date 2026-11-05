import { fingerprint, mergeGrades, repeatKey, type ImproveAnswer } from "@resumora/shared";
import { z } from "zod";
import { callModel } from "../ai/call-model.ts";
import { ApiError } from "../errors.ts";
import { improveBulletSystemPrompt, improveBulletUserMessage } from "./focus-prompts.ts";
import { checkProposal, squash } from "./rewrite.ts";
import { aiError, gradeBullets, scoreRole, type ScoreDeps } from "./score.ts";

const ImproveSchema = z.object({ text: z.string().nullable() });

export async function improveBullet(
  deps: ScoreDeps,
  input: { roleId: string; bulletId: string; fingerprint: string },
): Promise<ImproveAnswer> {
  const { content } = await deps.cv.get();
  const role = content.experience.find((r) => r.id === input.roleId);
  if (!role || fingerprint(role, content.locale) !== input.fingerprint) {
    throw new ApiError(409, "not_saved", "Your latest changes aren't saved yet. Try again in a moment.");
  }
  if (!role.bullets.some((b) => b.id === input.bulletId)) {
    throw new ApiError(404, "bullet_not_found", "This bullet is no longer in the role.");
  }

  await deps.cv.snapshot("ai");

  try {
    const before = await scoreRole(deps, input);
    const answer = await callModel(deps.model, {
      userId: deps.userId,
      task: "enrich_improve_bullet",
      schema: ImproveSchema,
      system: improveBulletSystemPrompt(content.locale),
      user: improveBulletUserMessage(role, input.bulletId),
      maxOutputTokens: 600,
    });
    if (answer.text === null) return { needsDetail: true };
    const text = squash(answer.text);
    if (checkProposal(role, input.bulletId, text) !== "ok" ||
      role.bullets.some((b) => b.id !== input.bulletId && repeatKey(b.text) === repeatKey(text))) {
      return { needsDetail: true };
    }

    const swapped = { ...role, bullets: role.bullets.map((b) => b.id === input.bulletId ? { ...b, text } : b) };
    // Grade the proposal after every other bullet so paraphrases can be marked as duplicates.
    const gradingRole = { ...swapped, bullets: [
      ...swapped.bullets.filter((b) => b.id !== input.bulletId),
      swapped.bullets.find((b) => b.id === input.bulletId)!,
    ] };
    const graded = await gradeBullets(deps, gradingRole, content.locale, [input.bulletId]);
    if (graded[0]!.duplicateOf !== null || graded[0]!.meaningful === false) return { needsDetail: true };
    const predicted = mergeGrades(swapped, before, graded, fingerprint(swapped, content.locale));
    const bulletBefore = before.bullets.find((b) => b.id === input.bulletId)!.score;
    const after = predicted.bullets.find((b) => b.id === input.bulletId)!.score;
    if (after <= bulletBefore) return { needsDetail: true };

    const cached = !before.bullets.some((b) => b.id !== input.bulletId && b.issue === "duplicate");
    if (cached) {
      await deps.insights.putPending(role.id, predicted);
    }
    return {
      proposal: { bulletId: input.bulletId, text },
      bulletBefore,
      bulletAfter: after,
      roleBefore: before.score,
      roleAfter: predicted.score!,
      cached,
    };
  } catch (err) {
    aiError(err);
  }
}

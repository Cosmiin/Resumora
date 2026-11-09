import { z } from "zod";
import { AnswerSchema, NoteSchema, newId, type Answer, type JobExtraction, type Proposal, type TailorRun } from "@resumora/shared";
import type { ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError, type LogFn } from "../errors.ts";
import { MAX_ROLE_QUESTIONS } from "./questions.ts";
import type { TailorRepo } from "./repo.ts";
import { passProposals } from "./section-pass.ts";

export const RedoBodySchema = z.object({ answers: z.array(AnswerSchema).max(MAX_ROLE_QUESTIONS) });
const NOTE_VIA = { option: "pick", typed: "type", voice: "voice" } as const;

/** A role the run has already accepted: before the current role, or Experience is behind it. 409 otherwise. */
export function finishedRole(run: TailorRun, roleId: string): string {
  const order = run.roleOrder ?? [];
  const at = order.indexOf(roleId);
  const pastExperience = run.status === "done" || !run.currentSection
    || run.sections.indexOf(run.currentSection) > run.sections.indexOf("experience");
  const done = at >= 0 && (pastExperience || (run.currentSection === "experience" && at < order.indexOf(run.currentRoleId ?? "")));
  if (!done) throw new ApiError(409, "role_not_done", "This role isn't finished yet.");
  return roleId;
}

/**
 * Going back to a finished role: its answers (on the run) and its job notes (on the Base CV) are replaced,
 * and its proposals are made again for review. Other roles, later sections and the current step stay as they are.
 */
export async function redoRole(
  deps: { model: ModelDeps; tailor: TailorRepo; cv: CvRepo; now(): Date; log?: LogFn },
  input: { userId: string; run: TailorRun; job: JobExtraction; roleId: string; answers: Answer[] },
): Promise<{ proposals: Proposal[]; removed: number }> {
  const { run, roleId, answers } = input;
  // The role under review (its pass is done, not yet accepted) can be redone too: "← My answers" on its review.
  const underReview = run.status === "waiting_user" && run.currentSection === "experience" && run.currentRoleId === roleId;
  if (!underReview) finishedRole(run, roleId);
  const questions = new Map((run.questions ?? []).filter((q) => q.section === "experience" && q.roleId === roleId && q.kind !== "flag")
    .map((q) => [q.id, q]));
  if (answers.some((answer) => !questions.has(answer.questionId))) {
    throw new ApiError(400, "invalid_content", "That question isn't about this role.");
  }

  const { content, version } = await deps.cv.get();
  const role = content.experience.find((r) => r.id === roleId);
  if (!role) throw new ApiError(404, "role_not_found", "This role is no longer in your CV.");
  const redone = new Set(answers.map((answer) => questions.get(answer.questionId)!.text));
  role.notes = [
    ...role.notes.filter((note) => note.jobId !== run.jobId || !redone.has(note.question)),
    ...answers.flatMap((answer) => answer.via === "skip" || !answer.value?.trim() ? [] : [NoteSchema.parse({
      id: newId(), question: questions.get(answer.questionId)!.text, answer: answer.value.trim(), via: [NOTE_VIA[answer.via]],
      askedAt: deps.now().toISOString(), jobId: run.jobId,
    })]),
  ];
  if (!(await deps.cv.save(content, version)).ok) throw new ApiError(409, "version_conflict", "Your CV was saved somewhere else first.");

  const replaced = new Set(answers.map((answer) => answer.questionId));
  const withAnswers = await deps.tailor.updateRun(run.id, {
    answers: [...(run.answers ?? []).filter((answer) => !replaced.has(answer.questionId)), ...answers],
  });
  if (!withAnswers) throw new ApiError(404, "job_not_found", "This job was deleted.");
  const { proposals, items, removed } = await passProposals(deps, {
    userId: input.userId, run: withAnswers, job: input.job, cv: content, section: "experience", roleId,
  });
  await deps.tailor.updateRun(run.id, { proposals: [...(withAnswers.proposals ?? []).filter((p) => !items.has(p.itemId)), ...proposals] });
  return { proposals, removed };
}

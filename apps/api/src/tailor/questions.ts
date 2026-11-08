import { z } from "zod";
import {
  MAX_TEXT, NoteSchema, newId,
  type Answer, type CvContent, type Experience, type JobExtraction, type Note, type TailorQuestion as Question, type TailorRun, type TailorSection,
} from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import { questionSystemPrompt, questionUserMessage } from "./question-prompts.ts";
import type { TailorRepo } from "./repo.ts";
import { stripHeader } from "./strip-header.ts";

export const MAX_RUN_QUESTIONS = 8;

const ModelQuestionsSchema = z.object({
  questions: z.array(z.object({
    roleId: z.string().nullable(),
    text: z.string(),
    kind: z.enum(["options", "confirm_inferred"]),
    options: z.array(z.string()),
    reason: z.string(),
  })),
});
const NOTE_VIA: Record<Exclude<Answer["via"], "skip">, Note["via"][number]> = { option: "pick", typed: "type", voice: "voice" };
const same = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/** Current role first, then by the latest end or start date. */
export function newestRole(roles: Experience[]): Experience | undefined {
  return [...roles].sort((a, b) => Number(b.current) - Number(a.current)
    || (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate) || b.startDate.localeCompare(a.startDate))[0];
}

/** Everything already answered for this job: its job notes on the CV and this run's answers. */
function answeredForJob(cv: CvContent, run: TailorRun) {
  const notes = [...cv.experience, ...cv.volunteering].flatMap((role) => role.notes)
    .filter((note) => note.jobId === run.jobId).map(({ question, answer }) => ({ question, answer }));
  const asked = new Map((run.questions ?? []).filter((question) => question.kind !== "flag").map((question) => [question.id, question.text]));
  const answers = (run.answers ?? []).flatMap((answer) => answer.value && asked.has(answer.questionId)
    ? [{ question: asked.get(answer.questionId)!, answer: answer.value }] : []);
  return [...notes, ...answers];
}

/** New questions for one section, at most 8 per run in total, stored on the run. */
export async function askQuestions(
  deps: { model: ModelDeps; tailor: TailorRepo },
  input: { userId: string; run: TailorRun; job: JobExtraction; cv: CvContent; section: TailorSection },
): Promise<Question[]> {
  const asked = input.run.questions ?? [];
  // Flag questions from the section checks are not job questions and do not count toward the cap.
  const max = MAX_RUN_QUESTIONS - asked.filter((question) => question.kind !== "flag").length;
  if (max <= 0) return [];
  const score = await deps.tailor.getScore(input.run.jobId, "base");
  const gaps = (score?.labels ?? []).filter((label) => label.status !== "met" || label.inferred);
  const answered = answeredForJob(input.cv, input.run);
  let reply: z.infer<typeof ModelQuestionsSchema>;
  try {
    reply = await callModel(deps.model, {
      userId: input.userId, task: "tailor_questions", tier: "cheap", schema: ModelQuestionsSchema,
      system: questionSystemPrompt,
      user: questionUserMessage({ section: input.section, cv: stripHeader(input.cv).cv, job: input.job, gaps, answered, max }),
      maxOutputTokens: 4000,
    });
  } catch {
    throw new ApiError(502, "ai_failed", `Couldn't tailor ${input.section}. Try again.`);
  }

  const roleIds = new Set([...input.cv.experience, ...input.cv.volunteering].map((role) => role.id));
  const seen = new Set([...answered.map((item) => same(item.question)), ...asked.map((question) => same(question.text))]);
  const fresh: Question[] = [];
  for (const question of reply.questions) {
    const text = question.text.trim().slice(0, MAX_TEXT);
    if (!text || seen.has(same(text)) || fresh.length >= max) continue;
    seen.add(same(text));
    fresh.push({ ...question, text, id: newId(), section: input.section,
      roleId: question.roleId && roleIds.has(question.roleId) ? question.roleId : null });
  }
  if (fresh.length > 0) await deps.tailor.updateRun(input.run.id, { questions: [...asked, ...fresh] });
  return fresh;
}

/** Stores answers on the run and saves each new non-skip answer as a job note on its role (or the newest role). */
export async function saveAnswers(
  deps: { cv: CvRepo; tailor: TailorRepo; now(): Date },
  run: TailorRun,
  answers: Answer[],
): Promise<void> {
  const questions = new Map((run.questions ?? []).map((question) => [question.id, question]));
  if (answers.some((answer) => !questions.has(answer.questionId))) {
    throw new ApiError(400, "invalid_content", "That question isn't part of this run.");
  }
  const stored = new Map((run.answers ?? []).map((answer) => [answer.questionId, answer]));
  const content = (await deps.cv.get()).content;
  const roleIds = new Set([...content.experience, ...content.volunteering].map((role) => role.id));
  const fallback = newestRole(content.experience)?.id;
  const byRole = new Map<string, Note[]>();
  for (const answer of answers) {
    const before = stored.get(answer.questionId);
    if (answer.via === "skip" || !answer.value?.trim() || (before?.value === answer.value && before.via === answer.via)) continue;
    const question = questions.get(answer.questionId)!;
    // A flag answer is about the tailored wording, not a fact about the person: no note.
    if (question.kind === "flag") continue;
    const roleId = question.roleId && roleIds.has(question.roleId) ? question.roleId : fallback;
    if (!roleId) continue;
    const note = NoteSchema.parse({ id: newId(), question: question.text, answer: answer.value.trim(), via: [NOTE_VIA[answer.via]],
      askedAt: deps.now().toISOString(), jobId: run.jobId });
    byRole.set(roleId, [...(byRole.get(roleId) ?? []), note]);
  }
  for (const [roleId, notes] of byRole) await deps.cv.addJobNotes(roleId, notes);
  for (const answer of answers) stored.set(answer.questionId, answer);
  await deps.tailor.updateRun(run.id, { answers: [...stored.values()] });
}

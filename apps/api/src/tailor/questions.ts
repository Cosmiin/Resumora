import { z } from "zod";
import {
  MAX_TEXT, NoteSchema, newId,
  type Answer, type CvContent, type Experience, type JobExtraction, type Note, type TailorQuestion as Question, type TailorRun, type TailorSection,
} from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import { questionSystemPrompt, questionUserMessage } from "./question-prompts.ts";
import { currentRole } from "./section-pass.ts";
import type { TailorRepo } from "./repo.ts";
import { steeringText } from "./steering.ts";
import { stripHeader } from "./strip-header.ts";

/** Job questions per run outside Experience; Experience asks up to 5 per role and Skills up to 5. */
export const MAX_RUN_QUESTIONS = 8;
export const MAX_ROLE_QUESTIONS = 5;
export const MAX_SKILL_QUESTIONS = 5;

const ModelQuestionsSchema = z.object({
  questions: z.array(z.object({
    roleId: z.string().nullable(),
    bulletId: z.string().nullable(),
    /** Skills questions: the one skill asked about. */
    skill: z.string().nullable(),
    text: z.string(),
    kind: z.enum(["options", "confirm_inferred"]),
    options: z.array(z.string()),
    reason: z.string(),
    gap: z.string(),
  })),
});
const NOTE_VIA: Record<Exclude<Answer["via"], "skip">, Note["via"][number]> = { option: "pick", typed: "type", voice: "voice" };
const same = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/** Current role first, then by the latest end or start date. */
export function newestRole(roles: Experience[]): Experience | undefined {
  return [...roles].sort((a, b) => Number(b.current) - Number(a.current)
    || (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate) || b.startDate.localeCompare(a.startDate))[0];
}

/** Everything already answered for this job (or, with a role, for that role): its job notes on the CV and this run's answers. */
function answeredForJob(cv: CvContent, run: TailorRun, roleId: string | null) {
  const notes = [...cv.experience, ...cv.volunteering].filter((role) => !roleId || role.id === roleId).flatMap((role) => role.notes)
    .filter((note) => note.jobId === run.jobId).map(({ question, answer }) => ({ question, answer }));
  const asked = new Map((run.questions ?? []).filter((question) => question.kind !== "flag" && (!roleId || question.roleId === roleId))
    .map((question) => [question.id, question.text]));
  const answers = (run.answers ?? []).flatMap((answer) => answer.value && asked.has(answer.questionId)
    ? [{ question: asked.get(answer.questionId)!, answer: answer.value }] : []);
  return [...notes, ...answers];
}

/**
 * New questions for one section, stored on the run. Experience asks about the run's current role only
 * (up to 5 per role); the other sections share the run's cap of 8, Skills at most 5 of them.
 */
export async function askQuestions(
  deps: { model: ModelDeps; tailor: TailorRepo },
  input: { userId: string; run: TailorRun; job: JobExtraction; cv: CvContent; section: TailorSection; roleId?: string },
): Promise<Question[]> {
  const roleId = currentRole(input.run, input.section, input.roleId);
  const role = roleId ? input.cv.experience.find((r) => r.id === roleId) : undefined;
  // A CV without roles has nothing to ask in Experience.
  if (input.section === "experience" && !role) return [];
  const asked = input.run.questions ?? [];
  // Flag questions from the section checks are not job questions and do not count toward the caps.
  const jobQuestions = asked.filter((question) => question.kind !== "flag");
  const inRole = (question: Question) => question.section === "experience" && question.roleId === roleId;
  const runLeft = MAX_RUN_QUESTIONS - jobQuestions.filter((question) => question.section !== "experience").length;
  const max = role ? MAX_ROLE_QUESTIONS - jobQuestions.filter(inRole).length
    : input.section === "skills" ? Math.min(runLeft, MAX_SKILL_QUESTIONS - jobQuestions.filter((question) => question.section === "skills").length)
    : runLeft;
  if (max <= 0) return [];
  const score = await deps.tailor.getScore(input.run.jobId, "base");
  // A gap answered in this run is done; one asked but skipped (or left) may come back once, not again.
  const answers = new Map((input.run.answers ?? []).map((answer) => [answer.questionId, answer]));
  const byGap = new Map<string, { asks: Set<string>; answered: boolean }>();
  for (const question of asked) {
    if (!question.gap) continue;
    const entry = byGap.get(question.gap) ?? { asks: new Set<string>(), answered: false };
    entry.asks.add(question.section);
    const answer = answers.get(question.id);
    if (answer && answer.via !== "skip" && answer.value?.trim()) entry.answered = true;
    byGap.set(question.gap, entry);
  }
  // In Experience a gap may be asked once in each role; elsewhere the run-wide rule above applies.
  const open = role ? (ref: string) => !asked.some((question) => inRole(question) && question.gap === ref)
    : (ref: string) => { const entry = byGap.get(ref); return !entry || (!entry.answered && entry.asks.size < 2); };
  const gaps = (score?.labels ?? []).filter((label) => (label.status !== "met" || label.inferred) && open(label.ref));
  if (score && gaps.length === 0) return [];
  const gapRefs = new Set(gaps.map((label) => label.ref));
  const answered = answeredForJob(input.cv, input.run, roleId);
  const cv = stripHeader(input.cv).cv;
  const stored = input.run.tailoredCvId ? await deps.tailor.getSteering(input.run.tailoredCvId) : null;
  const steering = steeringText(stored?.steering ?? {}, cv);
  let reply: z.infer<typeof ModelQuestionsSchema>;
  try {
    reply = await callModel(deps.model, {
      userId: input.userId, task: "tailor_questions", tier: "cheap", schema: ModelQuestionsSchema,
      system: questionSystemPrompt,
      // Experience: the role to ask about, the other roles as read-only context.
      user: questionUserMessage({
        section: input.section, job: input.job, gaps, answered, max, steering,
        ...(role ? { role: cv.experience.find((r) => r.id === role.id), cv: { ...cv, experience: cv.experience.filter((r) => r.id !== role.id) } } : { cv }),
      }),
      maxOutputTokens: 4000,
    });
  } catch {
    throw new ApiError(502, "ai_failed", `Couldn't tailor ${input.section}. Try again.`);
  }

  const roleIds = new Set([...input.cv.experience, ...input.cv.volunteering].map((role) => role.id));
  // A question that fits two roles is asked once in each, so only this role's questions count as asked.
  const seen = new Set([...answered.map((item) => same(item.question)),
    ...asked.filter((question) => !role || inRole(question)).map((question) => same(question.text))]);
  const fresh: Question[] = [];
  const skills = input.section === "skills";
  for (const { roleId: named, bulletId, skill, ...question } of reply.questions) {
    const text = question.text.trim().slice(0, MAX_TEXT);
    // Skills asks about skills only: a question tied to a role belongs to Experience.
    if (skills && named) continue;
    if (!text || seen.has(same(text)) || fresh.length >= max || (score && !gapRefs.has(question.gap))) continue;
    seen.add(same(text));
    const onBullet = role && bulletId && role.bullets.some((bullet) => bullet.id === bulletId) ? { bulletId } : {};
    const aboutSkill = skills ? { kind: "skill" as const, ...(skill?.trim() ? { skill: skill.trim().slice(0, MAX_TEXT) } : {}) } : {};
    fresh.push({ ...question, text, id: newId(), section: input.section, ...onBullet, ...aboutSkill,
      roleId: role ? role.id : named && roleIds.has(named) ? named : null });
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
    // A confirmed skill goes on every role it was used in ("Used SQL (Yes)"); other answers on their question's role.
    const usedIn = question.kind === "skill" ? (answer.roleIds ?? []).filter((id) => roleIds.has(id)) : [];
    const own = question.roleId && roleIds.has(question.roleId) ? question.roleId : fallback;
    const targets = usedIn.length > 0 ? [...new Set(usedIn)] : own ? [own] : [];
    const text = usedIn.length > 0 && question.skill ? `Used ${question.skill} (${answer.value.trim()})` : answer.value.trim();
    for (const roleId of targets) {
      const note = NoteSchema.parse({ id: newId(), question: question.text, answer: text, via: [NOTE_VIA[answer.via]],
        askedAt: deps.now().toISOString(), jobId: run.jobId });
      byRole.set(roleId, [...(byRole.get(roleId) ?? []), note]);
    }
  }
  for (const [roleId, notes] of byRole) await deps.cv.addJobNotes(roleId, notes);
  for (const answer of answers) stored.set(answer.questionId, answer);
  await deps.tailor.updateRun(run.id, { answers: [...stored.values()] });
}

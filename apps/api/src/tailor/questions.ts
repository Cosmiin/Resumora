import { z } from "zod";
import {
  findScored, isLightTailorSection, isOtherOption, isRoleSection, MAX_TEXT, NoteSchema, newId, notePeriod, scoredItems, stepItems,
  type Answer, type CvContent, type Experience, type JobExtraction, type Locale, type Note, type TailorQuestion as Question, type TailorRun, type TailorSection,
} from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { withWhy } from "./ad-line.ts";
import { ApiError } from "../errors.ts";
import { acrossSystemPrompt, acrossUserMessage, gapSystemPrompt, gapUserMessage, questionSystemPrompt, questionUserMessage } from "./question-prompts.ts";
import { acrossNote, currentRole } from "./section-pass.ts";
import type { TailorRepo } from "./repo.ts";
import { steeringText } from "./steering.ts";
import { stripHeader } from "./strip-header.ts";

/** Job questions per run outside role steps; roles ask up to 5 (2 outside focus), Skills up to 5. */
export const MAX_RUN_QUESTIONS = 8;
export const MAX_ROLE_QUESTIONS = 5;
export const NON_FOCUS_ROLE_QUESTIONS = 2;
export const MAX_SKILL_QUESTIONS = 5;
/** Questions asked once for every role, before the first role. */
export const MAX_ACROSS_QUESTIONS = 5;

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
  const notes = scoredItems(cv).map(({ item }) => item).filter((role) => !roleId || role.id === roleId).flatMap((role) => {
    const period = notePeriod(role);
    return role.notes.filter((note) => note.jobId === run.jobId)
      .map(({ question, answer }) => ({ question, answer, ...(period ? { period } : {}) }));
  });
  const asked = new Map((run.questions ?? []).filter((question) => question.kind !== "flag" && (!roleId || question.roleId === roleId))
    .map((question) => [question.id, question]));
  const answers = (run.answers ?? []).flatMap((answer) => {
    const question = asked.get(answer.questionId);
    if (!answer.value || !question) return [];
    const role = question.roleId ? findScored(cv, question.roleId)?.item : undefined;
    const period = role ? notePeriod(role) : "";
    return [{ question: question.text, answer: answer.value, ...(period ? { period } : {}) }];
  });
  return [...notes, ...answers];
}

/**
 * New questions for one section, stored on the run. Experience asks about the run's current role only
 * (up to 5 per role, 2 outside focus); other sections share the run's cap of 8, Skills at most 5 of them.
 */
export async function askQuestions(
  deps: { model: ModelDeps; tailor: TailorRepo },
  input: { userId: string; run: TailorRun; job: JobExtraction; cv: CvContent; section: TailorSection; roleId?: string; questionLanguage?: Locale },
): Promise<Question[]> {
  // The lighter sections' Final touches ask nothing: they are reworded, reordered and offered for hiding only.
  if (isLightTailorSection(input.section)) return [];
  const roleId = currentRole(input.run, input.section, input.roleId);
  const cv = stripHeader(input.cv).cv;
  const role = roleId ? stepItems(cv, input.section).find((r) => r.id === roleId) : undefined;
  // A CV without roles has nothing to ask in Experience.
  if (isRoleSection(input.section) && !role) return [];
  // A project is reworded only from what it already holds: tailoring asks nothing about it (no per-keyword fishing).
  if (role && findScored(cv, role.id)?.kind === "project") return [];
  const stored = input.run.tailoredCvId ? await deps.tailor.getSteering(input.run.tailoredCvId) : null;
  const roleIds = new Set(scoredItems(input.cv).map(({ item }) => item.id));
  const focusRoleIds = (stored?.steering.focusRoleIds ?? []).filter((id) => roleIds.has(id));
  const nonFocus = !!role && focusRoleIds.length > 0 && !focusRoleIds.includes(role.id);
  const roleMax = nonFocus ? NON_FOCUS_ROLE_QUESTIONS : MAX_ROLE_QUESTIONS;
  const asked = input.run.questions ?? [];
  // Flag questions from the section checks are not job questions and do not count toward the caps.
  const jobQuestions = asked.filter((question) => question.kind !== "flag");
  const inRole = (question: Question) => question.section === input.section && question.roleId === roleId;
  const runLeft = MAX_RUN_QUESTIONS - jobQuestions.filter((question) => !isRoleSection(question.section)).length;
  const max = role ? roleMax - jobQuestions.filter(inRole).length
    : input.section === "skills" ? Math.min(runLeft, MAX_SKILL_QUESTIONS - jobQuestions.filter((question) => question.section === "skills").length)
    : runLeft;
  if (max <= 0) return [];
  const score = await deps.tailor.getScore(input.run.jobId, "base");
  const latest = role && input.run.tailoredCvId
    ? await deps.tailor.getScore(input.run.jobId, "tailored", input.run.tailoredCvId) : null;
  const doc = latest && input.run.tailoredCvId ? await deps.tailor.readTailoredCv(input.run.tailoredCvId) : null;
  // Steering restarts reset the document's score to Base; old tailored scores stay in history.
  const tailoredScore = doc ? doc.score : latest;
  const sameRequirements = tailoredScore?.requirementTexts !== undefined
    && tailoredScore.requirementTexts.length === input.job.requirements.length
    && tailoredScore.requirementTexts.every((text, index) => text === input.job.requirements[index]!.text);
  const met = new Set((tailoredScore?.labels ?? [])
    .filter((label) => (label.kind === "keyword" || sameRequirements) && label.status === "met" && !label.inferred)
    .map((label) => label.ref.startsWith("k:") ? label.ref.toLowerCase() : label.ref));
  // A gap is asked once per run: once asked (in a role, in another section, or for every role at once), answered or
  // skipped, it is never asked again. The answer to an all-roles question is reused in every role.
  const askedGaps = new Set(jobQuestions.flatMap((question) => (question.gap ? [question.gap] : [])));
  const open = (ref: string) => !askedGaps.has(ref);
  const gaps = (score?.labels ?? []).filter((label) => (label.status !== "met" || label.inferred) && !met.has(label.ref.startsWith("k:") ? label.ref.toLowerCase() : label.ref) && open(label.ref));
  if (score && gaps.length === 0) return [];
  const gapRefs = new Set(gaps.map((label) => label.ref));
  const answered = answeredForJob(input.cv, input.run, roleId);
  const steering = steeringText({ ...stored?.steering, focusRoleIds }, cv, role?.id);
  let reply: z.infer<typeof ModelQuestionsSchema>;
  try {
    reply = await callModel(deps.model, {
      userId: input.userId, task: "tailor_questions", tier: "cheap", schema: ModelQuestionsSchema,
      system: questionSystemPrompt,
      user: questionUserMessage({
        section: input.section, cv, job: input.job, gaps, answered, max, steering, questionLanguage: input.questionLanguage,
        ...(role ? { role: { kind: findScored(cv, role.id)!.kind, ...role } } : {}),
      }),
      maxOutputTokens: 4000,
    });
  } catch {
    throw new ApiError(502, "ai_failed", `Couldn't tailor ${input.section}. Try again.`);
  }

  const seen = new Set([...answered.map((item) => same(item.question)), ...asked.map((question) => same(question.text))]);
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
    const options = question.options.filter((option) => !isOtherOption(option));
    fresh.push({ ...question, text, options, id: newId(), section: input.section, ...onBullet, ...aboutSkill,
      roleId: role ? role.id : named && roleIds.has(named) ? named : null });
  }
  if (fresh.length > 0) await deps.tailor.updateRun(input.run.id, { questions: [...asked, ...fresh] });
  return fresh;
}

/** Requirements a person may have met in several roles; education, languages and certificates are asked elsewhere. */
const ACROSS_CATEGORIES = new Set(["skill", "experience", "other"]);

/**
 * The questions answered once for all roles (a tool, skill or practice the CV misses), asked before the first role's own
 * questions, so no role asks them again: the person ticks the roles, names something similar, or says neither. Asked once per run, and only
 * when the CV has two roles or more.
 */
export async function askAcross(
  deps: { model: ModelDeps; tailor: TailorRepo },
  input: { userId: string; run: TailorRun; job: JobExtraction; cv: CvContent; questionLanguage?: Locale },
): Promise<Question[]> {
  const asked = input.run.questions ?? [];
  if (asked.some((question) => question.scope === "all")) return [];
  const cv = stripHeader(input.cv).cv;
  if (cv.experience.length < 2) return [];
  const score = await deps.tailor.getScore(input.run.jobId, "base");
  if (!score) return [];
  const answered = new Set(asked.filter((question) => question.kind !== "flag" && question.gap).map((question) => question.gap));
  const gaps = score.labels.filter((label) => (label.status !== "met" || label.inferred) && !answered.has(label.ref)
    && (label.kind === "keyword" || ACROSS_CATEGORIES.has(input.job.requirements[Number(label.ref.slice(1))]?.category ?? "")));
  if (gaps.length === 0) return [];
  const gapRefs = new Set(gaps.map((label) => label.ref));
  let reply: z.infer<typeof ModelQuestionsSchema>;
  try {
    reply = await callModel(deps.model, {
      userId: input.userId, task: "tailor_questions", tier: "cheap", schema: ModelQuestionsSchema,
      system: acrossSystemPrompt,
      user: acrossUserMessage({ cv, job: input.job, gaps, answered: answeredForJob(input.cv, input.run, null), max: MAX_ACROSS_QUESTIONS,
        questionLanguage: input.questionLanguage }),
      maxOutputTokens: 2000,
    });
  } catch {
    throw new ApiError(502, "ai_failed", "Couldn't tailor experience. Try again.");
  }
  const fresh: Question[] = [];
  const seen = new Set<string>();
  for (const question of reply.questions) {
    const text = question.text.trim().slice(0, MAX_TEXT);
    // The answer becomes "Used <skill>" on the roles ticked: a question without its short name is dropped.
    const skill = question.skill?.trim().slice(0, MAX_TEXT);
    if (!text || !skill || !gapRefs.has(question.gap) || seen.has(question.gap) || fresh.length >= MAX_ACROSS_QUESTIONS) continue;
    seen.add(question.gap);
    fresh.push({ id: newId(), section: "experience", roleId: null, text, kind: "skill", options: [], reason: question.reason, gap: question.gap,
      scope: "all", skill });
  }
  if (fresh.length > 0) await deps.tailor.updateRun(input.run.id, { questions: [...asked, ...fresh] });
  return fresh;
}

/** Every gap is asked on one screen, before anything is written. */
export const MAX_GAP_QUESTIONS = 12;
const ModelGapQuestionsSchema = z.object({
  questions: z.array(z.object({
    text: z.string(), skill: z.string(), reason: z.string(), gap: z.string(),
    /** The roles whose own lines hint at it, and the words that do. */
    roleIds: z.array(z.string()), hint: z.string().nullable(),
  })),
});

/**
 * One question for every thing the job wants and the CV does not show (or only hints at), all asked on one screen
 * before anything is written. Each is answered like an all-roles question (tick the roles, something similar, or
 * neither), so the answers are saved the same way and no later step asks again. A question may come with the roles
 * whose own lines hint at it and the words that do: kept only when those words really stand in that role.
 * Asked once per run: afterwards the stored questions come back.
 */
export async function askGaps(
  deps: { model: ModelDeps; tailor: TailorRepo },
  input: { userId: string; run: TailorRun; job: JobExtraction; cv: CvContent; questionLanguage?: Locale; adText?: string | null },
): Promise<Question[]> {
  const asked = input.run.questions ?? [];
  const stored = asked.filter((question) => question.scope === "all");
  // Questions stored before each said why it is asked get that now, on the way out.
  if (stored.length > 0) return stored.map((question) => (question.need ? question : withWhy(question, input.job, input.adText)));
  const cv = stripHeader(input.cv).cv;
  if (cv.experience.length === 0) return [];
  const score = await deps.tailor.getScore(input.run.jobId, "base");
  if (!score) return [];
  const answered = new Set(asked.filter((question) => question.kind !== "flag" && question.gap).map((question) => question.gap));
  const gaps = score.labels.filter((label) => (label.status !== "met" || label.inferred) && !answered.has(label.ref)
    && (label.kind === "keyword" || ACROSS_CATEGORIES.has(input.job.requirements[Number(label.ref.slice(1))]?.category ?? "")));
  if (gaps.length === 0) return [];
  const gapRefs = new Set(gaps.map((label) => label.ref));
  let reply: z.infer<typeof ModelGapQuestionsSchema>;
  try {
    reply = await callModel(deps.model, {
      userId: input.userId, task: "tailor_questions", tier: "cheap", schema: ModelGapQuestionsSchema,
      system: gapSystemPrompt,
      user: gapUserMessage({ cv, job: input.job, gaps, answered: answeredForJob(input.cv, input.run, null), max: MAX_GAP_QUESTIONS,
        questionLanguage: input.questionLanguage }),
      maxOutputTokens: 4000,
    });
  } catch {
    throw new ApiError(502, "ai_failed", "Couldn't tailor experience. Try again.");
  }
  const lines = new Map(cv.experience.map((role) => [role.id, [role.description, ...role.bullets.map((bullet) => bullet.text)]]));
  const fresh: Question[] = [];
  const seen = new Set<string>();
  for (const question of reply.questions) {
    const text = question.text.trim().slice(0, MAX_TEXT);
    const skill = question.skill.trim().slice(0, MAX_TEXT);
    if (!text || !skill || !gapRefs.has(question.gap) || seen.has(question.gap) || fresh.length >= MAX_GAP_QUESTIONS) continue;
    seen.add(question.gap);
    // A suggestion stands only on the role's own words: a hint that is not in a suggested role goes, with that role.
    const hint = question.hint?.trim().slice(0, MAX_TEXT) ?? "";
    const suggested = hint ? [...new Set(question.roleIds)].filter((id) => lines.get(id)?.some((line) => line.includes(hint))) : [];
    fresh.push(withWhy({ id: newId(), section: "experience", roleId: null, text, kind: "skill", options: [], reason: question.reason, gap: question.gap,
      scope: "all", skill, ...(suggested.length > 0 ? { suggestedRoleIds: suggested, hint } : {}) }, input.job, input.adText));
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
  const roleIds = new Set(scoredItems(content).map(({ item }) => item.id));
  const fallback = newestRole(content.experience)?.id;
  const noted = new Map(scoredItems(content).map(({ item }) => [item.id, item.notes]));
  const byRole = new Map<string, Note[]>();
  for (const answer of answers) {
    const before = stored.get(answer.questionId);
    if (answer.via === "skip" || !answer.value?.trim()) continue;
    const question = questions.get(answer.questionId)!;
    // An answer sent again as it was leaves no second note. An all-roles answer can keep its words and change the
    // roles ticked ("Yes" for one role, then "Yes" for two), so that one is compared role by role, below.
    if (before?.value === answer.value && before.via === answer.via && question.scope !== "all") continue;
    // A flag answer is about the tailored wording, not a fact about the person: no note.
    if (question.kind === "flag") continue;
    // A confirmed skill goes on every role it was used in ("Used SQL (Yes)"); other answers on their question's role.
    const usedIn = question.kind === "skill" ? (answer.roleIds ?? []).filter((id) => roleIds.has(id)) : [];
    const own = question.roleId && roleIds.has(question.roleId) ? question.roleId : fallback;
    // An all-roles question notes only the roles ticked: the tool itself, or the similar one named as itself, never as the tool asked.
    const across = question.scope === "all";
    if (across && (answer.use === "none" || usedIn.length === 0)) continue;
    const targets = usedIn.length > 0 ? [...new Set(usedIn)] : own ? [own] : [];
    const text = across
      ? acrossNote(question, answer) ?? ""
      : usedIn.length > 0 && question.skill ? `Used ${question.skill} (${answer.value.trim()})` : answer.value.trim();
    for (const roleId of targets) {
      // A role that already carries this note for this job (ticked before, or in an earlier run) gets no second one.
      if (across && noted.get(roleId)?.some((note) => note.jobId === run.jobId && note.question === question.text && note.answer === text)) continue;
      const note = NoteSchema.parse({ id: newId(), question: question.text, answer: text, via: [NOTE_VIA[answer.via]],
        askedAt: deps.now().toISOString(), jobId: run.jobId });
      byRole.set(roleId, [...(byRole.get(roleId) ?? []), note]);
    }
  }
  for (const [roleId, notes] of byRole) await deps.cv.addJobNotes(roleId, notes);
  for (const answer of answers) stored.set(answer.questionId, answer);
  await deps.tailor.updateRun(run.id, { answers: [...stored.values()] });
}

import { z } from "zod";
import {
  applyGuesses, CvContentSchema, findScored, isLightTailorSection, isRoleSection, MAX_ITEMS, MAX_LONG_TEXT, MAX_TEXT, NoteSchema, newId, scoredItems, stepOrder, withoutHidden,
  type CvContent, type Job, type MatchScore, type Note, type Proposal, type SectionKey, type TailorRun, type TailorSection,
} from "@resumora/shared";
import type { ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import { newestRole } from "./questions.ts";
import type { Review, TailorRepo } from "./repo.ts";
import { scoreMatch } from "./score.ts";
import { currentRole, lightList, sectionItems } from "./section-pass.ts";
import { jobNotFound } from "./start.ts";

/** `text`: a summary guess's edited wording (its item id is "summary#<n>"). */
const Choice = z.object({ itemId: z.string(), keep: z.boolean(), text: z.string().trim().min(1).max(MAX_TEXT).optional() });
export const AcceptBodySchema = z.object({
  decisions: z.array(Choice).max(500).default([]),
  inferred: z.array(Choice).max(500).default([]),
  flags: z.array(z.object({ questionId: z.string(), confirmed: z.boolean() })).max(100).default([]),
  /** Experience: the role being accepted (must be the run's current role). */
  roleId: z.string().optional(),
});
export type AcceptBody = z.infer<typeof AcceptBodySchema>;

/** Per-item review state, stored under the section in `tailored_cvs.review`. */
export type ItemReview = { kept: boolean; inferred: boolean; reviewed: boolean; text: string; reason?: string };

/** New skills share the item id "new-skill", so each is addressed by its text. */
export const reviewKey = (p: Pick<Proposal, "itemId" | "text">) => (p.itemId === "new-skill" ? `new-skill:${p.text}` : p.itemId);
/** The flag question the section pass wrote for a flagged proposal: by its key (older runs: by the quoted text). */
const flagQuestionFor = (run: TailorRun, section: TailorSection, p: Proposal) =>
  (run.questions ?? []).find((q) => q.kind === "flag" && q.section === section
    && (q.itemId ? q.itemId === `${reviewKey(p)}|${p.field}` : q.text.startsWith(`Please check: "${p.text}"`)));
export const LAYOUT_ITEMS = ["layout", "headline"];

function apply(cv: CvContent, p: Proposal, section: TailorSection): void {
  if (section === "achievements" || isLightTailorSection(section)) {
    const list = lightList(cv, section);
    // "Most relevant first": a new order of every item, each once; anything else is ignored.
    if (p.itemId === "order") {
      const ids = p.text.split(",").map((id) => id.trim());
      const byId = new Map(list.map((item) => [item.id, item]));
      if (ids.length === list.length && new Set(ids).size === ids.length && ids.every((id) => byId.has(id))) {
        list.splice(0, list.length, ...ids.map((id) => byId.get(id)!));
      }
      return;
    }
    // "Hide for this job?": hidden on this tailored CV only (the editor can show it again).
    if (p.itemId.startsWith("hide:")) {
      const item = list.find((i) => i.id === p.itemId.slice("hide:".length));
      if (item) item.hidden = true;
      return;
    }
    const line = list.flatMap((item) => item.bullets ?? []).find((l) => l.id === p.itemId);
    if (line) return void (line.text = p.text);
  }
  if (p.itemId === "layout") {
    const order = p.text.split(",") as SectionKey[];
    const current = new Set(cv.layout.order);
    if (order.length === current.size && order.every((key) => current.has(key))) cv.layout.order = order;
    return;
  }
  if (p.itemId === "headline") cv.basics.titles = [p.text, ...cv.basics.titles.slice(1)];
  else if (p.itemId === "summary") cv.basics.summary = p.text;
  else if (p.itemId === "new-skill") {
    // Section passes read the Base CV, so a re-tailor (or a retry) can propose a skill an earlier accept already added.
    const name = p.text.trim().toLowerCase();
    const known = [...cv.technicalSkills, ...cv.professionalSkills, ...cv.unclearSkills].some((s) => s.name.trim().toLowerCase() === name);
    if (!known && cv.technicalSkills.length < MAX_ITEMS) cv.technicalSkills.push({ id: newId(), name: p.text });
  }
  else {
    for (const { item: role } of scoredItems(cv)) {
      if (role.id === p.itemId) return void ((role as Record<string, unknown>)[p.field] = p.text);
      const bullet = role.bullets.find((b) => b.id === p.itemId);
      if (bullet) return void (bullet.text = p.text);
    }
    const item = [...cv.technicalSkills, ...cv.professionalSkills, ...cv.awards, ...cv.languages].find((i) => i.id === p.itemId);
    if (item) (item as Record<string, unknown>)[p.field] = p.text;
  }
}

/**
 * Accepts the current section: writes the kept proposals into the tailored CV, records the review,
 * saves Score 2, and moves the run on (done after `layout`, which also marks a saved job as tailored).
 */
export async function acceptSection(
  deps: { model: ModelDeps; tailor: TailorRepo; cv: CvRepo; jobs: JobRepo; now(): Date },
  input: { userId: string; run: TailorRun; job: Job; section: TailorSection; body: AcceptBody; redo?: boolean },
): Promise<{ run: TailorRun; score: MatchScore }> {
  const { run, section, body } = input;
  // A redo accepts a finished role (checked by the caller) and leaves the run where it is.
  if (!input.redo && (run.status === "done" || run.currentSection !== section)) {
    throw new ApiError(409, "section_not_current", "This section isn't the current step.");
  }
  const roleId = input.redo ? body.roleId ?? null : currentRole(run, section, body.roleId);
  if (!input.job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
  const doc = run.tailoredCvId ? await deps.tailor.getTailoredCv(run.tailoredCvId) : null;
  if (!doc) throw jobNotFound();

  const content = structuredClone(doc.content);
  if (input.redo && roleId) {
    // The redone proposals replace the role's earlier ones: start again from its Base wording.
    const baseRole = findScored((await deps.cv.get()).content, roleId)?.item;
    for (const list of [content.experience, content.projects, content.volunteering] as CvContent["experience"][]) {
      const at = list.findIndex((role) => role.id === roleId);
      if (baseRole && at >= 0) list[at] = structuredClone(baseRole);
    }
  }
  if (section === "achievements" || isLightTailorSection(section)) {
    // Each accept of a lighter section decides its order and hiding again: start from the Base order with nothing
    // hidden as in the Base CV, so "Keep the original" on a re-tailor restores both.
    const baseList = lightList((await deps.cv.get()).content, section);
    const at = new Map(baseList.map((item, i) => [item.id, i]));
    const list = lightList(content, section);
    list.sort((a, b) => (at.get(a.id) ?? at.size) - (at.get(b.id) ?? at.size));
    for (const item of list) {
      if (baseList[at.get(item.id) ?? -1]?.hidden) item.hidden = true;
      else delete item.hidden;
    }
  }
  const ids = new Set(section === "layout" ? LAYOUT_ITEMS : sectionItems(content, section, roleId).keys());
  const decisions = new Map(body.decisions.map((d) => [d.itemId, d.keep]));
  const inferred = new Map(body.inferred.map((d) => [d.itemId, d.keep]));
  const guessChoices = new Map(body.inferred.map((d) => [d.itemId, d.text === undefined ? { keep: d.keep } : { keep: d.keep, text: d.text }]));
  const flags = new Map(body.flags.map((f) => [f.questionId, f.confirmed]));
  const state: Record<string, ItemReview> = {};
  const notes: { roleId: string | null; note: Note }[] = [];
  for (const p of (run.proposals ?? []).filter((proposal) => ids.has(proposal.itemId))) {
    const key = reviewKey(p);
    let keep: boolean | undefined;
    if (p.flags.length > 0) {
      // A flagged item stays only when the user confirms it; unanswered means the Base wording.
      const question = flagQuestionFor(run, section, p);
      keep = question ? flags.get(question.id) : undefined;
      if (keep && question) {
        notes.push({ roleId: question.roleId, note: NoteSchema.parse({
          id: newId(), question: question.text.slice(0, MAX_TEXT), answer: p.text.slice(0, MAX_LONG_TEXT), via: ["pick"], askedAt: deps.now().toISOString(), jobId: run.jobId,
        }) });
      }
    } else {
      keep = p.inferred ? inferred.get(key) ?? decisions.get(key) : decisions.get(key);
    }
    let applied = p;
    if (p.guesses?.length && (keep ?? true)) {
      // Each summary guess is its own item: removed, edited, or left undecided (kept, unreviewed).
      const choices = p.guesses.map((_, i) => guessChoices.get(`${key}#${i}`));
      applied = { ...p, text: applyGuesses(p.text, p.guesses, choices) };
      p.guesses.forEach((guess, i) => {
        const choice = choices[i];
        state[`${key}#${i}`] = { kept: choice?.keep ?? true, inferred: true, reviewed: choice !== undefined,
          text: choice?.keep && choice.text !== undefined ? choice.text : guess.text, reason: guess.reason };
      });
    }
    // A guess keeps its reason, which the guided review shows.
    state[key] = { kept: keep ?? !p.flags.length, inferred: p.inferred, reviewed: keep !== undefined, text: applied.text,
      ...(p.inferred && p.reason ? { reason: p.reason } : {}) };
    if (keep ?? !p.flags.length) apply(content, applied, section);
  }
  const parsed = CvContentSchema.safeParse(content);
  if (!parsed.success) throw new ApiError(502, "ai_failed", `Couldn't tailor ${section}. Try again.`);

  // A role's accept replaces only that role's items; the other roles keep their review.
  const others = roleId ? Object.fromEntries(Object.entries((doc.review?.[section] ?? {}) as Record<string, ItemReview>)
    .filter(([key]) => !ids.has(key))) : {};
  const review: Review = { ...(doc.review ?? {}), [section]: { ...others, ...state } };
  const keptInferredTexts = Object.values(review).flatMap((items) => Object.values(items as Record<string, ItemReview>))
    .filter((item) => item.inferred && item.kept).map((item) => item.text);
  const score = await scoreMatch({ model: deps.model }, {
    // Items hidden for this job are not on the CV the recruiter sees, so they do not count.
    userId: input.userId, cv: withoutHidden(parsed.data), job: input.job.extracted, keptInferred: new Set(), keptInferredTexts,
  });
  if (await deps.tailor.saveTailoredCv(doc.id, doc.version, { content: parsed.data, review, score }) === "conflict") {
    throw new ApiError(409, "version_conflict", "This tailored CV was saved somewhere else first.");
  }
  await deps.tailor.saveScore(run.jobId, "tailored", doc.id, score);

  if (notes.length > 0) {
    const base = (await deps.cv.get()).content;
    const roleIds = new Set(scoredItems(base).map(({ item }) => item.id));
    const fallback = newestRole(base.experience)?.id;
    const byRole = new Map<string, Note[]>();
    for (const { roleId, note } of notes) {
      const target = roleId && roleIds.has(roleId) ? roleId : fallback;
      if (target) byRole.set(target, [...(byRole.get(target) ?? []), note]);
    }
    for (const [roleId, list] of byRole) await deps.cv.addJobNotes(roleId, list);
  }

  if (input.redo) return { run, score };
  // The step's next item in CV order, then the next section after its last item (a role step starts on its first item).
  const order = roleId ? stepOrder(run, parsed.data, section) : [];
  const nextRole = roleId ? order[order.indexOf(roleId) + 1] ?? null : null;
  const next = nextRole ? section : run.sections[run.sections.indexOf(section) + 1] ?? null;
  const currentRoleId = nextRole ?? (isRoleSection(next) ? stepOrder(run, parsed.data, next)[0] ?? null : null);
  const updated = await deps.tailor.updateRun(run.id, {
    currentSection: next, status: next ? "running" : "done", ...(roleId || isRoleSection(next) ? { currentRoleId } : {}),
  });
  if (!updated) throw jobNotFound();
  if (!next) await markTailored(deps.jobs, run.jobId);
  return { run: updated, score };
}

/** Moves a saved job to tailored; a concurrent job edit gets one retry. */
async function markTailored(jobs: JobRepo, jobId: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const job = await jobs.get(jobId);
    if (!job?.extracted || job.applicationStatus !== "saved") return;
    if (await jobs.patch(jobId, job.version, job.extracted, { applicationStatus: "tailored" }) !== "conflict") return;
  }
}

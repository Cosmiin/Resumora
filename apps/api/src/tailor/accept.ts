import { z } from "zod";
import {
  CvContentSchema, NoteSchema, newId,
  type CvContent, type Job, type MatchScore, type Note, type Proposal, type SectionKey, type TailorRun, type TailorSection,
} from "@resumora/shared";
import type { ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import { newestRole } from "./questions.ts";
import type { Review, TailorRepo } from "./repo.ts";
import { scoreMatch } from "./score.ts";
import { sectionItems } from "./section-pass.ts";
import { jobNotFound } from "./start.ts";

const Choice = z.object({ itemId: z.string(), keep: z.boolean() });
export const AcceptBodySchema = z.object({
  decisions: z.array(Choice).max(500).default([]),
  inferred: z.array(Choice).max(500).default([]),
  flags: z.array(z.object({ questionId: z.string(), confirmed: z.boolean() })).max(100).default([]),
});
export type AcceptBody = z.infer<typeof AcceptBodySchema>;

/** Per-item review state, stored under the section in `tailored_cvs.review`. */
export type ItemReview = { kept: boolean; inferred: boolean; reviewed: boolean; text: string };

/** New skills share the item id "new-skill", so each is addressed by its text. */
export const reviewKey = (p: Pick<Proposal, "itemId" | "text">) => (p.itemId === "new-skill" ? `new-skill:${p.text}` : p.itemId);
/** The flag question the section pass wrote for a flagged proposal quotes its text. */
const flagQuestionFor = (run: TailorRun, section: TailorSection, p: Proposal) =>
  (run.questions ?? []).find((q) => q.kind === "flag" && q.section === section && q.text.startsWith(`Please check: "${p.text}"`));
export const LAYOUT_ITEMS = ["layout", "headline"];

function apply(cv: CvContent, p: Proposal): void {
  if (p.itemId === "layout") {
    const order = p.text.split(",") as SectionKey[];
    const current = new Set(cv.layout.order);
    if (order.length === current.size && order.every((key) => current.has(key))) cv.layout.order = order;
    return;
  }
  if (p.itemId === "headline") cv.basics.titles = [p.text, ...cv.basics.titles.slice(1)];
  else if (p.itemId === "summary") cv.basics.summary = p.text;
  else if (p.itemId === "new-skill") cv.technicalSkills.push({ id: newId(), name: p.text });
  else {
    for (const role of cv.experience) {
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
  input: { userId: string; run: TailorRun; job: Job; section: TailorSection; body: AcceptBody },
): Promise<{ run: TailorRun; score: MatchScore }> {
  const { run, section, body } = input;
  if (run.status === "done" || run.currentSection !== section) {
    throw new ApiError(409, "section_not_current", "This section isn't the current step.");
  }
  if (!input.job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
  const doc = run.tailoredCvId ? await deps.tailor.getTailoredCv(run.tailoredCvId) : null;
  if (!doc) throw jobNotFound();

  const ids = new Set(section === "layout" ? LAYOUT_ITEMS : sectionItems(doc.content, section).keys());
  const decisions = new Map(body.decisions.map((d) => [d.itemId, d.keep]));
  const inferred = new Map(body.inferred.map((d) => [d.itemId, d.keep]));
  const flags = new Map(body.flags.map((f) => [f.questionId, f.confirmed]));
  const content = structuredClone(doc.content);
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
          id: newId(), question: question.text, answer: p.text, via: ["pick"], askedAt: deps.now().toISOString(), jobId: run.jobId,
        }) });
      }
    } else {
      keep = p.inferred ? inferred.get(key) ?? decisions.get(key) : decisions.get(key);
    }
    state[key] = { kept: keep ?? !p.flags.length, inferred: p.inferred, reviewed: keep !== undefined, text: p.text };
    if (keep ?? !p.flags.length) apply(content, p);
  }
  const parsed = CvContentSchema.safeParse(content);
  if (!parsed.success) throw new ApiError(502, "ai_failed", `Couldn't tailor ${section}. Try again.`);

  const review: Review = { ...(doc.review ?? {}), [section]: state };
  const keptInferredTexts = Object.values(review).flatMap((items) => Object.values(items as Record<string, ItemReview>))
    .filter((item) => item.inferred && item.kept).map((item) => item.text);
  const score = await scoreMatch({ model: deps.model }, {
    userId: input.userId, cv: parsed.data, job: input.job.extracted, keptInferred: new Set(), keptInferredTexts,
  });
  if (await deps.tailor.saveTailoredCv(doc.id, doc.version, { content: parsed.data, review, score }) === "conflict") {
    throw new ApiError(409, "version_conflict", "This tailored CV was saved somewhere else first.");
  }
  await deps.tailor.saveScore(run.jobId, "tailored", doc.id, score);

  if (notes.length > 0) {
    const base = (await deps.cv.get()).content;
    const roleIds = new Set([...base.experience, ...base.volunteering].map((role) => role.id));
    const fallback = newestRole(base.experience)?.id;
    const byRole = new Map<string, Note[]>();
    for (const { roleId, note } of notes) {
      const target = roleId && roleIds.has(roleId) ? roleId : fallback;
      if (target) byRole.set(target, [...(byRole.get(target) ?? []), note]);
    }
    for (const [roleId, list] of byRole) await deps.cv.addJobNotes(roleId, list);
  }

  const next = run.sections[run.sections.indexOf(section) + 1] ?? null;
  const updated = await deps.tailor.updateRun(run.id, { currentSection: next, status: next ? "running" : "done" });
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

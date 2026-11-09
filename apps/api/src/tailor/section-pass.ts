import { z } from "zod";
import {
  isLightTailorSection, isRoleSection, placeGuesses, scoredItems, stepItems, type CvContent, type LightTailorSection, type JobExtraction, type Proposal, type TailorQuestion, type TailorRun, type TailorSection,
} from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import { ApiError, type LogFn } from "../errors.ts";
import { checkProposal } from "./checks.ts";
import type { TailorRepo } from "./repo.ts";
import { sectionSystemPrompt, sectionUserMessage, verifySystemPrompt } from "./section-prompts.ts";
import { steeringText } from "./steering.ts";
import { stripHeader } from "./strip-header.ts";

type Item = { fields: Record<string, string>; roleId: string | null };
/**
 * Every proposal carries a reason: where the CV shows a guess or a new skill, null otherwise.
 * No `default`: strict structured output rejects it.
 */
const ModelProposalsSchema = z.object({
  proposals: z.array(z.object({
    itemId: z.string(), field: z.string(), text: z.string(), inferred: z.boolean(), reason: z.string().nullable(),
    guesses: z.array(z.object({ text: z.string(), reason: z.string() })).nullable(),
  })),
});
const VerifySchema = z.object({ results: z.array(z.object({ itemId: z.string(), claims: z.array(z.string()) })) });

/**
 * Experience and Projects & volunteering go item by item: each step names the run's current item,
 * any other is 409 role_not_current.
 */
export function currentRole(run: TailorRun, section: TailorSection, roleId: string | undefined): string | null {
  if (!isRoleSection(section) || !run.currentRoleId) return null;
  if (!roleId || roleId !== run.currentRoleId) throw new ApiError(409, "role_not_current", "This role isn't the current step.");
  return roleId;
}

/**
 * The items a section's proposals may point at, keyed by stable item id, with the fields that may change.
 * With an item, a role step (Experience, Projects & volunteering) has only that item's fields and bullets.
 */
export function sectionItems(cv: CvContent, section: TailorSection, roleId: string | null = null): Map<string, Item> {
  const items = new Map<string, Item>();
  if (isRoleSection(section)) {
    for (const role of stepItems(cv, section).filter((r) => !roleId || r.id === roleId)) {
      const { company, title, startDate, endDate, description } = role;
      items.set(role.id, { fields: { description, company, title, startDate, endDate }, roleId: role.id });
      for (const bullet of role.bullets) items.set(bullet.id, { fields: { text: bullet.text }, roleId: role.id });
    }
  } else if (section === "skills") {
    for (const skill of [...cv.technicalSkills, ...cv.professionalSkills]) items.set(skill.id, { fields: { name: skill.name }, roleId: null });
    items.set("new-skill", { fields: { name: "" }, roleId: null });
  } else if (section === "summary") {
    items.set("summary", { fields: { summary: cv.basics.summary }, roleId: null });
  } else if (section === "achievements" || isLightTailorSection(section)) {
    // Awards reword their name and description; every lighter item's lines are their own items. Each item can be
    // hidden for this job ("hide:<id>"), and the section can be put in a new order ("order": every id, comma-joined).
    const list = lightList(cv, section);
    for (const item of list) {
      const award = section === "achievements" ? cv.awards.find((a) => a.id === item.id) : undefined;
      if (award) items.set(award.id, { fields: { name: award.name, description: award.description }, roleId: null });
      for (const line of item.bullets ?? []) items.set(line.id, { fields: { text: line.text }, roleId: null });
      items.set(`hide:${item.id}`, { fields: { hidden: "" }, roleId: null });
    }
    if (list.length > 1) items.set("order", { fields: { order: list.map((item) => item.id).join(",") }, roleId: null });
  } else if (section === "languages") {
    for (const language of cv.languages) items.set(language.id, { fields: { name: language.name, level: language.level }, roleId: null });
  }
  return items;
}

/**
 * What the model sees: the section's own items, plus the roles with their notes and facts as read-only
 * context, so skills and the summary can draw on the experience.
 */
function sectionData(cv: CvContent, section: TailorSection, jobId: string, roleId: string | null): unknown {
  const roles = cv.experience.map((role) => ({ ...role, notes: role.notes.filter((note) => note.jobId === undefined || note.jobId === jobId) }));
  // One role to edit; the other roles are read-only context.
  if (section === "experience") return { edit: roles.filter((role) => role.id === roleId), context: { roles: roles.filter((role) => role.id !== roleId) } };
  if (section === "projects") {
    // One project or volunteering role to edit, with its kind; the roles and the other items are read-only context.
    const items = scoredItems(cv).filter(({ kind }) => kind !== "role")
      .map(({ item, kind }) => ({ kind, ...item, notes: item.notes.filter((note) => note.jobId === undefined || note.jobId === jobId) }));
    return { edit: items.filter((item) => item.id === roleId), context: { roles, projectsAndVolunteering: items.filter((item) => item.id !== roleId) } };
  }
  const skills = { technicalSkills: cv.technicalSkills, professionalSkills: cv.professionalSkills };
  if (section === "skills") return { edit: skills, context: { roles } };
  if (section === "summary") return { edit: { summary: cv.basics.summary, titles: cv.basics.titles }, context: { roles, skills } };
  return section === "achievements" || isLightTailorSection(section) ? lightList(cv, section) : cv.languages;
}

/** The list a Final touches step of the lighter sections works on (Achievements are the CV's awards). */
export function lightList(cv: CvContent, section: "achievements" | LightTailorSection): Array<{ id: string; bullets?: { id: string; text: string }[]; hidden?: boolean }> {
  return section === "achievements" ? cv.awards : cv[section];
}
/** A hide or an order is not CV text: nothing in it is a claim, so the truth checks skip it. */
export const notText = (p: Pick<Proposal, "field">) => p.field === "hidden" || p.field === "order";

/** Written CV text only: ids, layout and metadata would add digits that look like known numbers. */
export function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") {
    return Object.entries(value).filter(([key]) => !["id", "layout", "schemaVersion", "locale", "photo", "askedAt", "updatedAt", "fromNotes", "enrichedAt"]
      .includes(key) && !key.endsWith("Id")).flatMap(([, entry]) => texts(entry));
  }
  return [];
}

/**
 * Proposes one section, checks each proposal, retries flagged ones once, and stores the result on the run.
 * The truth rule: a proposal still flagged after the retry is dropped (its item keeps the Base wording) and
 * only counted in `removed`; the person is never asked to accept it. `questions` stays empty.
 */
export async function runSectionPass(
  deps: { model: ModelDeps; tailor: TailorRepo; log?: LogFn },
  input: { userId: string; run: TailorRun; job: JobExtraction; cv: CvContent; section: TailorSection; roleId?: string },
): Promise<{ proposals: Proposal[]; questions: TailorQuestion[]; removed: number }> {
  const { section, run } = input;
  if (section === "layout") throw new ApiError(400, "invalid_content", "The layout step has its own route.");
  // Like accept: only the current step of an open run, so a stale tab can't reopen or rewind it.
  if (run.status === "done" || run.currentSection !== section) {
    throw new ApiError(409, "section_not_current", "This section isn't the current step.");
  }
  const roleId = currentRole(run, section, input.roleId);
  const { proposals: kept, items, removed } = await passProposals(deps, { ...input, section, roleId });
  await deps.tailor.updateRun(run.id, {
    status: "waiting_user", currentSection: section,
    proposals: [...(run.proposals ?? []).filter((p) => !items.has(p.itemId)), ...kept],
    // Flag questions from older runs of this section (or role) go: nothing asks to keep a flagged proposal now.
    questions: (run.questions ?? []).filter((q) => q.kind !== "flag" || q.section !== section || (roleId !== null && q.roleId !== roleId)),
  });
  return { proposals: kept, questions: [], removed };
}

/**
 * One section's proposals (with a role, one Experience role), checked and retried, without touching the run.
 * A role redo uses it for a finished role.
 */
export async function passProposals(
  deps: { model: ModelDeps; tailor: TailorRepo; log?: LogFn },
  input: { userId: string; run: TailorRun; job: JobExtraction; cv: CvContent; section: Exclude<TailorSection, "layout">; roleId: string | null },
): Promise<{ proposals: Proposal[]; items: Map<string, Item>; removed: number }> {
  const { section, run, roleId } = input;
  const contentSection = section;
  const steering = run.tailoredCvId ? await deps.tailor.getSteering(run.tailoredCvId) : null;
  if (!steering) throw new ApiError(404, "job_not_found", "This job was deleted.");
  const cv = stripHeader(input.cv).cv;
  const items = sectionItems(cv, section, roleId);
  // Flag questions quote the flagged proposal, so their answers are never a source.
  const asked = new Map((run.questions ?? []).filter((question) => question.kind !== "flag").map((question) => [question.id, question.text]));
  const answers = (run.answers ?? []).flatMap((answer) => answer.value && asked.has(answer.questionId)
    ? [{ question: asked.get(answer.questionId)!, answer: answer.value }] : []);
  const sources = [...texts(cv), ...answers.flatMap((answer) => [answer.question, answer.answer])];
  // A confirmed skill names the roles it was used in: "Used in: Title · Company, Title · Company".
  const usedIn = new Map<string, string>();
  for (const answer of run.answers ?? []) {
    const question = (run.questions ?? []).find((q) => q.id === answer.questionId);
    const roles = (answer.roleIds ?? []).flatMap((id) => cv.experience.filter((role) => role.id === id))
      .map((role) => [role.title, role.company].filter((part) => part.trim()).join(" · "));
    if (question?.kind === "skill" && question.skill && answer.via !== "skip" && roles.length > 0) {
      usedIn.set(question.skill.trim().toLowerCase(), `Used in: ${roles.join(", ")}`);
    }
  }
  const call = <S extends z.ZodType>(task: "tailor_section" | "tailor_verify", tier: "strong" | "cheap", schema: S, system: string, user: string) =>
    callModel(deps.model, { userId: input.userId, task, tier, schema, system, user, maxOutputTokens: 12000 });

  async function propose(retry: Proposal[]): Promise<Proposal[]> {
    const reply = await call("tailor_section", "strong", ModelProposalsSchema, sectionSystemPrompt(contentSection), sectionUserMessage({
      section, items: sectionData(cv, section, run.jobId, roleId), job: input.job, language: steering!.language,
      steering: steeringText(steering!.steering, cv), answers, retry,
    }));
    // An item with one editable field (a bullet's text, the summary) takes any field name; other unknown item ids
    // or fields are dropped and logged (ids and fields only); items without a proposal keep the Base CV wording.
    const kept: Proposal[] = [];
    const dropped: { itemId: string; field: string }[] = [];
    for (const { reason, guesses, ...p } of reply.proposals) {
      const fields = Object.keys(items.get(p.itemId)?.fields ?? {});
      const field = fields.includes(p.field) ? p.field : fields.length === 1 ? fields[0]! : null;
      // A guess or a new skill keeps the reason naming its basis; a plain rewording has none.
      const used = p.itemId === "new-skill" ? usedIn.get(p.text.trim().toLowerCase()) : undefined;
      const why = used ? { reason: used } : (p.inferred || p.itemId === "new-skill") && reason?.trim() ? { reason: reason.trim() } : {};
      // The summary's guesses are exact spans of its text, each its own item; they carry the inference.
      const spans = p.itemId === "summary" ? placeGuesses(p.text.trim(), (guesses ?? []).map((g) => ({ text: g.text, reason: g.reason.trim() })))
        .map((g) => ({ text: g.text, reason: g.reason })) : [];
      const guessed = spans.length > 0 ? { inferred: false, guesses: spans } : {};
      // An order that changes nothing is no change, so a section with nothing else passes with a tick.
      const same = (a: string) => a.split(",").map((id) => id.trim()).join(",");
      if (p.itemId === "order" && field && same(p.text) === same(items.get("order")!.fields.order ?? "")) continue;
      // A hide or an order is never a guess: it names no fact, and the person decides it on the screen.
      if (field && p.text.trim() && notText({ field })) kept.push({ ...p, field, text: p.text.trim(), inferred: false, flags: [] });
      else if (field && p.text.trim()) kept.push({ ...p, field, text: p.text.trim(), flags: [], ...why, ...guessed });
      else if (!field) dropped.push({ itemId: p.itemId, field: p.field });
    }
    if (dropped.length) deps.log?.({ msg: "tailor proposals dropped", section, count: dropped.length, dropped });
    return kept;
  }
  async function check(all: Proposal[]): Promise<Proposal[]> {
    const proposals = all.filter((p) => !notText(p));
    if (proposals.length === 0) return all.map((p) => ({ ...p, flags: [] }));
    const verified = await call("tailor_verify", "cheap", VerifySchema, verifySystemPrompt, JSON.stringify({
      sources, proposals: proposals.map((p) => ({ itemId: p.itemId, text: p.text, before: items.get(p.itemId)?.fields[p.field] })),
    }));
    return all.map((p) => {
      if (notText(p)) return { ...p, flags: [] };
      const fields = items.get(p.itemId)!.fields;
      const original = "company" in fields ? fields : undefined;
      const claims = verified.results.filter((result) => result.itemId === p.itemId).flatMap((result) => result.claims);
      return { ...p, flags: [...checkProposal(p, { sources, original }), ...claims.map((detail) => ({ rule: "achievement" as const, detail }))] };
    });
  }

  let proposals: Proposal[];
  let flagged = new Set<string>();
  let firstFlagged = 0;
  try {
    proposals = await check(await propose([]));
    flagged = new Set(proposals.filter((p) => p.flags.length > 0).map((p) => p.itemId));
    // Every proposal on a flagged item is retried (new skills share one item id), so count them all.
    firstFlagged = proposals.filter((p) => flagged.has(p.itemId)).length;
    if (flagged.size > 0) {
      const retried = await check((await propose(proposals.filter((p) => flagged.has(p.itemId)))).filter((p) => flagged.has(p.itemId)));
      // Retried items go back where the model first ranked them.
      const placed = new Set<string>();
      proposals = proposals.flatMap((p) => {
        if (!flagged.has(p.itemId)) return [p];
        if (placed.has(p.itemId)) return [];
        placed.add(p.itemId);
        return retried.filter((r) => r.itemId === p.itemId);
      });
    }
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError(502, "ai_failed", `Couldn't tailor ${section}. Try again.`);
  }

  const kept = proposals.filter((p) => p.flags.length === 0);
  // Proposals on flagged items that didn't come back clean from the retry, including ones the retry left out.
  const removed = Math.max(0, firstFlagged - kept.filter((p) => flagged.has(p.itemId)).length);
  return { proposals: kept, items, removed };
}

import { z } from "zod";
import {
  newId,
  type CvContent, type JobExtraction, type Proposal, type TailorQuestion, type TailorRun, type TailorSection,
} from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import { ApiError, type LogFn } from "../errors.ts";
import { checkProposal } from "./checks.ts";
import type { TailorRepo } from "./repo.ts";
import { sectionSystemPrompt, sectionUserMessage, verifySystemPrompt } from "./section-prompts.ts";
import { stripHeader } from "./strip-header.ts";

type Item = { fields: Record<string, string>; roleId: string | null };
const ModelProposalsSchema = z.object({
  proposals: z.array(z.object({ itemId: z.string(), field: z.string(), text: z.string(), inferred: z.boolean() })),
});
/** Skills also return a reason (null except for a suggested new skill). No `default`: strict structured output rejects it. */
const SkillProposalsSchema = z.object({
  proposals: z.array(z.object({
    itemId: z.string(), field: z.string(), text: z.string(), inferred: z.boolean(), reason: z.string().nullable(),
  })),
});
const VerifySchema = z.object({ results: z.array(z.object({ itemId: z.string(), claims: z.array(z.string()) })) });

/** The items a section's proposals may point at, keyed by stable item id, with the fields that may change. */
export function sectionItems(cv: CvContent, section: TailorSection): Map<string, Item> {
  const items = new Map<string, Item>();
  if (section === "experience") {
    for (const role of cv.experience) {
      const { company, title, startDate, endDate, description } = role;
      items.set(role.id, { fields: { description, company, title, startDate, endDate }, roleId: role.id });
      for (const bullet of role.bullets) items.set(bullet.id, { fields: { text: bullet.text }, roleId: role.id });
    }
  } else if (section === "skills") {
    for (const skill of [...cv.technicalSkills, ...cv.professionalSkills]) items.set(skill.id, { fields: { name: skill.name }, roleId: null });
    items.set("new-skill", { fields: { name: "" }, roleId: null });
  } else if (section === "summary") {
    items.set("summary", { fields: { summary: cv.basics.summary }, roleId: null });
  } else if (section === "achievements") {
    for (const award of cv.awards) items.set(award.id, { fields: { name: award.name, description: award.description }, roleId: null });
  } else if (section === "languages") {
    for (const language of cv.languages) items.set(language.id, { fields: { name: language.name, level: language.level }, roleId: null });
  }
  return items;
}

/**
 * What the model sees: the section's own items, plus the roles with their notes and facts as read-only
 * context, so skills and the summary can draw on the experience.
 */
function sectionData(cv: CvContent, section: TailorSection, jobId: string): unknown {
  const roles = cv.experience.map((role) => ({ ...role, notes: role.notes.filter((note) => note.jobId === undefined || note.jobId === jobId) }));
  if (section === "experience") return roles;
  const skills = { technicalSkills: cv.technicalSkills, professionalSkills: cv.professionalSkills };
  if (section === "skills") return { edit: skills, context: { roles } };
  if (section === "summary") return { edit: { summary: cv.basics.summary, titles: cv.basics.titles }, context: { roles, skills } };
  return section === "achievements" ? cv.awards : cv.languages;
}

/** Written CV text only: ids, layout and metadata would add digits that look like known numbers. */
export function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") {
    return Object.entries(value).filter(([key]) => !["id", "layout", "schemaVersion", "locale", "photo", "askedAt", "updatedAt", "fromNotes"]
      .includes(key) && !key.endsWith("Id")).flatMap(([, entry]) => texts(entry));
  }
  return [];
}

/** What the flagged item is, in words: "the bullet in Engineer at Acme", "the English level", "the summary". */
function itemName(cv: CvContent, section: TailorSection, p: Proposal): string {
  const at = (role: CvContent["experience"][number]) => [role.title, role.company].filter((part) => part.trim()).join(" at ");
  if (section === "experience") {
    const role = cv.experience.find((r) => r.id === p.itemId || r.bullets.some((b) => b.id === p.itemId));
    if (!role) return "item";
    if (role.id !== p.itemId) return `bullet in ${at(role)}`;
    return `${p.field === "description" ? "description" : p.field} of ${at(role)}`;
  }
  if (section === "skills") {
    const skill = [...cv.technicalSkills, ...cv.professionalSkills].find((s) => s.id === p.itemId);
    return skill ? `skill "${skill.name}"` : "new skill";
  }
  if (section === "summary") return "summary";
  if (section === "achievements") return `achievement "${cv.awards.find((a) => a.id === p.itemId)?.name ?? ""}"`;
  const language = cv.languages.find((l) => l.id === p.itemId);
  return language ? (p.field === "level" ? `${language.name} level` : `language "${language.name}"`) : "language";
}

const plain = (text: string) => text.trim().toLowerCase().replace(/[\s.]+/g, " ").trim();

/** The flag question: names the item, quotes the proposal, and adds each check's detail only when it isn't the proposal again. */
function flagText(cv: CvContent, section: TailorSection, p: Proposal): string {
  const details = [...new Set(p.flags.flatMap((flag) => {
    if (plain(flag.detail) === plain(p.text) || !flag.detail.trim()) return [];
    if (flag.rule === "tool") return [`Not in your CV, notes or answers: ${flag.detail}.`];
    if (flag.rule === "achievement") return [`Not supported by your CV: "${flag.detail}".`];
    return [/[.!?]$/.test(flag.detail) ? flag.detail : `${flag.detail}.`];
  }))];
  return [`Please check the ${itemName(cv, section, p)}: "${p.text}".`, ...details].join(" ");
}

/** Proposes one section, checks each proposal, retries flagged ones once, and stores the result on the run. */
export async function runSectionPass(
  deps: { model: ModelDeps; tailor: TailorRepo; log?: LogFn },
  input: { userId: string; run: TailorRun; job: JobExtraction; cv: CvContent; section: TailorSection },
): Promise<{ proposals: Proposal[]; questions: TailorQuestion[] }> {
  const { section, run } = input;
  if (section === "layout") throw new ApiError(400, "invalid_content", "The layout step has its own route.");
  // Like accept: only the current step of an open run, so a stale tab can't reopen or rewind it.
  if (run.status === "done" || run.currentSection !== section) {
    throw new ApiError(409, "section_not_current", "This section isn't the current step.");
  }
  const contentSection: Exclude<TailorSection, "layout"> = section;
  const steering = run.tailoredCvId ? await deps.tailor.getSteering(run.tailoredCvId) : null;
  if (!steering) throw new ApiError(404, "job_not_found", "This job was deleted.");
  const cv = stripHeader(input.cv).cv;
  const items = sectionItems(cv, section);
  // Flag questions quote the flagged proposal, so their answers are never a source.
  const asked = new Map((run.questions ?? []).filter((question) => question.kind !== "flag").map((question) => [question.id, question.text]));
  const answers = (run.answers ?? []).flatMap((answer) => answer.value && asked.has(answer.questionId)
    ? [{ question: asked.get(answer.questionId)!, answer: answer.value }] : []);
  const sources = [...texts(cv), ...answers.flatMap((answer) => [answer.question, answer.answer])];
  const call = <S extends z.ZodType>(task: "tailor_section" | "tailor_verify", tier: "strong" | "cheap", schema: S, system: string, user: string) =>
    callModel(deps.model, { userId: input.userId, task, tier, schema, system, user, maxOutputTokens: 12000 });

  async function propose(retry: Proposal[]): Promise<Proposal[]> {
    const schema = section === "skills" ? SkillProposalsSchema : ModelProposalsSchema;
    const reply: { proposals: (z.infer<typeof ModelProposalsSchema>["proposals"][number] & { reason?: string | null })[] } =
      await call("tailor_section", "strong", schema, sectionSystemPrompt(contentSection), sectionUserMessage({
      section, items: sectionData(cv, section, run.jobId), job: input.job, language: steering!.language,
      tone: steering!.tone ?? "neutral", instruction: steering!.instruction, answers, retry,
    }));
    // An item with one editable field (a bullet's text, the summary) takes any field name; other unknown item ids
    // or fields are dropped and logged (ids and fields only); items without a proposal keep the Base CV wording.
    const kept: Proposal[] = [];
    const dropped: { itemId: string; field: string }[] = [];
    for (const { reason, ...p } of reply.proposals) {
      const fields = Object.keys(items.get(p.itemId)?.fields ?? {});
      const field = fields.includes(p.field) ? p.field : fields.length === 1 ? fields[0]! : null;
      const why = p.itemId === "new-skill" && reason?.trim() ? { reason: reason.trim() } : {};
      if (field && p.text.trim()) kept.push({ ...p, field, text: p.text.trim(), flags: [], ...why });
      else if (!field) dropped.push({ itemId: p.itemId, field: p.field });
    }
    if (dropped.length) deps.log?.({ msg: "tailor proposals dropped", section, count: dropped.length, dropped });
    return kept;
  }
  async function check(proposals: Proposal[]): Promise<Proposal[]> {
    if (proposals.length === 0) return [];
    const verified = await call("tailor_verify", "cheap", VerifySchema, verifySystemPrompt, JSON.stringify({
      sources, proposals: proposals.map((p) => ({ itemId: p.itemId, text: p.text, before: items.get(p.itemId)?.fields[p.field] })),
    }));
    return proposals.map((p) => {
      const fields = items.get(p.itemId)!.fields;
      const original = "company" in fields ? fields : undefined;
      const claims = verified.results.filter((result) => result.itemId === p.itemId).flatMap((result) => result.claims);
      return { ...p, flags: [...checkProposal(p, { sources, original }), ...claims.map((detail) => ({ rule: "achievement" as const, detail }))] };
    });
  }

  let proposals: Proposal[];
  try {
    proposals = await check(await propose([]));
    const flagged = new Set(proposals.filter((p) => p.flags.length > 0).map((p) => p.itemId));
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

  const questions: TailorQuestion[] = proposals.filter((p) => p.flags.length > 0).map((p) => ({
    id: newId(), section, roleId: items.get(p.itemId)!.roleId, kind: "flag",
    text: flagText(cv, section, p),
    options: ["Keep it", "Use original wording"], reason: p.flags.map((flag) => flag.rule).join(", "),
    // Accept and the web find a proposal's flag question by this key (new skills share the id "new-skill").
    // One role can have several flagged fields (title, company…), so the key names the field too.
    itemId: `${p.itemId === "new-skill" ? `new-skill:${p.text}` : p.itemId}|${p.field}`,
  }));
  await deps.tailor.updateRun(run.id, {
    status: "waiting_user", currentSection: section,
    proposals: [...(run.proposals ?? []).filter((p) => !items.has(p.itemId)), ...proposals],
    // A rerun replaces this section's earlier flag questions.
    questions: [...(run.questions ?? []).filter((q) => q.kind !== "flag" || q.section !== section), ...questions],
  });
  return { proposals, questions };
}

import { EnrichParseError, TOOLS_NOTE, type CvContent } from "@resumora/shared";
import { z } from "zod";
import { AiInputRejectedError, AiOutputTooLongError, AiUnavailableError, callModel, type ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import { skillsSystemPrompt, skillsUserMessage } from "./skills-prompts.ts";

const Group = z.enum(["technicalSkills", "professionalSkills"]);
const ModelSkillsSchema = z.object({
  suggestions: z.array(z.object({ name: z.string(), group: Group, evidence: z.array(z.string()) })),
  sort: z.array(z.object({ skillId: z.string(), group: Group })),
});

/** One line a skill rests on: an exact quote from the person's text, and the role it was found in. */
export type SkillLine = { roleId: string; text: string };
/** picked: a tool the person ticked in the Enrich Tools step (not one the AI found). */
export type SkillSuggestion = { name: string; group: z.infer<typeof Group>; lines: SkillLine[]; picked: boolean };
export type SkillsResult = { suggestions: SkillSuggestion[]; sort: { skillId: string; group: z.infer<typeof Group> }[] };

const MAX_SUGGESTIONS = 15;
/** Lower case with runs of spaces collapsed, so the comparison ignores case and spacing. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const TOOLS_QUESTIONS = new Set<string>(Object.values(TOOLS_NOTE).map((l) => l.question));
const TOOLS_NONE = new Set<string>(Object.values(TOOLS_NOTE).map((l) => l.none));

/**
 * The tools each role's latest Tools step note names, when that answer was picked and isn't "None of these".
 * One entry per tool (first role first), with a line for each role that names it.
 */
function confirmedTools(content: CvContent): { name: string; lines: SkillLine[] }[] {
  const tools = new Map<string, { name: string; lines: SkillLine[] }>();
  for (const role of content.experience) {
    const notes = role.notes.filter((n) => TOOLS_QUESTIONS.has(n.question) && n.via.includes("pick"));
    const latest = notes.reduce<(typeof notes)[number] | undefined>((a, n) => (!a || n.askedAt > a.askedAt ? n : a), undefined);
    if (!latest || TOOLS_NONE.has(latest.answer.trim())) continue;
    for (const name of latest.answer.split(",").map((s) => s.trim()).filter(Boolean)) {
      const line = { roleId: role.id, text: latest.answer };
      const had = tools.get(norm(name));
      if (!had) tools.set(norm(name), { name, lines: [line] });
      else if (!had.lines.some((l) => l.roleId === role.id)) had.lines.push(line);
    }
  }
  return [...tools.values()];
}

/**
 * Suggests skills the saved roles show (deduced ones too) and the tools the person confirmed, and groups the "to sort"
 * skills. Every quote is checked against the person's own text; a suggestion with any quote not found is dropped.
 */
export async function suggestSkills(deps: { cv: CvRepo; model: ModelDeps; userId: string }): Promise<SkillsResult> {
  const { content } = await deps.cv.get();
  // One entry per piece of text, so a quote has to sit inside a single title, description, bullet or note answer.
  const fields = content.experience
    .flatMap((r) => [r.title, r.description, ...r.bullets.map((b) => b.text), ...r.notes.map((n) => n.answer)].map((t) => ({ roleId: r.id, text: norm(t) })))
    .filter((f) => f.text !== "");
  if (fields.length === 0) return { suggestions: [], sort: [] };

  const taken = new Set([...content.technicalSkills, ...content.professionalSkills, ...content.unclearSkills].map((s) => norm(s.name)));
  const tools = confirmedTools(content).filter((t) => !taken.has(norm(t.name)));

  let answer: z.infer<typeof ModelSkillsSchema>;
  try {
    answer = await callModel(deps.model, {
      userId: deps.userId,
      task: "enrich_skills",
      schema: ModelSkillsSchema,
      system: skillsSystemPrompt(content.locale),
      user: skillsUserMessage(content, tools.map((t) => t.name)),
      maxOutputTokens: 2500,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError || err instanceof AiInputRejectedError) throw new ApiError(503, "ai_unavailable", "The AI service is unavailable right now. Try again soon.");
    if (err instanceof EnrichParseError || err instanceof AiOutputTooLongError) throw new ApiError(502, "ai_bad_answer", "The AI gave an answer we couldn't use. Try again.");
    throw err;
  }

  const suggestions: SkillSuggestion[] = [];
  for (const t of tools) {
    taken.add(norm(t.name));
    suggestions.push({ name: t.name, group: "technicalSkills", lines: t.lines, picked: true });
  }
  let found = 0;
  for (const s of answer.suggestions) {
    if (found === MAX_SUGGESTIONS) break;
    const name = norm(s.name);
    if (!name || taken.has(name)) continue; // empty, already listed, or the same as an earlier suggestion
    const lines: SkillLine[] = [];
    let ok = s.evidence.length > 0;
    for (const quote of s.evidence) {
      const q = norm(quote);
      const field = q ? fields.find((f) => f.text.includes(q)) : undefined;
      if (!field) { ok = false; break; }
      if (!lines.some((l) => l.roleId === field.roleId && norm(l.text) === q)) lines.push({ roleId: field.roleId, text: quote.trim() });
    }
    if (!ok) continue;
    taken.add(name);
    suggestions.push({ name: s.name.trim(), group: s.group, lines, picked: false });
    found++;
  }

  const unclear = new Set(content.unclearSkills.map((s) => s.id));
  const seen = new Set<string>();
  const sort: SkillsResult["sort"] = [];
  for (const s of answer.sort) {
    if (!unclear.has(s.skillId) || seen.has(s.skillId)) continue;
    seen.add(s.skillId);
    sort.push({ skillId: s.skillId, group: s.group });
  }
  return { suggestions, sort };
}

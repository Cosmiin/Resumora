import { EnrichParseError } from "@resumora/shared";
import { z } from "zod";
import { AiInputRejectedError, AiOutputTooLongError, AiUnavailableError, callModel, type ModelDeps } from "../ai/call-model.ts";
import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import { skillsSystemPrompt, skillsUserMessage } from "./skills-prompts.ts";

const Group = z.enum(["technicalSkills", "professionalSkills"]);
const ModelSkillsSchema = z.object({
  suggestions: z.array(z.object({ name: z.string(), group: Group, evidence: z.string() })),
  sort: z.array(z.object({ skillId: z.string(), group: Group })),
});

export type SkillsResult = z.infer<typeof ModelSkillsSchema>;

const MAX_SUGGESTIONS = 15;
/** Lower case with runs of spaces collapsed, so the comparison ignores case and spacing. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Suggests skills the saved experience shows, and groups the "to sort" skills.
 * Every suggestion is checked against the person's own text; the rest are dropped.
 */
export async function suggestSkills(deps: { cv: CvRepo; model: ModelDeps; userId: string }): Promise<SkillsResult> {
  const { content } = await deps.cv.get();
  // One entry per piece of text, so evidence has to sit inside a single title, description, bullet or note answer.
  const texts = content.experience
    .flatMap((r) => [r.title, r.description, ...r.bullets.map((b) => b.text), ...r.notes.map((n) => n.answer)])
    .map(norm)
    .filter(Boolean);
  if (texts.length === 0) return { suggestions: [], sort: [] };

  let answer: SkillsResult;
  try {
    answer = await callModel(deps.model, {
      userId: deps.userId,
      task: "enrich_skills",
      schema: ModelSkillsSchema,
      system: skillsSystemPrompt(content.locale),
      user: skillsUserMessage(content),
      maxOutputTokens: 1500,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError || err instanceof AiInputRejectedError) throw new ApiError(503, "ai_unavailable", "The AI service is unavailable right now. Try again soon.");
    if (err instanceof EnrichParseError || err instanceof AiOutputTooLongError) throw new ApiError(502, "ai_bad_answer", "The AI gave an answer we couldn't use. Try again.");
    throw err;
  }

  const taken = new Set([...content.technicalSkills, ...content.professionalSkills, ...content.unclearSkills].map((s) => norm(s.name)));
  const suggestions: SkillsResult["suggestions"] = [];
  for (const s of answer.suggestions) {
    const name = norm(s.name);
    const evidence = norm(s.evidence);
    if (!name || !evidence || taken.has(name)) continue; // empty, already listed, or the same as an earlier suggestion
    if (!texts.some((t) => t.includes(name)) || !texts.some((t) => t.includes(evidence))) continue;
    taken.add(name);
    suggestions.push({ name: s.name.trim(), group: s.group, evidence: s.evidence.trim() });
    if (suggestions.length === MAX_SUGGESTIONS) break;
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

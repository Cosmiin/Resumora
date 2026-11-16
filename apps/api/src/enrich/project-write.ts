import {
  MAX_EXTRA_TOOLS, MAX_PROJECT_BULLETS, MAX_TEXT, PROJECT_DESCRIPTION_MAX, PROJECT_OPTION_MAX, SKILL_GROUPS, hasUnknownNumber, pastTenseNote, repeatKey, startsInPresentTense,
  type Locale, type Project, type ProjectWriteAnswer, type ProjectWriteBody,
} from "@resumora/shared";
import { z } from "zod";
import { callModel } from "../ai/call-model.ts";
import { unknownTools } from "../tailor/checks.ts";
import { notSavedProject } from "./project-questions.ts";
import { projectWriteSystemPrompt, projectWriteUserMessage } from "./project-prompts.ts";
import { squash } from "./rewrite.ts";
import { aiError, type ScoreDeps } from "./score.ts";

const ModelSchema = z.object({
  description: z.string(),
  bullets: z.array(z.string()).max(6),
  extraTools: z.array(z.string()).max(30),
});
type ModelAnswer = z.infer<typeof ModelSchema>;


/** The project's own text: its fields, its lines and its earlier answers. The only source a line may use. */
export function projectSources(project: Project): string[] {
  return [
    project.title, project.company, project.description, project.url,
    ...project.bullets.map((b) => b.text),
    ...project.notes.filter((n) => n.jobId === undefined).map((n) => n.answer),
  ].filter((s) => s.trim() !== "");
}

/** True when `name` appears in `texts` as a whole word, ignoring case ("Node.js", "C#" included). */
function mentions(texts: string[], name: string): boolean {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
  return texts.some((t) => pattern.test(t));
}

/** The first sentence, at most 200 characters (cut at a word). */
function firstSentence(text: string): string {
  const sentence = squash(text).split(/(?<=[.!?])\s+/)[0] ?? "";
  if (sentence.length <= PROJECT_DESCRIPTION_MAX) return sentence;
  const cut = sentence.slice(0, PROJECT_DESCRIPTION_MAX + 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 0)).replace(/[\s,;:–-]+$/, "") || sentence.slice(0, PROJECT_DESCRIPTION_MAX);
}

/** Check 1: a line naming a tool or a number no source has is dropped (the description is emptied). */
function confirmedOnly(answer: ModelAnswer, sources: string[]): { description: string; bullets: string[] } {
  const ok = (text: string) => !unknownTools(text, sources).length && !hasUnknownNumber(text, sources);
  const description = squash(answer.description);
  const bullets = answer.bullets.map(squash).filter((b) => b !== "" && b.length <= MAX_TEXT);
  return { description: description && ok(description) ? description : "", bullets: bullets.filter(ok) };
}

/**
 * The bullets are always checked. The description only in Romanian: it names the project ("A Make flow…"), which the
 * English check (any opening word that isn't a past verb) would read as present; the Romanian check looks at verb endings.
 */
const checksDescription = (locale: Locale) => locale === "ro";
const inPresent = (lines: { description: string; bullets: string[] }, locale: Locale) =>
  [...(checksDescription(locale) ? [lines.description] : []), ...lines.bullets].some((l) => l !== "" && startsInPresentTense(l, locale));

/**
 * One description sentence, at most two bullets and the tools that didn't fit, for one saved project, from its
 * own text and its answers only. Code checks after the call: unknown tools or numbers dropped; an ended project's
 * present-tense lines retried once, then dropped; the limits enforced; extra tools only when confirmed, not on the
 * page already and not in Skills.
 */
export async function projectWrite(deps: ScoreDeps, input: ProjectWriteBody): Promise<ProjectWriteAnswer> {
  const { content } = await deps.cv.get();
  const project = content.projects.find((p) => p.id === input.projectId);
  if (!project) throw notSavedProject();
  const locale = content.locale;
  const sources = projectSources(project);
  const ended = !project.current && project.endDate !== "";

  const ask = async (extra: string): Promise<ModelAnswer> => {
    try {
      return await callModel(deps.model, {
        userId: deps.userId,
        task: "project_write",
        tier: "cheap",
        schema: ModelSchema,
        system: projectWriteSystemPrompt(locale),
        user: projectWriteUserMessage(project, content) + extra,
        maxOutputTokens: 800,
      });
    } catch (err) {
      aiError(err);
    }
  };

  let answer = await ask("");
  let lines = confirmedOnly(answer, sources);
  // Check 2: an ended project's line in the present gets one retry, then is dropped.
  if (ended && inPresent(lines, locale)) {
    answer = await ask(`\n${pastTenseNote(locale)}`);
    lines = confirmedOnly(answer, sources);
    lines = {
      description: checksDescription(locale) && lines.description && startsInPresentTense(lines.description, locale) ? "" : lines.description,
      bullets: lines.bullets.filter((b) => !startsInPresentTense(b, locale)),
    };
  }
  // Check 3: one sentence, two bullets.
  const description = lines.description ? firstSentence(lines.description) : "";
  const bullets = lines.bullets.slice(0, MAX_PROJECT_BULLETS);

  // Check 4: extra tools confirmed by a source, not already on the page, not already in Skills.
  const inSkills = new Set(SKILL_GROUPS.flatMap((g) => content[g].map((s) => repeatKey(s.name))));
  const seen = new Set<string>();
  const extraTools: string[] = [];
  for (const raw of answer.extraTools) {
    const tool = squash(raw);
    const key = repeatKey(tool);
    if (!tool || tool.length > PROJECT_OPTION_MAX || seen.has(key) || inSkills.has(key)) continue;
    if (!mentions(sources, tool) || mentions([description, ...bullets], tool)) continue;
    seen.add(key);
    extraTools.push(tool);
    if (extraTools.length === MAX_EXTRA_TOOLS) break;
  }
  return { description, bullets, extraTools };
}

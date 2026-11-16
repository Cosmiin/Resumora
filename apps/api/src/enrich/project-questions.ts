import {
  MAX_PROJECT_OPTIONS, PROJECT_QUESTION_MAX, PROJECT_OPTION_MAX, PROJECT_TOPICS, isAllowedOption, repeatKey,
  type ProjectQuestion, type ProjectQuestionsAnswer, type ProjectQuestionsBody, type ProjectTopic,
} from "@resumora/shared";
import { z } from "zod";
import { callModel } from "../ai/call-model.ts";
import { ApiError } from "../errors.ts";
import { projectQuestionsSystemPrompt, projectQuestionsUserMessage } from "./project-prompts.ts";
import { aiError, type ScoreDeps } from "./score.ts";

const ModelSchema = z.object({
  questions: z.array(z.object({ topic: z.string(), text: z.string(), options: z.array(z.string()).max(20) })).max(12),
});

export const notSavedProject = () => new ApiError(409, "not_saved", "Your latest changes aren't saved yet. Try again in a moment.");

/**
 * Up to 6 questions about one saved project, one per topic in topic order, each with options to tick.
 * The model's answer is tidied in code: one question per topic, options allowed, trimmed, unique and at most 8.
 */
export async function projectQuestions(deps: ScoreDeps, input: ProjectQuestionsBody): Promise<ProjectQuestionsAnswer> {
  const { content } = await deps.cv.get();
  const project = content.projects.find((p) => p.id === input.projectId);
  if (!project) throw notSavedProject();
  const wanted = deps.questionLanguage ?? content.locale;

  let answer: z.infer<typeof ModelSchema>;
  try {
    answer = await callModel(deps.model, {
      userId: deps.userId,
      task: "project_questions",
      tier: "cheap",
      schema: ModelSchema,
      system: projectQuestionsSystemPrompt(content.locale, wanted),
      user: projectQuestionsUserMessage(project, content, wanted),
      maxOutputTokens: 1200,
    });
  } catch (err) {
    aiError(err);
  }

  const byTopic = new Map<ProjectTopic, Omit<ProjectQuestion, "id">>();
  for (const q of answer.questions) {
    const topic = PROJECT_TOPICS.find((t) => t === q.topic.trim().toLowerCase());
    const text = q.text.trim();
    if (!topic || byTopic.has(topic) || !text || text.length > PROJECT_QUESTION_MAX) continue;
    const seen = new Set<string>();
    const options: string[] = [];
    for (const raw of q.options) {
      const option = raw.trim();
      const key = repeatKey(option);
      if (!option || option.length > PROJECT_OPTION_MAX || !isAllowedOption(option) || seen.has(key)) continue;
      seen.add(key);
      options.push(option);
      if (options.length === MAX_PROJECT_OPTIONS) break;
    }
    byTopic.set(topic, { topic, text, options });
  }
  const questions = PROJECT_TOPICS.flatMap((topic) => (byTopic.has(topic) ? [byTopic.get(topic)!] : []))
    .map((q, i) => ({ id: `pq${i + 1}`, ...q }));
  return { questions };
}

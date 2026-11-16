import { z } from "zod";

/** The topics a project's questions cover, in the order they are asked (spec "1. Questions"). */
export const PROJECT_TOPICS = ["what", "tools", "connections", "part", "method", "outcome"] as const;
export type ProjectTopic = (typeof PROJECT_TOPICS)[number];

export const MAX_PROJECT_QUESTIONS = 6;
export const MAX_PROJECT_OPTIONS = 8;
export const PROJECT_QUESTION_MAX = 200;
export const PROJECT_OPTION_MAX = 60;

/** One question about a project, with suggested answers to tick (never facts until ticked). */
export const ProjectQuestionSchema = z
  .object({
    id: z.string().min(1).max(64),
    topic: z.enum(PROJECT_TOPICS),
    text: z.string().min(1).max(PROJECT_QUESTION_MAX),
    options: z.array(z.string().min(1).max(PROJECT_OPTION_MAX)).max(MAX_PROJECT_OPTIONS),
  })
  .strict();
export type ProjectQuestion = z.infer<typeof ProjectQuestionSchema>;

export const ProjectQuestionsBodySchema = z.object({ projectId: z.string().min(1).max(64) }).strict();
export type ProjectQuestionsBody = z.infer<typeof ProjectQuestionsBodySchema>;

export const ProjectQuestionsAnswerSchema = z.object({ questions: z.array(ProjectQuestionSchema).max(MAX_PROJECT_QUESTIONS) }).strict();
export type ProjectQuestionsAnswer = z.infer<typeof ProjectQuestionsAnswerSchema>;

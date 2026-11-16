import { z } from "zod";
import { MAX_TEXT } from "./cv.ts";

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

export const MAX_PROJECT_BULLETS = 2;
export const PROJECT_DESCRIPTION_MAX = 200;
export const MAX_EXTRA_TOOLS = 12;

export const ProjectWriteBodySchema = z.object({ projectId: z.string().min(1).max(64) }).strict();
export type ProjectWriteBody = z.infer<typeof ProjectWriteBodySchema>;

/** The writer's lines for one project: one description sentence (may be empty), at most two bullets, and the tools that didn't fit. */
export const ProjectWriteAnswerSchema = z
  .object({
    description: z.string().max(PROJECT_DESCRIPTION_MAX),
    bullets: z.array(z.string().min(1).max(MAX_TEXT)).max(MAX_PROJECT_BULLETS),
    extraTools: z.array(z.string().min(1).max(PROJECT_OPTION_MAX)).max(MAX_EXTRA_TOOLS),
  })
  .strict();
export type ProjectWriteAnswer = z.infer<typeof ProjectWriteAnswerSchema>;

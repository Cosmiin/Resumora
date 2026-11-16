import { describe, expect, it } from "vitest";
import { PROJECT_TOPICS, ProjectQuestionSchema, ProjectQuestionsAnswerSchema, ProjectQuestionsBodySchema, ProjectWriteAnswerSchema, ProjectWriteBodySchema } from "./index.ts";

describe("project question shapes", () => {
  const question = { id: "pq1", topic: "tools", text: "Which tools did you use?", options: ["Make", "Airtable"] };

  it("lists the six topics in the order they are asked", () => {
    expect(PROJECT_TOPICS).toEqual(["what", "tools", "connections", "part", "method", "outcome"]);
  });

  it("takes a project id only", () => {
    expect(ProjectQuestionsBodySchema.safeParse({ projectId: "p1" }).success).toBe(true);
    expect(ProjectQuestionsBodySchema.safeParse({ projectId: "" }).success).toBe(false);
    expect(ProjectQuestionsBodySchema.safeParse({ projectId: "x".repeat(65) }).success).toBe(false);
    expect(ProjectQuestionsBodySchema.safeParse({ projectId: "p1", extra: 1 }).success).toBe(false);
  });

  it("limits a question to 200 characters, 8 options of 60, and a known topic", () => {
    expect(ProjectQuestionSchema.safeParse(question).success).toBe(true);
    expect(ProjectQuestionSchema.safeParse({ ...question, text: "x".repeat(201) }).success).toBe(false);
    expect(ProjectQuestionSchema.safeParse({ ...question, options: Array(9).fill("A") }).success).toBe(false);
    expect(ProjectQuestionSchema.safeParse({ ...question, options: ["x".repeat(61)] }).success).toBe(false);
    expect(ProjectQuestionSchema.safeParse({ ...question, topic: "jobs" }).success).toBe(false);
  });

  it("holds at most 6 questions", () => {
    expect(ProjectQuestionsAnswerSchema.safeParse({ questions: Array(6).fill(question) }).success).toBe(true);
    expect(ProjectQuestionsAnswerSchema.safeParse({ questions: Array(7).fill(question) }).success).toBe(false);
  });
});

describe("project writer shapes", () => {
  it("takes a project id only", () => {
    expect(ProjectWriteBodySchema.safeParse({ projectId: "p1" }).success).toBe(true);
    expect(ProjectWriteBodySchema.safeParse({ projectId: "p1", answers: [] }).success).toBe(false);
  });

  it("answers one description (may be empty), at most two bullets and at most 12 extra tools", () => {
    const ok = { description: "", bullets: ["Built it.", "Shipped it."], extraTools: ["Make"] };
    expect(ProjectWriteAnswerSchema.safeParse(ok).success).toBe(true);
    expect(ProjectWriteAnswerSchema.safeParse({ ...ok, description: "x".repeat(201) }).success).toBe(false);
    expect(ProjectWriteAnswerSchema.safeParse({ ...ok, bullets: ["a", "b", "c"] }).success).toBe(false);
    expect(ProjectWriteAnswerSchema.safeParse({ ...ok, extraTools: Array(13).fill("Make") }).success).toBe(false);
    expect(ProjectWriteAnswerSchema.safeParse({ ...ok, extraTools: ["x".repeat(61)] }).success).toBe(false);
  });
});

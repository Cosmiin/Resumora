import { beforeEach, describe, expect, it, vi } from "vitest";

/** Set to make callModel throw this error instead of calling the (fake) provider. */
const forced = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock("../ai/call-model.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/call-model.ts")>();
  return {
    ...real,
    callModel: (...args: Parameters<typeof real.callModel>) => (forced.error ? Promise.reject(forced.error) : real.callModel(...args)),
  };
});
import { EnrichParseError, emptyCv, type CvContent, type Locale, type Project } from "@resumora/shared";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { ApiError } from "../errors.ts";
import { fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";
import { projectQuestionsSystemPrompt, projectQuestionsUserMessage } from "./project-prompts.ts";
import { projectQuestions } from "./project-questions.ts";

const project = (over: Partial<Project> = {}): Project => ({
  ...roleWith(["Connected the form to Airtable."], { title: "Lead intake flow", company: "Personal project", description: "Automates new leads for a bakery.", current: false, endDate: "2025-06" }),
  url: "https://example.com",
  ...over,
});

let cv: ReturnType<typeof memoryCvRepo>;
let answers: unknown[];
let model: ReturnType<typeof fakeModel>;

async function save(content: CvContent) {
  await cv.save(content, (await cv.get()).version);
}
const ask = (projectId: string, questionLanguage?: Locale) =>
  projectQuestions({ cv, insights: memoryInsightsRepo("user-1"), model: model.deps, userId: "user-1", questionLanguage }, { projectId });

beforeEach(() => {
  forced.error = null;
  cv = memoryCvRepo();
  answers = [];
  model = fakeModel(() => answers.shift());
});

describe("project question prompts", () => {
  it("the system prompt holds the six topics, options to tick, ranges and no questions about other projects or jobs", () => {
    const sys = projectQuestionsSystemPrompt("en");
    for (const topic of ["what", "tools", "connections", "part", "method", "outcome"]) expect(sys).toContain(`- ${topic}:`);
    expect(sys).toContain("Options are suggestions to tick");
    expect(sys).toContain("ranges");
    expect(sys).toContain("Never ask about another project, a job or an employer");
    expect(sys).toContain("untrusted source material");
  });

  it("a Romanian CV read in English: questions and options in English (review focus 5)", () => {
    const sys = projectQuestionsSystemPrompt("ro", "en");
    expect(sys).toContain("CV locale: ro (Romanian)");
    expect(sys).toContain("Write everything addressed to the person (questions, answer options, tips, reasons) in English");
  });

  it("the user message holds the project and its answered notes, and marks the jobs and Skills as context only", () => {
    const p = project({
      notes: [
        { id: "n1", question: "Which tools did you use?", answer: "Make, Airtable", via: ["pick"], askedAt: "2026-11-16T10:00:00Z" },
        { id: "n2", question: "Job question", answer: "Java", via: ["type"], askedAt: "2026-11-16T10:00:00Z", jobId: "6f1c2a3b-1d2e-4f5a-8b6c-7d8e9f0a1b2c" },
      ],
    });
    const content: CvContent = { ...emptyCv("en"), experience: [roleWith(["Ran payroll in SAP."])], projects: [p], technicalSkills: [{ id: "s1", name: "Excel" }] };
    const msg = projectQuestionsUserMessage(p, content);
    expect(msg).toContain("Lead intake flow");
    expect(msg).toContain("Automates new leads for a bakery.");
    expect(msg).toContain("Connected the form to Airtable.");
    expect(msg).toContain("Make, Airtable");
    expect(msg).not.toContain("Java");
    expect(msg).toContain("Context only, never a source of facts");
    expect(msg).toContain("Ran payroll in SAP.");
    expect(msg).toContain("Excel");
  });
});

describe("projectQuestions", () => {
  it("keeps one question per topic in topic order, at most 8 options, and drops an Other option and an over-long question", async () => {
    const p = project();
    await save({ ...emptyCv("en"), projects: [p] });
    answers.push({
      questions: [
        { topic: "outcome", text: "Is it used, or what came out of it?", options: ["1–10 users", "10–50 users"] },
        { topic: "tools", text: "Which tools did you use?", options: ["Make", "Zapier", "Airtable", "Notion", "Slack", "Gmail", "Google Sheets", "Webflow", "Typeform", "Stripe"] },
        { topic: "tools", text: "Which platforms did you use?", options: ["AWS"] },
        { topic: "part", text: "Which parts did you do yourself?", options: ["Design", " Build ", "Build", "Other"] },
        { topic: "method", text: "x".repeat(201), options: ["Agile"] },
      ],
    });
    const { questions } = await ask(p.id);
    expect(questions.map((q) => q.topic)).toEqual(["tools", "part", "outcome"]);
    expect(questions.map((q) => q.id)).toEqual(["pq1", "pq2", "pq3"]);
    expect(questions[0]!.text).toBe("Which tools did you use?");
    expect(questions[0]!.options).toHaveLength(8);
    expect(questions[1]!.options).toEqual(["Design", "Build"]);
    expect(model.requests).toHaveLength(1);
    expect(model.logged.map((l) => l.task)).toEqual(["project_questions"]);
  });

  it("asks in English for a Romanian CV when the person reads English", async () => {
    const p = project();
    await save({ ...emptyCv("ro"), projects: [p] });
    answers.push({ questions: [] });
    await ask(p.id, "en");
    const sent = JSON.stringify(model.requests[0]);
    expect(sent).toContain("in English");
  });

  it("an unknown project id is a 409, without a model call", async () => {
    await save({ ...emptyCv("en"), experience: [roleWith(["Ran payroll."])], projects: [project()] });
    const err = await ask("nope").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "not_saved" });
    expect(model.requests).toHaveLength(0);
  });

  it("a role id is not a project: 409", async () => {
    const r = roleWith(["Ran payroll."]);
    await save({ ...emptyCv("en"), experience: [r] });
    await expect(ask(r.id)).rejects.toMatchObject({ status: 409 });
  });

  it("a model that throws is a 502", async () => {
    const p = project();
    await save({ ...emptyCv("en"), projects: [p] });
    forced.error = new EnrichParseError("bad");
    await expect(ask(p.id)).rejects.toMatchObject({ status: 502 });
  });
});

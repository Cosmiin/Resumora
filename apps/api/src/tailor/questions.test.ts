import { describe, expect, it } from "vitest";
import { emptyCv, type CvContent, type JobExtraction } from "@resumora/shared";
import { fakeModel, roleWith } from "../enrich/fake-model.ts";
import { memoryTailorRepo } from "./memory-repo.ts";
import { askQuestions } from "./questions.ts";

const job: JobExtraction = {
  title: "AI Engineer", company: "Cedar", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [],
  summary: "Build LLM integrations.", requirements: [], responsibilities: ["Agentic development"],
};

async function ask(cv: CvContent, itemId: string) {
  const tailor = memoryTailorRepo("user-a");
  const tailoredCvId = await tailor.createTailoredCv({
    jobId: "job-a", language: "en", content: cv, baseSnapshotAt: "2026-11-10T10:00:00Z", tone: "neutral", instruction: null, steering: {},
  });
  const run = await tailor.createRun({ jobId: "job-a", tailoredCvId, kind: "tailor", sections: ["projects"], currentSection: "projects", currentRoleId: itemId });
  const model = fakeModel(() => ({ questions: [] }));
  const questions = await askQuestions({ model: model.deps, tailor }, { userId: "user-a", run, job, cv, section: "projects", roleId: itemId });
  return { questions, model };
}

describe("tailoring questions in Projects & volunteering", () => {
  it("asks nothing about a project, without calling the model", async () => {
    const project = { ...roleWith(["Built agents with the Claude API."]), url: "" };
    const { questions, model } = await ask({ ...emptyCv("en"), projects: [project] }, project.id);
    expect(questions).toEqual([]);
    expect(model.requests).toHaveLength(0);
  });

  it("still asks the model about a volunteering role", async () => {
    const helper = roleWith(["Sorted parcels."]);
    const { model } = await ask({ ...emptyCv("en"), volunteering: [helper] }, helper.id);
    expect(model.requests).toHaveLength(1);
  });
});

describe("an all-roles answer as a note", () => {
  const question = { id: "q", section: "experience" as const, roleId: null, text: "Did you use KissFlow?", kind: "skill" as const,
    options: [], reason: "Gap", skill: "KissFlow", scope: "all" as const };
  it("names the tool used, the similar tool without the asked one's name, and nothing for neither", async () => {
    const { acrossNote } = await import("./section-pass.ts");
    const { unknownTools } = await import("./checks.ts");
    expect(acrossNote(question, { questionId: "q", value: "Yes", via: "option", use: "used", roleIds: ["r1"] })).toBe("Used KissFlow");
    const similar = acrossNote(question, { questionId: "q", value: "Make.com", via: "typed", use: "similar", roleIds: ["r1"] })!;
    expect(similar).toContain("Make.com");
    expect(unknownTools("Automated approvals in KissFlow", [similar])).toEqual(["KissFlow"]);
    expect(acrossNote(question, { questionId: "q", value: "No", via: "option", use: "none" })).toBeNull();
    // "Something similar" is one tap now: no tool is named and no role ticked, so there is nothing to note.
    expect(acrossNote(question, { questionId: "q", value: "No", via: "option", use: "similar" })).toBeNull();
  });
});

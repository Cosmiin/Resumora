import { describe, expect, it } from "vitest";
import { emptyCv, type CvContent, type JobExtraction } from "@resumora/shared";
import { fakeModel, roleWith } from "../enrich/fake-model.ts";
import { memoryTailorRepo } from "./memory-repo.ts";
import { passProposals } from "./section-pass.ts";
import { sectionSystemPrompt } from "./section-prompts.ts";

const job: JobExtraction = {
  title: "AI Engineer", company: "Cedar", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [],
  summary: "Build LLM integrations.", requirements: [], responsibilities: ["Agentic development"],
};

async function setUp(cv: CvContent, itemId: string) {
  const tailor = memoryTailorRepo("user-a");
  const tailoredCvId = await tailor.createTailoredCv({
    jobId: "job-a", language: "en", content: cv, baseSnapshotAt: "2026-11-10T10:00:00Z", tone: "neutral", instruction: null, steering: {},
  });
  const run = await tailor.createRun({ jobId: "job-a", tailoredCvId, kind: "tailor", sections: ["projects"], currentSection: "projects", currentRoleId: itemId });
  return { tailor, run };
}
const reword = (itemId: string, field: string, text: string) => ({ itemId, field, text, inferred: false, reason: null, guesses: null });

describe("the projects section prompt", () => {
  it("has a project rule of its own and keeps the volunteering rule", () => {
    const sys = sectionSystemPrompt("projects");
    expect(sys).toContain("same thing in other words");
    expect(sys).toContain("never a different tool");
    expect(sys).toContain("at most two bullets");
    expect(sys).toContain("A volunteering role: tailor it like a role.");
  });
});

describe("a project's section pass", () => {
  it("keeps at most two bullet rewordings for a project", async () => {
    const project = { ...roleWith(["Built agents with the Claude API.", "Wrote the tests.", "Shipped it."], { current: true, endDate: "" }), url: "" };
    const cv = { ...emptyCv("en"), projects: [project] };
    const { tailor, run } = await setUp(cv, project.id);
    const proposals = [
      reword(project.bullets[0]!.id, "text", "Built agents with the Claude API."),
      reword(project.bullets[1]!.id, "text", "Wrote the tests."),
      reword(project.bullets[2]!.id, "text", "Shipped it."),
      reword(project.id, "description", "Built agents with the Claude API."),
    ];
    const replies = [{ proposals }, { results: [] }];
    const model = fakeModel(() => replies.shift());
    const result = await passProposals({ model: model.deps, tailor }, { userId: "user-a", run, job, cv, section: "projects", roleId: project.id });
    const bullets = result.proposals.filter((p) => p.field === "text");
    expect(bullets.map((p) => p.itemId)).toEqual([project.bullets[0]!.id, project.bullets[1]!.id]);
    expect(result.proposals.some((p) => p.field === "description")).toBe(true);
  });

  it("keeps every bullet rewording for a volunteering role", async () => {
    const helper = roleWith(["Sorted parcels.", "Led a team.", "Trained new helpers."], { current: true, endDate: "" });
    const cv = { ...emptyCv("en"), volunteering: [helper] };
    const { tailor, run } = await setUp(cv, helper.id);
    const proposals = helper.bullets.map((b) => reword(b.id, "text", b.text));
    const replies = [{ proposals }, { results: [] }];
    const model = fakeModel(() => replies.shift());
    const result = await passProposals({ model: model.deps, tailor }, { userId: "user-a", run, job, cv, section: "projects", roleId: helper.id });
    expect(result.proposals.filter((p) => p.field === "text")).toHaveLength(3);
  });
});

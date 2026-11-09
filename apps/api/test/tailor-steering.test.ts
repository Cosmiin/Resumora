import { describe, expect, it } from "vitest";
import { emptyCv, type CvContent, type JobExtraction } from "@resumora/shared";
import { roleWith } from "../src/enrich/fake-model.ts";
import { layoutUserMessage } from "../src/tailor/layout-pass.ts";
import { questionUserMessage } from "../src/tailor/question-prompts.ts";
import { sectionUserMessage } from "../src/tailor/section-prompts.ts";
import { steeringText, withColumns } from "../src/tailor/steering.ts";

const job: JobExtraction = {
  title: "Analyst", company: "DSV", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [], requirements: [],
  summary: "Process automation.", responsibilities: ["Map processes"],
};
const cv: CvContent = {
  ...emptyCv("en"),
  experience: [
    roleWith(["Ran payroll"], { id: "r1", title: "Business Analyst", company: "Emedi" }),
    roleWith(["Ran reports"], { id: "r2", title: "Consultant", company: "Acme" }),
  ],
};
const text = steeringText({ tone: "warm", draws: ["work", "step_up"], fit: "mostly", focusRoleIds: ["r2", "gone"], instruction: "Stress \"automation\"" }, cv);

describe("steeringText", () => {
  it("writes the tone with its meaning, the draws, the fit, the focus roles and the quoted instruction", () => {
    expect(text).toMatch(/Tone: warm — .+/);
    expect(text).toContain("the work itself");
    expect(text).toContain("a step up");
    expect(text).toMatch(/fit.*mostly/i);
    expect(text).toContain("Consultant · Acme");
    expect(text).toContain(JSON.stringify("Stress \"automation\""));
  });

  it("drops an unknown focus role id", () => {
    expect(text).not.toContain("gone");
    expect(text).not.toContain("Business Analyst · Emedi");
    expect(steeringText({ focusRoleIds: ["gone"] }, cv)).not.toMatch(/lean/i);
  });

  it("defaults to the neutral tone and leaves out what wasn't answered", () => {
    const plain = steeringText({}, cv);
    expect(plain).toMatch(/Tone: neutral — /);
    expect(plain).not.toMatch(/draws|fit|lean|instruction/i);
  });

  it("fills a missing tone and instruction from the old columns", () => {
    expect(withColumns({}, "confident", "Keep it short")).toEqual({ tone: "confident", instruction: "Keep it short" });
    expect(withColumns({ tone: "warm" }, "formal", null)).toEqual({ tone: "warm" });
  });
});

describe("every prompt carries the steering", () => {
  it.each([
    ["questions", () => questionUserMessage({ section: "experience", cv, job, gaps: [], answered: [], max: 5, steering: text })],
    ["section", () => sectionUserMessage({ section: "experience", items: {}, job, language: "en", steering: text, answers: [], retry: [] })],
    ["layout", () => layoutUserMessage({ order: [], headline: "", job, cv, steering: text })],
  ])("the %s user message has the tone line and the focus role names", (_name, build) => {
    const message = build();
    expect(message).toContain("Tone: warm");
    expect(message).toContain("Consultant · Acme");
  });
});

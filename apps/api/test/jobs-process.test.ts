import { describe, expect, it, vi } from "vitest";
import type { JobExtraction } from "@resumora/shared";
import type { ModelDeps } from "../src/ai/call-model.ts";
import { processJob } from "../src/jobs/process.ts";
import { buildJobUserPrompt, JOB_PROMPT_VERSION, jobExtractPrompt } from "../src/jobs/prompts.ts";

const extracted: JobExtraction = {
  title: "Engineer", company: "Example", location: null, workMode: "remote",
  employmentType: "full_time", seniority: "unknown", salary: null,
  summary: "Build software.", responsibilities: ["Build software"],
  requirements: [{ text: "TypeScript", kind: "must", category: "skill" }],
  benefits: [], applyBy: null, isJobPosting: true,
};
const work = { id: "job-a", userId: "user-a", rawText: "Private job page text", jsonLd: null };

function fakeModel(answer: unknown = extracted, crash = false) {
  const logCall = vi.fn<ModelDeps["logCall"]>().mockResolvedValue(undefined);
  const fetch = vi.fn<ModelDeps["fetch"]>().mockImplementation(async () => {
    if (crash) throw new Error(work.rawText);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
  });
  const model: ModelDeps = {
    providers: [{ name: "openrouter", url: "https://model.test/v1", apiKey: "k", model: "m" }],
    fetch, logCall,
  };
  return { model, fetch, logCall };
}

describe("job user prompt", () => {
  it("labels JSON-LD before the page text", () => {
    const jsonLd = { "@type": "JobPosting", title: "Engineer" };
    const prompt = buildJobUserPrompt({ ...work, jsonLd }, "2026-11-06");
    expect(prompt.startsWith("Today's date: 2026-11-06.\n")).toBe(true);
    expect(prompt).toContain("JSON-LD");
    expect(prompt).toContain(JSON.stringify(jsonLd));
    expect(prompt).toContain(work.rawText);
    expect(prompt.indexOf(JSON.stringify(jsonLd))).toBeLessThan(prompt.indexOf(work.rawText));
  });

  it("omits the JSON-LD block when absent", () => {
    const prompt = buildJobUserPrompt(work, "2026-11-06");
    expect(prompt).toContain(work.rawText);
    expect(prompt).not.toContain("JSON-LD");
  });

  it("caps page text at 30,000 characters", () => {
    const prompt = buildJobUserPrompt({ ...work, rawText: "x".repeat(30_000) + "PRIVATE TAIL" }, "2026-11-06");
    expect(prompt).toContain("x".repeat(30_000));
    expect(prompt).not.toContain("PRIVATE TAIL");
  });
});

function promptLine(prefix: string): string {
  return jobExtractPrompt.split("\n").find((line) => line.startsWith(prefix)) ?? "";
}

describe("job extract prompt (job.v2)", () => {
  it("is version job.v2", () => {
    expect(JOB_PROMPT_VERSION).toBe("job.v2");
  });

  it("keeps every earlier rule", () => {
    for (const rule of [
      "Never invent a company, salary, date or requirement.",
      "Keep the posting's original language.",
      "A requirement is must unless the page marks it optional",
      "One requirement per item; split lists that mix several.",
      "Ignore page chrome",
      "Set isJobPosting: false",
    ]) expect(jobExtractPrompt).toContain(rule);
  });

  it("limits the summary to two sentences on the company and the role's purpose", () => {
    expect(jobExtractPrompt).toContain("summary: at most two sentences");
    expect(jobExtractPrompt).toContain("what the company is or does, and what the role is for");
    expect(jobExtractPrompt).toContain("No benefits, no hype, no requirements");
  });

  it("asks for short requirements that keep the ad's exact keywords, without duplicates", () => {
    expect(jobExtractPrompt).toContain("requirements: one requirement per item, a short line (aim for under 10 words)");
    expect(jobExtractPrompt).toContain("keep the ad's exact terms for tools, methods, degrees and languages");
    expect(jobExtractPrompt).toContain("BPMN");
    expect(jobExtractPrompt).toContain("Power BI");
    expect(jobExtractPrompt).toContain("Fluent English");
    expect(promptLine("requirements:")).toContain("No duplicates");
  });

  it("asks for short verb-first duties that don't repeat requirements", () => {
    expect(jobExtractPrompt).toContain("responsibilities: short phrases starting with a verb");
    expect(promptLine("responsibilities:")).toContain("no duplicates");
    expect(promptLine("responsibilities:")).toContain("nothing already listed as a requirement");
  });

  it("asks for short benefits without duplicates", () => {
    expect(promptLine("benefits:")).toContain(`short phrases ("Private medical care"), no duplicates`);
  });
});

describe("job extraction", () => {
  it("sends the job.v2 prompt as the system message and still validates the schema", async () => {
    const { model, fetch } = fakeModel();
    expect(await processJob({ model }, work)).toEqual({ ok: true, extracted });
    const request = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
    expect(request.messages[0].content).toBe(jobExtractPrompt);
  });


  it("returns a valid extraction with the job task and output limit", async () => {
    const { model, fetch, logCall } = fakeModel();
    const now = () => new Date("2026-11-06T12:00:00Z");
    expect(await processJob({ model, now }, work)).toEqual({ ok: true, extracted });
    const request = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
    expect(request.response_format.json_schema.name).toBe("job_extract");
    expect(request.max_tokens).toBe(2000);
    expect(request.messages[1].content.startsWith("Today's date: 2026-11-06.\n")).toBe(true);
    expect(request.messages[1].content).toContain(work.rawText);
    expect(logCall).toHaveBeenCalledWith(expect.objectContaining({ userId: work.userId, task: "job_extract", status: "ok" }));
    expect(JSON.stringify(logCall.mock.calls)).not.toContain(work.rawText);
  });

  it("sends the deadline format and year rules to the model", async () => {
    const { model, fetch } = fakeModel();
    await processJob({ model }, work);
    const request = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
    expect(request.messages[0].content).toContain("Write applyBy as YYYY-MM-DD");
    expect(request.messages[0].content).toContain("copying the year exactly as the page writes it");
    expect(request.messages[0].content).toContain("use the next such date on or after today");
  });

  it.each(["3011-11-30", "2025-11-05", "2028-11-07"])("clears an implausible deadline %s and keeps every other field", async (applyBy) => {
    const { model } = fakeModel({ ...extracted, applyBy });
    const now = () => new Date("2026-11-06T12:00:00Z");
    expect(await processJob({ model, now }, work)).toEqual({ ok: true, extracted });
  });

  it.each(["2026-11-30", "2025-11-06", "2028-11-06", null])("keeps a plausible or missing deadline %s", async (applyBy) => {
    const answer = { ...extracted, applyBy };
    const { model } = fakeModel(answer);
    const now = () => new Date("2026-11-06T12:00:00Z");
    expect(await processJob({ model, now }, work)).toEqual({ ok: true, extracted: answer });
  });

  it("rejects a page that is not a job posting", async () => {
    const { model } = fakeModel({ ...extracted, title: "", isJobPosting: false });
    expect(await processJob({ model }, work)).toEqual({ ok: false, code: "not_a_job" });
  });

  it("fails a posting with a blank title", async () => {
    const { model } = fakeModel({ ...extracted, title: " " });
    expect(await processJob({ model }, work)).toEqual({ ok: false, code: "ai_failed" });
  });

  it("fails a throwing model without logging page text", async () => {
    const { model, logCall } = fakeModel(extracted, true);
    expect(await processJob({ model }, work)).toEqual({ ok: false, code: "ai_failed" });
    expect(logCall).toHaveBeenCalled();
    expect(JSON.stringify(logCall.mock.calls)).not.toContain(work.rawText);
  });

  it("fails output that does not match the extraction schema", async () => {
    const { model } = fakeModel({ title: "Engineer" });
    expect(await processJob({ model }, work)).toEqual({ ok: false, code: "ai_failed" });
  });
});

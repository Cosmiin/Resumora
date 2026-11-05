import { describe, expect, it, vi } from "vitest";
import type { JobExtraction } from "@resumora/shared";
import type { ModelDeps } from "../src/ai/call-model.ts";
import { processJob } from "../src/jobs/process.ts";
import { buildJobUserPrompt } from "../src/jobs/prompts.ts";

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
    const prompt = buildJobUserPrompt({ ...work, jsonLd });
    expect(prompt).toContain("JSON-LD");
    expect(prompt).toContain(JSON.stringify(jsonLd));
    expect(prompt).toContain(work.rawText);
    expect(prompt.indexOf(JSON.stringify(jsonLd))).toBeLessThan(prompt.indexOf(work.rawText));
  });

  it("omits the JSON-LD block when absent", () => {
    const prompt = buildJobUserPrompt(work);
    expect(prompt).toContain(work.rawText);
    expect(prompt).not.toContain("JSON-LD");
  });

  it("caps page text at 30,000 characters", () => {
    const prompt = buildJobUserPrompt({ ...work, rawText: "x".repeat(30_000) + "PRIVATE TAIL" });
    expect(prompt).toContain("x".repeat(30_000));
    expect(prompt).not.toContain("PRIVATE TAIL");
  });
});

describe("job extraction", () => {
  it("returns a valid extraction with the job task and output limit", async () => {
    const { model, fetch, logCall } = fakeModel();
    expect(await processJob({ model }, work)).toEqual({ ok: true, extracted });
    const request = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
    expect(request.response_format.json_schema.name).toBe("job_extract");
    expect(request.max_tokens).toBe(2000);
    expect(request.messages[1].content).toContain(work.rawText);
    expect(logCall).toHaveBeenCalledWith(expect.objectContaining({ userId: work.userId, task: "job_extract", status: "ok" }));
    expect(JSON.stringify(logCall.mock.calls)).not.toContain(work.rawText);
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

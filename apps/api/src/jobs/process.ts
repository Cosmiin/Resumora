import { JobExtractionSchema, type JobExtraction } from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import { buildJobUserPrompt, jobExtractPrompt } from "./prompts.ts";
import type { JobWork } from "./repo.ts";

export async function processJob(
  deps: { model: ModelDeps },
  work: JobWork,
): Promise<{ ok: true; extracted: JobExtraction } | { ok: false; code: "not_a_job" | "ai_failed" }> {
  try {
    const extracted = await callModel(deps.model, {
      userId: work.userId,
      task: "job_extract",
      schema: JobExtractionSchema,
      system: jobExtractPrompt,
      user: buildJobUserPrompt(work),
      maxOutputTokens: 2000,
    });
    if (!extracted.isJobPosting) return { ok: false, code: "not_a_job" };
    if (!extracted.title.trim()) return { ok: false, code: "ai_failed" };
    return { ok: true, extracted };
  } catch {
    return { ok: false, code: "ai_failed" };
  }
}

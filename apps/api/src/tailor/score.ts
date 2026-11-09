import { z } from "zod";
import { computeMatchScore, JobExtractionSchema, MatchLabelSchema, type CvContent, type JobExtraction, type MatchScore } from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import { ApiError } from "../errors.ts";
import { scoreSystemPrompt, scoreUserMessage } from "./score-prompts.ts";
import { stripHeader } from "./strip-header.ts";

const ScoreLabelsSchema = z.object({ labels: z.array(MatchLabelSchema), cvSeniority: JobExtractionSchema.shape.seniority });

function cvText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !["layout", "schemaVersion", "locale", "id"].includes(key) && !key.endsWith("Id"))
      .flatMap(([, entry]) => cvText(entry));
  }
  return [];
}

export async function scoreMatch(
  deps: { model: ModelDeps },
  input: { userId: string; cv: CvContent; job: JobExtraction; keptInferred: Set<string> },
): Promise<MatchScore> {
  const { cv } = stripHeader(input.cv);
  try {
    const { labels, cvSeniority } = await callModel(deps.model, {
      userId: input.userId,
      task: "tailor_score",
      tier: "cheap",
      schema: ScoreLabelsSchema,
      system: scoreSystemPrompt,
      user: scoreUserMessage(cv, input.job),
      maxOutputTokens: 12000,
    });
    const refs = new Set<string>();
    const requirements = new Set(input.job.requirements.map((_, index) => `r${index}`));
    const keywordSources = [...input.job.requirements.map((requirement) => requirement.text), ...input.job.responsibilities];
    for (const label of labels) {
      const key = label.ref.toLowerCase();
      const term = label.ref.slice(2);
      const valid = label.kind === "requirement"
        ? requirements.has(label.ref)
        : label.ref.startsWith("k:") && term.trim().length > 0
          && keywordSources.some((source) => source.includes(term));
      if (!valid || refs.has(key)) throw new Error("Invalid match label refs");
      refs.add(key);
    }
    if (![...requirements].every((ref) => refs.has(ref))) throw new Error("Missing requirement labels");
    if (keywordSources.some((source) => source.trim()) && !labels.some((label) => label.kind === "keyword")) {
      throw new Error("Missing keyword labels");
    }

    const text = cvText(cv);
    const checked = labels.map((label) => label.status === "missing" || !label.evidence?.trim() || !text.some((value) => value.includes(label.evidence ?? ""))
      ? { ...label, status: "missing" as const, evidence: null, inferred: false }
      : label);
    return computeMatchScore({ job: input.job, labels: checked, cvSeniority, keptInferred: input.keptInferred });
  } catch {
    throw new ApiError(502, "ai_failed", "The AI could not score this CV. Try again.");
  }
}

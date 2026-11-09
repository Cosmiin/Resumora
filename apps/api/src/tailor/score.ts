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

const FLUENT_NEED = /\b(fluent|advanced)\b/i;
const FLUENT_LEVEL = /\b(c1|c2|native|fluent|advanced)\b/i;
/** So a requirement naming a language the CV lacks ("Fluent English and German") is not met by English alone. */
const COMMON_LANGUAGES = ["English", "Romanian", "French", "German", "Spanish", "Italian", "Portuguese", "Dutch", "Polish",
  "Russian", "Ukrainian", "Hungarian", "Czech", "Slovak", "Bulgarian", "Greek", "Turkish", "Arabic", "Hebrew", "Chinese",
  "Mandarin", "Cantonese", "Japanese", "Korean", "Hindi", "Swedish", "Norwegian", "Danish", "Finnish", "Serbian", "Croatian"];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const names = (text: string, name: string) => new RegExp(`(^|[^\\p{L}])${escape(name)}([^\\p{L}]|$)`, "iu").test(text);
/** Owner's rule: C1/C2, Native, Fluent or Advanced meets a fluent/advanced requirement for every language it names. */
function fluentEvidence(requirement: string, languages: CvContent["languages"]): string | null {
  if (!FLUENT_NEED.test(requirement)) return null;
  const fluent = languages.filter((language) => language.name.trim() && FLUENT_LEVEL.test(language.level) && names(requirement, language.name.trim()));
  if (fluent.length === 0) return null;
  const covered = (name: string) => fluent.some((language) => language.name.trim().toLowerCase() === name.toLowerCase());
  const others = [...COMMON_LANGUAGES, ...languages.map((language) => language.name.trim()).filter(Boolean)];
  if (others.some((name) => names(requirement, name) && !covered(name))) return null;
  return fluent.map((language) => `${language.name.trim()} | ${language.level.trim()}`).join(" | ");
}

export async function scoreMatch(
  deps: { model: ModelDeps },
  /** keptInferredTexts: texts of inferred items the user kept; an inferred label quoting one counts in full. */
  input: { userId: string; cv: CvContent; job: JobExtraction; keptInferred: Set<string>; keptInferredTexts?: string[] },
): Promise<MatchScore> {
  const { cv } = stripHeader(input.cv);
  try {
    const { labels: reply, cvSeniority } = await callModel(deps.model, {
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
    const keywordSources = [...input.job.requirements.map((requirement) => requirement.text), ...input.job.responsibilities]
      .map((source) => source.toLowerCase());
    // A bad requirement ref fails the score; a bad or repeated keyword (e.g. one taken from the job title) is only dropped.
    const labels = reply.filter((label) => {
      const key = label.ref.toLowerCase();
      if (label.kind === "requirement") {
        if (!requirements.has(label.ref) || refs.has(key)) throw new Error("Invalid requirement label refs");
      } else {
        const term = key.slice(2).trim();
        if (!key.startsWith("k:") || !term || refs.has(key) || !keywordSources.some((source) => source.includes(term))) return false;
      }
      refs.add(key);
      return true;
    });
    if (![...requirements].every((ref) => refs.has(ref))) throw new Error("Missing requirement labels");
    if (keywordSources.some((source) => source.trim()) && !reply.some((label) => label.kind === "keyword")) {
      throw new Error("Missing keyword labels");
    }

    const text = cvText(cv);
    // One requirement can need several CV values ("English and Romanian"): each " | " part must be quoted from the CV.
    const parts = (evidence: string) => evidence.split(" | ").map((part) => part.trim());
    const quoted = (evidence: string) => parts(evidence).every((part) => part && text.some((value) => value.includes(part)));
    const checked = labels.map((label) => {
      // Only language requirements: "Advanced English and Excel skills" also needs Excel, which the rule can't check.
      const requirement = label.kind === "requirement" ? input.job.requirements[Number(label.ref.slice(1))]! : null;
      const fluent = requirement?.category === "language" ? fluentEvidence(requirement.text, cv.languages) : null;
      if (fluent) return { ...label, status: "met" as const, evidence: fluent, inferred: false };
      return label.status === "missing" || !label.evidence?.trim() || !quoted(label.evidence)
        ? { ...label, status: "missing" as const, evidence: null, inferred: false }
        : label;
    });
    const kept = new Set(input.keptInferred);
    for (const label of checked) {
      if (label.inferred && label.evidence && parts(label.evidence).some((part) => input.keptInferredTexts?.some((t) => t.includes(part)))) kept.add(label.ref);
    }
    return computeMatchScore({ job: input.job, labels: checked, cvSeniority, keptInferred: kept });
  } catch {
    throw new ApiError(502, "ai_failed", "The AI could not score this CV. Try again.");
  }
}

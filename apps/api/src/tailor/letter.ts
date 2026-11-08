import { z } from "zod";
import { CoverLetterSchema, type CoverLetter, type TailorFlag } from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import { ApiError } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import { checkProposal } from "./checks.ts";
import { letterSystemPrompt, letterUserMessage, letterVerifySystemPrompt } from "./letter-prompts.ts";
import type { TailorRepo } from "./repo.ts";
import { texts } from "./section-pass.ts";
import { stripHeader } from "./strip-header.ts";

const optional = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
export const LetterBodySchema = z.object({ whyCompany: optional(1000), hiringManager: optional(120) });
export const LetterEditSchema = z.object({
  body: CoverLetterSchema.shape.body,
  hiringManager: z.string().trim().max(120).nullable().optional(),
  whyCompany: z.string().trim().max(1000).nullable().optional(),
});
const ReplySchema = z.object({ body: z.string() });
const VerifySchema = z.object({ results: z.array(z.object({ itemId: z.string(), claims: z.array(z.string()) })) });

/**
 * Writes (or rewrites) the tailored CV's cover letter body and saves it. The header, the hiring manager's name
 * and the photo never go to the model: the app adds the header, greeting and signature itself. The body gets the
 * Task 14 checks; a flagged body is retried once and the flags still left are returned with the letter.
 */
export async function writeCoverLetter(
  deps: { model: ModelDeps; tailor: TailorRepo; jobs: JobRepo; now(): Date },
  input: { userId: string; id: string } & z.infer<typeof LetterBodySchema>,
): Promise<{ coverLetter: CoverLetter; flags: TailorFlag[] } | null> {
  const doc = await deps.tailor.readTailoredCv(input.id);
  if (!doc) return null;
  const job = await deps.jobs.get(doc.jobId);
  if (!job) return null;
  if (job.status !== "ready" || !job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
  const extracted = job.extracted;
  const cv = stripHeader(doc.content).cv;
  // The person's own words may back a number; the job's name, company and place may be named in prose.
  const sources = [...texts(cv), job.userThoughts ?? "", input.whyCompany ?? "", extracted.title, extracted.company ?? "",
    extracted.location ?? "", "I"];
  // Facts the ad states (its countries, tools, years asked for) may be named as facts about the job: the number and
  // name checks accept them, and the claim check gets them apart, so a claim about the candidate still needs the CV.
  const jobText = [extracted.summary, ...extracted.responsibilities, ...extracted.requirements.map((r) => r.text), ...extracted.benefits]
    .filter((text) => text?.trim());

  async function attempt(retry: { body: string; flags: TailorFlag[] } | null) {
    const { body } = await callModel(deps.model, {
      userId: input.userId, task: "tailor_letter", tier: "strong", schema: ReplySchema, system: letterSystemPrompt,
      user: letterUserMessage({ cv, job: extracted, language: doc!.language, thoughts: job!.userThoughts, whyCompany: input.whyCompany, retry }),
      maxOutputTokens: 4000,
    });
    const text = body.trim();
    if (!text || text.length > CoverLetterSchema.shape.body.maxLength!) throw new Error("bad letter");
    const verified = await callModel(deps.model, {
      userId: input.userId, task: "tailor_verify", tier: "cheap", schema: VerifySchema, system: letterVerifySystemPrompt,
      user: JSON.stringify({ sources, job: jobText, proposals: [{ itemId: "letter", text, before: null }] }), maxOutputTokens: 2000,
    });
    // German capitalises every noun, so only the number check applies there (as for translations).
    const flags = [
      ...checkProposal({ itemId: "letter", field: "body", text, inferred: doc!.language === "de", flags: [] }, { sources: [...sources, ...jobText] }),
      ...verified.results.flatMap((result) => result.claims).map((detail) => ({ rule: "achievement" as const, detail })),
    ];
    return { body: text, flags };
  }

  let result: { body: string; flags: TailorFlag[] };
  try {
    result = await attempt(null);
    if (result.flags.length > 0) result = await attempt(result);
  } catch {
    throw new ApiError(502, "ai_failed", "Couldn't write the cover letter. Try again.");
  }
  const coverLetter: CoverLetter = {
    body: result.body, hiringManager: input.hiringManager ?? null, whyCompany: input.whyCompany ?? null,
    generatedAt: deps.now().toISOString(),
  };
  if (!(await deps.tailor.setCoverLetter(doc.id, coverLetter))) return null;
  return { coverLetter, flags: result.flags };
}

/** Saves the person's edits to an existing letter. null when the tailored CV is gone. */
export async function editCoverLetter(
  tailor: TailorRepo, id: string, edit: z.infer<typeof LetterEditSchema>,
): Promise<CoverLetter | null> {
  const doc = await tailor.readTailoredCv(id);
  if (!doc) return null;
  if (!doc.coverLetter) throw new ApiError(409, "no_letter", "Write the cover letter first.");
  const coverLetter: CoverLetter = {
    ...doc.coverLetter, body: edit.body,
    ...(edit.hiringManager !== undefined ? { hiringManager: edit.hiringManager || null } : {}),
    ...(edit.whyCompany !== undefined ? { whyCompany: edit.whyCompany || null } : {}),
  };
  return (await tailor.setCoverLetter(id, coverLetter)) ? coverLetter : null;
}

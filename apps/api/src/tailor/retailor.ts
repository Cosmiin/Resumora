import { z } from "zod";
import { TAILOR_SECTIONS, TailorSectionSchema, type TailorRun } from "@resumora/shared";
import { ApiError } from "../errors.ts";
import type { JobRepo } from "../jobs/repo.ts";
import type { TailorRepo } from "./repo.ts";
import { jobNotFound } from "./start.ts";

export const RetailorBodySchema = z.object({ sections: z.array(TailorSectionSchema).min(1).max(TAILOR_SECTIONS.length * 2) });

/**
 * A new run over only the picked sections of an existing tailored CV, in the usual section order. It uses the
 * same question, pass and accept routes; accept only writes its own section's items, so the rest stays as it is.
 * null when the tailored CV is gone.
 */
export async function startRetailor(
  deps: { jobs: JobRepo; tailor: TailorRepo },
  tailoredCvId: string,
  picked: z.infer<typeof RetailorBodySchema>["sections"],
): Promise<{ run: TailorRun } | null> {
  const doc = await deps.tailor.readTailoredCv(tailoredCvId);
  if (!doc) return null;
  const job = await deps.jobs.get(doc.jobId);
  if (!job) throw jobNotFound();
  if (job.status !== "ready" || !job.extracted) throw new ApiError(409, "job_not_ready", "This job isn't ready yet.");
  const sections = TAILOR_SECTIONS.filter((section) => picked.includes(section));
  const run = await deps.tailor.createRun({
    jobId: doc.jobId, tailoredCvId, kind: sections.length === 1 ? "section" : "retailor", sections, currentSection: sections[0]!,
    roleOrder: sections.includes("experience") ? doc.content.experience.map((role) => role.id) : [],
  });
  return { run };
}

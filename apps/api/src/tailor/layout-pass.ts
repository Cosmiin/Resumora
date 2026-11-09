import { z } from "zod";
import { MAX_TEXT, type CvContent, type JobExtraction, type Proposal, type TailorRun } from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import { ApiError } from "../errors.ts";
import { LAYOUT_ITEMS } from "./accept.ts";
import type { TailorRepo } from "./repo.ts";
import { steeringText } from "./steering.ts";
import { stripHeader } from "./strip-header.ts";
import { jobNotFound } from "./start.ts";

const LayoutReplySchema = z.object({ order: z.array(z.string()), headline: z.string() });

const layoutSystemPrompt = [
  "You finish tailoring a CV to a job. Return JSON with two fields.",
  "order: every section key from `order`, each exactly once, most relevant to the job first.",
  "headline: a short job-title headline aimed at the job (at most 8 words, not a sentence, no full stop), using only words that already appear in the CV.",
  "Never add an employer, job title, seniority or skill the CV doesn't have. If nothing fits, return the current headline.",
  "Let `steering` (the person's tone, what draws them and the roles to lean on) guide the order and headline when it doesn't break these rules.",
].join("\n");

export function layoutUserMessage(input: { order: string[]; headline: string; job: JobExtraction; cv: CvContent; steering: string }): string {
  return JSON.stringify({
    order: input.order, headline: input.headline, steering: input.steering,
    job: { title: input.job.title, requirements: input.job.requirements }, cv: { ...input.cv, layout: undefined },
  });
}

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}+#.]+/gu)?.map((w) => w.replace(/\.+$/, "")).filter(Boolean) ?? [];

function cvWords(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") for (const word of words(value)) into.add(word);
  else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (!["id", "layout", "schemaVersion", "locale", "photo"].includes(key) && !key.endsWith("Id")) cvWords(entry, into);
    }
  }
  return into;
}

/** The last step: section order plus a headline closer to the job title, built only from the CV's own words. */
export async function runLayoutPass(
  deps: { model: ModelDeps; tailor: TailorRepo },
  input: { userId: string; run: TailorRun; job: JobExtraction },
): Promise<{ proposals: Proposal[]; questions: [] }> {
  const { run } = input;
  if (run.status === "done" || run.currentSection !== "layout") {
    throw new ApiError(409, "section_not_current", "This section isn't the current step.");
  }
  const doc = run.tailoredCvId ? await deps.tailor.getTailoredCv(run.tailoredCvId) : null;
  if (!doc) throw jobNotFound();
  const cv = stripHeader(doc.content).cv;
  const order = cv.layout.order;
  const headline = cv.basics.titles[0] ?? "";
  const stored = await deps.tailor.getSteering(doc.id);

  let reply: z.infer<typeof LayoutReplySchema>;
  try {
    reply = await callModel(deps.model, {
      userId: input.userId, task: "tailor_section", tier: "strong", schema: LayoutReplySchema, system: layoutSystemPrompt,
      user: layoutUserMessage({ order, headline, job: input.job, cv, steering: steeringText(stored?.steering ?? {}, cv) }),
      maxOutputTokens: 2000,
    });
  } catch {
    throw new ApiError(502, "ai_failed", "Couldn't tailor layout. Try again.");
  }

  const proposals: Proposal[] = [];
  const same = reply.order.length === order.length && new Set(reply.order).size === order.length
    && reply.order.every((key) => (order as string[]).includes(key));
  if (same && reply.order.some((key, i) => key !== order[i])) {
    proposals.push({ itemId: "layout", field: "order", text: reply.order.join(","), inferred: false, flags: [] });
  }
  const text = reply.headline.trim().replace(/\s+/g, " ");
  const known = cvWords(cv);
  // A headline is a job title, not a sentence: too long or ending like one, and the existing title stays.
  const short = text.length <= Math.min(MAX_TEXT, 80) && text.split(" ").length <= 8 && !/[.!?;]$/.test(text);
  if (text && short && text !== headline && words(text).every((word) => known.has(word))) {
    proposals.push({ itemId: "headline", field: "title", text, inferred: false, flags: [] });
  }

  await deps.tailor.updateRun(run.id, {
    status: "waiting_user",
    proposals: [...(run.proposals ?? []).filter((p) => !LAYOUT_ITEMS.includes(p.itemId)), ...proposals],
  });
  return { proposals, questions: [] };
}

import { z } from "zod";
import { MAX_TEXT, type JobExtraction, type Proposal, type TailorRun } from "@resumora/shared";
import { callModel, type ModelDeps } from "../ai/call-model.ts";
import { ApiError } from "../errors.ts";
import { LAYOUT_ITEMS } from "./accept.ts";
import type { TailorRepo } from "./repo.ts";
import { stripHeader } from "./strip-header.ts";
import { jobNotFound } from "./start.ts";

const LayoutReplySchema = z.object({ order: z.array(z.string()), headline: z.string() });

const layoutSystemPrompt = [
  "You finish tailoring a CV to a job. Return JSON with two fields.",
  "order: every section key from `order`, each exactly once, most relevant to the job first.",
  "headline: the CV's headline moved closer to the job title, using only words that already appear in the CV.",
  "Never add an employer, job title, seniority or skill the CV doesn't have. If nothing fits, return the current headline.",
].join("\n");

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

  let reply: z.infer<typeof LayoutReplySchema>;
  try {
    reply = await callModel(deps.model, {
      userId: input.userId, task: "tailor_layout", tier: "strong", schema: LayoutReplySchema, system: layoutSystemPrompt,
      user: JSON.stringify({ order, headline, job: { title: input.job.title, requirements: input.job.requirements }, cv: { ...cv, layout: undefined } }),
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
  if (text && text.length <= MAX_TEXT && text !== headline && words(text).every((word) => known.has(word))) {
    proposals.push({ itemId: "headline", field: "title", text, inferred: false, flags: [] });
  }

  await deps.tailor.updateRun(run.id, {
    status: "waiting_user",
    proposals: [...(run.proposals ?? []).filter((p) => !LAYOUT_ITEMS.includes(p.itemId)), ...proposals],
  });
  return { proposals, questions: [] };
}

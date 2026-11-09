import { z } from "zod";
import { applyGuesses, CvContentSchema, MAX_TEXT, scoredItems, type CvContent, type TailoredCv } from "@resumora/shared";
import { ApiError } from "../errors.ts";
import type { ItemReview } from "./accept.ts";
import type { TailorRepo } from "./repo.ts";

export const ReviewItemBodySchema = z.object({
  section: z.string().min(1).max(40),
  key: z.string().min(1).max(MAX_TEXT),
  action: z.enum(["keep", "remove", "edit"]),
  text: z.string().trim().min(1).max(MAX_TEXT).optional(),
  version: z.number().int().min(1),
}).refine((body) => body.action !== "edit" || body.text !== undefined, { message: "Edit needs the new text." });
export type ReviewItemBody = z.infer<typeof ReviewItemBodySchema>;

const changed = () => new ApiError(409, "item_changed", "This item changed since it was tailored. Reload and try again.");

/** Items with a stable id and their text fields: roles, projects and volunteering with their bullets, skills, awards, languages. */
function itemsOf(cv: CvContent): Array<Record<string, unknown> & { id: string }> {
  const roles = scoredItems(cv).map(({ item }) => item);
  return [...roles, ...roles.flatMap((role) => role.bullets), ...cv.technicalSkills, ...cv.professionalSkills,
    ...cv.awards, ...cv.languages] as Array<Record<string, unknown> & { id: string }>;
}
/** The text field of an item whose value is the reviewed text (the field the tailoring wrote). */
function fieldOf(item: Record<string, unknown>, text: string): string | undefined {
  return Object.keys(item).find((field) => field !== "id" && item[field] === text);
}

/**
 * The guided review's decision on one reviewed item (GuideA): marks it reviewed, and
 * remove puts the Base wording back (or drops a new skill), edit saves the typed text.
 * Same version check as the editor: a stale version is 409 version_conflict.
 */
export async function reviewItem(tailor: TailorRepo, id: string, body: ReviewItemBody): Promise<TailoredCv | null> {
  const doc = await tailor.readTailoredCv(id);
  if (!doc) return null;
  const conflict = () => new ApiError(409, "version_conflict", "This tailored CV was saved somewhere else first.");
  if (doc.version !== body.version) throw conflict();
  const review = structuredClone((doc.review ?? {}) as Record<string, Record<string, ItemReview>>);
  // Own entries only: a key like "__proto__" or "toString" must never reach the object's prototype.
  const items = Object.hasOwn(review, body.section) ? review[body.section] : undefined;
  const item = items && typeof items === "object" && Object.hasOwn(items, body.key) ? items[body.key] : undefined;
  if (!item || typeof item !== "object") throw new ApiError(404, "not_found", "This item isn't in the review.");
  const content = structuredClone(doc.content);
  const next: ItemReview = { ...item, reviewed: true };
  const keep = body.action !== "remove";
  const text = body.action === "edit" ? body.text! : item.text;

  if (body.key.startsWith("summary#")) {
    // A guessed phrase of the summary: cut it out, or put the typed text in its place.
    if (body.action !== "keep") {
      if (!content.basics.summary.includes(item.text)) throw changed();
      content.basics.summary = applyGuesses(content.basics.summary, [{ text: item.text, reason: item.reason ?? "" }], [{ keep, text }]);
    }
  } else if (body.key.startsWith("new-skill:")) {
    const name = item.text.trim().toLowerCase();
    const lists = [content.technicalSkills, content.professionalSkills];
    const skill = lists.flatMap((list) => list).find((s) => s.name.trim().toLowerCase() === name);
    if (body.action !== "keep" && !skill) throw changed();
    // A skill the Base CV already has isn't new: Remove leaves it in place.
    const inBase = [...doc.baseSnapshot.technicalSkills, ...doc.baseSnapshot.professionalSkills].some((s) => s.name.trim().toLowerCase() === name);
    if (body.action === "remove" && !inBase) for (const list of lists) list.splice(0, list.length, ...list.filter((s) => s !== skill));
    if (body.action === "edit") skill!.name = text;
  } else if (body.key === "summary") {
    if (body.action !== "keep") content.basics.summary = keep ? text : doc.baseSnapshot.basics.summary;
  } else if (body.action !== "keep") {
    const target = itemsOf(content).find((i) => i.id === body.key);
    const field = target && fieldOf(target, item.text);
    if (!target || !field) throw changed();
    const original = itemsOf(doc.baseSnapshot).find((i) => i.id === body.key)?.[field];
    target[field] = keep ? text : typeof original === "string" ? original : target[field];
  }

  next.kept = keep;
  next.text = text;
  const section = items!;
  if (body.key.startsWith("new-skill:") && body.action === "edit") {
    // A new skill is reviewed by its name: the edited name is its key now.
    delete section[body.key];
    section[`new-skill:${text}`] = next;
  } else section[body.key] = next;

  // Same limits as the editor's save (an edited phrase can make the summary too long).
  const parsed = CvContentSchema.safeParse(content);
  if (!parsed.success) throw new ApiError(400, "invalid_content", "This text is too long for the CV.");
  if (await tailor.saveTailoredCv(doc.id, doc.version, { content: parsed.data, review, score: doc.score }) === "conflict") throw conflict();
  return tailor.readTailoredCv(doc.id);
}

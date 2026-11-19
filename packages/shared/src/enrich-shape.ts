import { z } from "zod";
import { MAX_LONG_TEXT, MAX_TEXT, type Experience } from "./cv.ts";
import { CONCISE_CHARS, RoleResultSchema, type RoleResult } from "./enrich.ts";
import { numbersIn } from "./enrich-checks.ts";

const id = z.string().min(1).max(64);

/**
 * One change to a role (score/9): a line's new text, a new line, the description, a line removed, or a new line order.
 * The browser and the server apply the same list with `applyChanges`, so both reach the same fingerprint.
 */
export const ChangeSchema = z.discriminatedUnion("kind", [
  z.object({ id, kind: z.literal("bullet"), bulletId: id, text: z.string().min(1).max(MAX_TEXT) }).strict(),
  z.object({ id, kind: z.literal("new"), text: z.string().min(1).max(MAX_TEXT) }).strict(),
  z.object({ id, kind: z.literal("description"), text: z.string().max(MAX_LONG_TEXT) }).strict(),
  z.object({ id, kind: z.literal("remove"), bulletId: id }).strict(),
  z.object({ id, kind: z.literal("order"), ids: z.array(id).max(40) }).strict(),
]);
export type Change = z.infer<typeof ChangeSchema>;

/**
 * The role with the changes applied, in list order. A new line takes the change's id and goes last; an order change
 * puts the named lines first, in that order, and keeps the others after them; changes to lines that aren't there are
 * ignored. Pure: the input role is not touched.
 */
export function applyChanges(role: Experience, changes: readonly Change[]): Experience {
  let bullets = role.bullets.map((b) => ({ ...b }));
  let description = role.description;
  for (const change of changes) {
    if (change.kind === "bullet") bullets = bullets.map((b) => (b.id === change.bulletId ? { ...b, text: change.text } : b));
    else if (change.kind === "new") {
      if (!bullets.some((b) => b.id === change.id)) bullets.push({ id: change.id, text: change.text });
    } else if (change.kind === "remove") bullets = bullets.filter((b) => b.id !== change.bulletId);
    else if (change.kind === "description") description = change.text;
    else {
      const named = [...new Set(change.ids)].flatMap((wanted) => bullets.filter((b) => b.id === wanted));
      const namedIds = new Set(named.map((b) => b.id));
      bullets = [...named, ...bullets.filter((b) => !namedIds.has(b.id))];
    }
  }
  return { ...role, description, bullets };
}

/** Every number of the original lines is still in the new text (read with `numbersIn`, so 10–20% equals 10-20%). */
export function keepsNumbers(originals: readonly string[], text: string): boolean {
  const kept = new Set(numbersIn(text));
  return originals.every((o) => numbersIn(o).every((n) => kept.has(n)));
}

const real = (result: RoleResult) => result.bullets.filter((b) => b.issue !== "example" && b.issue !== "duplicate");

/**
 * The line to move to the top: the real line with a clear result and the highest grade. Null when the first real line
 * already has a clear result, or no line has one.
 */
export function strongestFirst(role: Experience, result: RoleResult): string | null {
  const lines = real(result).filter((b) => role.bullets.some((x) => x.id === b.id && x.text.trim() !== ""));
  if (lines.length === 0 || lines[0]!.impact === "specific") return null;
  const best = lines.filter((b) => b.impact === "specific").sort((a, b) => b.score - a.score)[0];
  return best?.id ?? null;
}

/** Shape aims at 6 lines: a role needs it above 6 lines, or when a line repeats another. */
export const SHAPE_TARGET = 6;
export function needsShape(role: Experience, result: RoleResult | undefined): boolean {
  if (role.bullets.filter((b) => b.text.trim() !== "").length > SHAPE_TARGET) return true;
  return !!result?.bullets.some((b) => b.issue === "duplicate");
}

/** POST /v1/enrich/shape. */
export const ShapeBodySchema = z.object({ roleId: id, fingerprint: z.string().min(1).max(64) }).strict();
export type ShapeBody = z.infer<typeof ShapeBodySchema>;
export const ShapeAnswerSchema = z.object({
  merges: z.array(z.object({ ids: z.array(id).min(2).max(6), text: z.string().min(1).max(CONCISE_CHARS.partial) }).strict()).max(4),
}).strict();
export type ShapeAnswer = z.infer<typeof ShapeAnswerSchema>;

/**
 * POST /v1/enrich/check-changes: grade only the lines a change touches, hold a change that would lower the score
 * (with `hold`), and store the predicted result under the new fingerprint.
 */
export const CheckChangesBodySchema = z.object({
  roleId: id, fingerprint: z.string().min(1).max(64), changes: z.array(ChangeSchema).max(30), hold: z.boolean(),
}).strict();
export type CheckChangesBody = z.infer<typeof CheckChangesBodySchema>;
/** For a held change: the question that would bring its line to the top grade, from the same grading (score/12). */
export const HeldAskSchema = z.object({
  changeId: id, text: z.string(), options: z.array(z.string()), amounts: z.array(z.string()).optional(),
}).strict();
export type HeldAsk = z.infer<typeof HeldAskSchema>;
export const CheckChangesAnswerSchema = z.object({
  result: RoleResultSchema, kept: z.array(id), held: z.array(ChangeSchema), asks: z.array(HeldAskSchema).default([]),
}).strict();
export type CheckChangesAnswer = z.infer<typeof CheckChangesAnswerSchema>;

/**
 * POST /v1/enrich/use-answers: after the rewrites, place each fact from this round's answers that is still missing from
 * the page. `changes` are the role's prepared changes; `questions` are this round's note questions.
 */
export const UseAnswersBodySchema = z.object({
  roleId: id, fingerprint: z.string().min(1).max(64), changes: z.array(ChangeSchema).max(30),
  questions: z.array(z.string().min(1).max(MAX_TEXT)).max(20),
}).strict();
export type UseAnswersBody = z.infer<typeof UseAnswersBodySchema>;
/** Only line rewrites, new lines and the description; a `bullet` change holds the line's whole new text. */
export const UseAnswersAnswerSchema = z.object({
  changes: z.array(ChangeSchema.refine((c) => c.kind === "bullet" || c.kind === "new" || c.kind === "description")),
}).strict();
export type UseAnswersAnswer = z.infer<typeof UseAnswersAnswerSchema>;

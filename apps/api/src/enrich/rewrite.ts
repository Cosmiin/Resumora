import { PROPOSAL_MAX, fingerprint, hasUnknownNumber, type CvContent, type DropReason, type Experience, type Note, type RewriteEvent } from "@resumora/shared";
import { AiUnavailableError } from "../ai/call-model.ts";
import { AiStreamBrokenError } from "../ai/stream-model.ts";
import { BlockParser, type BlockEvent } from "./blocks.ts";
import type { InsightsRepo } from "./repo.ts";

const squash = (s: string) => s.trim().replace(/\s+/g, " ");

/** Texts whose numbers a proposal may repeat: the role's own words and the person's answers. */
export function roleSources(role: Experience): string[] {
  return [role.title, role.description, ...role.bullets.map((b) => b.text), ...role.notes.flatMap((n) => [n.question, n.answer])];
}

/** The current summary and all of every role's text. */
export function summarySources(cv: CvContent): string[] {
  return [
    cv.basics.summary,
    ...cv.experience.flatMap((r) => [r.title, r.company, r.startDate, r.endDate, ...r.bullets.map((b) => b.text), ...r.notes.flatMap((n) => [n.question, n.answer])]),
  ];
}

/**
 * The spec's rewrite checks for one finished proposal of a role.
 * `keepAsIs` holds the ids of bullets that already score 100.
 */
export function checkProposal(
  role: Experience,
  key: string,
  text: string,
  notes: Note[],
  keepAsIs: ReadonlySet<string> = new Set(),
): "ok" | DropReason {
  const original = key === "new" ? undefined : role.bullets.find((b) => b.id === key);
  if (key !== "new" && !original) return "unknownBullet";
  if (key === "new" && notes.length === 0) return "newWithoutNote";
  const clean = squash(text);
  if (!clean || (original && (keepAsIs.has(key) || squash(original.text) === clean))) return "unchanged";
  if (clean.length > PROPOSAL_MAX) return "length";
  if (hasUnknownNumber(clean, roleSources(role))) return "number";
  return "ok";
}

/** The same checks for the summary: one block, keyed `summary`. */
export function checkSummary(cv: CvContent, key: string, text: string): "ok" | DropReason {
  if (key !== "summary") return "unknownBullet";
  const clean = squash(text);
  if (!clean || clean === squash(cv.basics.summary)) return "unchanged";
  if (hasUnknownNumber(clean, summarySources(cv))) return "number";
  return "ok";
}

/** Ids of the role's bullets that the saved score puts at 100. Used only when that score is for this exact text. */
export async function keepAsIsIds(role: Experience, locale: CvContent["locale"], insights: InsightsRepo): Promise<Set<string>> {
  const cached = await insights.get(role.id);
  if (!cached || cached.fingerprint !== fingerprint(role, locale)) return new Set();
  return new Set(cached.bullets.filter((b) => b.score === 100).map((b) => b.id));
}

type Check = (key: string, text: string) => "ok" | DropReason;

/**
 * Turns the model's text into rewrite events. Text is shown live as `delta`; a finished block is
 * `ready` only when it passes `check`. A broken or unavailable stream ends in an `error` event.
 * Always finishes with `done`.
 */
export async function* rewriteEvents(chunks: AsyncIterable<string>, check: Check): AsyncGenerator<RewriteEvent> {
  const parser = new BlockParser();
  const keys = new Map<number, string>();
  const translate = function* (events: BlockEvent[]): Generator<RewriteEvent> {
    for (const e of events) {
      if (e.type === "start") {
        keys.set(e.index, e.key);
        yield { event: "start", data: { index: e.index, replaces: e.key === "new" ? null : e.key } };
      } else if (e.type === "delta") {
        yield { event: "delta", data: { index: e.index, text: e.text } };
      } else {
        const verdict = check(keys.get(e.index)!, e.text);
        yield verdict === "ok"
          ? { event: "ready", data: { index: e.index, text: squash(e.text) } }
          : { event: "dropped", data: { index: e.index, reason: verdict } };
      }
    }
  };
  try {
    for await (const chunk of chunks) yield* translate(parser.push(chunk));
    yield* translate(parser.end());
  } catch (err) {
    if (err instanceof AiStreamBrokenError) {
      yield { event: "error", data: { code: "stream_broken", message: "The rest didn't come through. Try again." } };
    } else if (err instanceof AiUnavailableError) {
      yield { event: "error", data: { code: "ai_unavailable", message: "The AI service is unavailable right now. Try again soon." } };
    } else {
      yield { event: "error", data: { code: "internal", message: "Something went wrong. Please try again." } };
    }
  }
  yield { event: "done", data: {} };
}

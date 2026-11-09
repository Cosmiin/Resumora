import { z } from "zod";
import {
  BrainDumpAnswerSchema,
  ItemLinesAnswerSchema,
  type ItemLinesAnswer,
  type ItemLinesBody,
  ImproveAnswerSchema,
  RewriteEventSchemas,
  AchievementsAnswerSchema,
  RoleDescriptionAnswerSchema,
  RoleFactsAnswerSchema,
  RoleResultSchema,
  type BrainDumpAnswer,
  type ImproveAnswer,
  type RewriteEvent,
  type AchievementsAnswer,
  type RoleDescriptionAnswer,
  type RoleFactsAnswer,
  type RoleResult,
} from "@resumora/shared";
import { ApiClientError, apiFetch, authedFetch, errorOf } from "../../lib/api.ts";

const ScoresSchema = z.object({ items: z.array(RoleResultSchema) });

/** The scores the server already has for the saved CV. */
export async function getScores(): Promise<RoleResult[]> {
  return (await apiFetch("/v1/enrich/scores", { schema: ScoresSchema })).items;
}

/**
 * Scores one role of the saved CV. 409 `not_saved`: the role isn't saved yet, or its text has moved on.
 * fresh: ask the AI again with the notes in view (after "Tell us about…"), instead of the stored result.
 */
export function scoreRole(roleId: string, fingerprint: string, fresh?: boolean): Promise<RoleResult> {
  return apiFetch("/v1/enrich/score", { method: "POST", json: fresh ? { roleId, fingerprint, fresh } : { roleId, fingerprint }, schema: RoleResultSchema });
}

export function improveBullet(input: { roleId: string; bulletId: string; fingerprint: string }): Promise<ImproveAnswer> {
  return apiFetch("/v1/enrich/improve-bullet", { method: "POST", json: input, schema: ImproveAnswerSchema });
}

export function brainDump(input: { roleId: string; fingerprint: string; source?: "answers" }): Promise<BrainDumpAnswer> {
  return apiFetch("/v1/enrich/brain-dump", { method: "POST", json: input, schema: BrainDumpAnswerSchema });
}

export function roleFacts(roleId: string): Promise<RoleFactsAnswer> {
  return apiFetch("/v1/enrich/role-facts", { method: "POST", json: { roleId }, schema: RoleFactsAnswerSchema });
}

/** A two-sentence introduction for the role (3B); empty text means skip the step. */
export function roleDescription(input: { roleId: string; fingerprint: string }): Promise<RoleDescriptionAnswer> {
  return apiFetch("/v1/enrich/role-description", { method: "POST", json: input, schema: RoleDescriptionAnswerSchema });
}

const VoiceSessionSchema = z.object({ clientSecret: z.string().min(1), expiresAt: z.string(), model: z.string() });
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;

/**
 * A short-lived OpenAI key for one live voice answer. Never log or store `clientSecret`.
 * 429 `voice_limit`: today's voice answers are used up. 503 `ai_unavailable`: voice is down.
 */
export function createVoiceSession(): Promise<VoiceSession> {
  return apiFetch("/v1/enrich/voice-session", { method: "POST", schema: VoiceSessionSchema });
}

const BROKEN = { code: "stream_broken", message: "The stream stopped before it finished." };

/** One `event:` / `data:` frame, checked against the shared schemas. Anything else is null. */
function parseFrame(frame: string): RewriteEvent | null {
  let name = "";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue; // blank lines and ":" comments
    const field = line.slice(0, colon);
    const value = line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") name = value;
    else if (field === "data") data.push(value);
  }
  if (!Object.hasOwn(RewriteEventSchemas, name)) return null;
  const event = name as RewriteEvent["event"];
  let json: unknown;
  try {
    json = JSON.parse(data.join("\n"));
  } catch {
    return null;
  }
  const parsed = RewriteEventSchemas[event].safeParse(json);
  return parsed.success ? ({ event, data: parsed.data } as RewriteEvent) : null;
}

async function readRewrite(path: string, body: unknown, emit: (e: RewriteEvent) => void, signal: AbortSignal) {
  let res: Response;
  try {
    res = await authedFetch(path, { method: "POST", json: body, signal, headers: { accept: "text/event-stream" } });
  } catch (err) {
    const e = err instanceof ApiClientError ? err : new ApiClientError(0, "network", "Can't reach Resumora.");
    return emit({ event: "error", data: { code: e.code, message: e.message } });
  }
  if (!res.ok || !res.body) {
    const json: unknown = await res.json().catch(() => null);
    return emit({ event: "error", data: errorOf(res.status, json) });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
        const event = parseFrame(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (!event) continue; // an invalid event is skipped, not fatal
        emit(event);
        if (event.event === "done" || event.event === "error") return;
      }
    }
  } catch {
    return emit({ event: "error", data: BROKEN });
  }
  emit({ event: "error", data: BROKEN }); // ended without `done`
}

/**
 * Streams a rewrite (`/v1/enrich/rewrite-summary`) as the signed-in user.
 * Every event is checked against the shared schemas. A failure before the stream is an `error` event
 * with the server's code; a break after it is `error` with code `stream_broken`. Aborting is silent.
 */
export function streamRewrite(path: string, body: unknown, onEvent: (e: RewriteEvent) => void): AbortController {
  const controller = new AbortController();
  const { signal } = controller;
  const emit = (e: RewriteEvent) => {
    if (!signal.aborted) onEvent(e);
  };
  void readRewrite(path, body, emit, signal);
  return controller;
}

const SkillGroupSchema = z.enum(["technicalSkills", "professionalSkills"]);
const SkillsAnswerSchema = z.object({
  suggestions: z.array(z.object({ name: z.string(), group: SkillGroupSchema, evidence: z.string() })),
  sort: z.array(z.object({ skillId: z.string(), group: SkillGroupSchema })),
});
export type SkillsAnswer = z.infer<typeof SkillsAnswerSchema>;

/**
 * Skills the saved roles show (each with the line it came from), and a group for each skill still to sort.
 * 503 `ai_unavailable`: the AI is down. 502 `ai_bad_answer`: its answer couldn't be used.
 */
export function getSkillSuggestions(): Promise<SkillsAnswer> {
  return apiFetch("/v1/enrich/skills", { method: "POST", json: {}, schema: SkillsAnswerSchema });
}

/** Key achievements suggestions (4A) from the saved CV's roles: up to 5, each naming its role. */
export function suggestAchievements(): Promise<AchievementsAnswer> {
  return apiFetch("/v1/enrich/achievements", { method: "POST", json: {}, schema: AchievementsAnswerSchema });
}

/** Suggested lines for one saved course, award, publication or interest (3B); none means skip the picks. */
export function itemLines(input: ItemLinesBody): Promise<ItemLinesAnswer> {
  return apiFetch("/v1/enrich/item-lines", { method: "POST", json: input, schema: ItemLinesAnswerSchema });
}

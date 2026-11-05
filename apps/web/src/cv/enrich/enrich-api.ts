import { z } from "zod";
import { RoleResultSchema, type RoleResult } from "@resumora/shared";
import { apiFetch } from "../../lib/api.ts";

const ScoresSchema = z.object({ items: z.array(RoleResultSchema) });

/** The scores the server already has for the saved CV. */
export async function getScores(): Promise<RoleResult[]> {
  return (await apiFetch("/v1/enrich/scores", { schema: ScoresSchema })).items;
}

/** Scores one role of the saved CV. 409 `not_saved`: the role isn't saved yet, or its text has moved on. */
export function scoreRole(roleId: string, fingerprint: string): Promise<RoleResult> {
  return apiFetch("/v1/enrich/score", { method: "POST", json: { roleId, fingerprint }, schema: RoleResultSchema });
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

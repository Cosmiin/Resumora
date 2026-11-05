/*
 * Live voice answers: the browser gets a short-lived OpenAI key and streams the microphone straight
 * to OpenAI. Confirmed against the live API on 2026-11-05 (see Task 9 probe).
 *
 * Create the key (server side, Bearer = our OpenAI key):
 *   POST https://api.openai.com/v1/realtime/client_secrets
 *   { "expires_after": { "anchor": "created_at", "seconds": 60 },
 *     "session": { "type": "transcription",
 *       "audio": { "input": {
 *         "transcription": { "model": "gpt-4o-mini-transcribe", "language": "en" | "ro" },
 *         "turn_detection": { "type": "server_vad" } } } } }
 *   Answer: { value: "ek_...", expires_at: <unix seconds>, session: {...} }. Use the top-level
 *   expires_at (session.expires_at is 0). The old /v1/realtime/transcription_sessions returns 404.
 *   expires_after only limits how long the key can START a session; the 60 s recording cap is
 *   enforced in the browser.
 *
 * Browser connection:
 *   new WebSocket("wss://api.openai.com/v1/realtime?intent=transcription",
 *                 ["realtime", "openai-insecure-api-key." + clientSecret])
 *
 * Server events: conversation.item.input_audio_transcription.delta   (partial text in `delta`)
 *                conversation.item.input_audio_transcription.completed (final text in `transcript`)
 * Audio: PCM16 mono 24 kHz little-endian, base64, sent as { type: "input_audio_buffer.append", audio }.
 */
import { VOICE } from "@resumora/shared";
import type { AiCallLog } from "./call-model.ts";

export const VOICE_TASK = "enrich_voice";
const ENDPOINT = "https://api.openai.com/v1/realtime/client_secrets";

export type VoiceDeps = {
  fetch: typeof fetch;
  /** Our real OpenAI key. Used here only; never part of the result. */
  apiKey: string;
  logCall(entry: AiCallLog): Promise<void>;
};

export type VoiceSession = { clientSecret: string; expiresAt: string; model: string };

/** OpenAI refused or could not be reached. The route turns this into 503 `ai_unavailable`. */
export class VoiceUnavailableError extends Error {
  constructor() {
    super("The voice service is unavailable right now.");
  }
}

export async function createVoiceSession(
  deps: VoiceDeps,
  { userId, locale }: { userId: string; locale: "en" | "ro" },
): Promise<VoiceSession> {
  const started = Date.now();
  const log = async (status: "ok" | "error", error?: string) => {
    try {
      await deps.logCall({ userId, task: VOICE_TASK, provider: "openai", model: VOICE.model, status, error, durationMs: Date.now() - started });
    } catch {
      // A failed log must not break the answer.
    }
  };
  try {
    const res = await deps.fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${deps.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: VOICE.maxSeconds },
        session: {
          type: "transcription",
          audio: {
            input: {
              transcription: { model: VOICE.model, language: locale },
              turn_detection: { type: "server_vad" },
            },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI answered ${res.status}`);
    const body = (await res.json()) as { value?: unknown; expires_at?: unknown };
    if (typeof body.value !== "string" || typeof body.expires_at !== "number") throw new Error("OpenAI answer had no key");
    await log("ok");
    return { clientSecret: body.value, expiresAt: new Date(body.expires_at * 1000).toISOString(), model: VOICE.model };
  } catch (e) {
    await log("error", e instanceof Error ? e.message : "unknown error");
    throw new VoiceUnavailableError();
  }
}

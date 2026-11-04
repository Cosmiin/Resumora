import { isUuid } from "@resumora/contracts/jobs/connected";
import { decodeDraft } from "@resumora/contracts/editor/transport";
import { experienceTarget } from "@resumora/contracts/intelligence/experience";
import { normalizeUsage, object } from "../ai/accounting.ts";
import { boundedJson } from "../ai/http.ts";
import type { AttemptResult } from "../ai/ledger.ts";
import {
  configId,
  type EnhancementConfig,
  type EnhancementGateway,
} from "../ai/routes.ts";
import { privateJson } from "../jobs/routes.ts";

export const maxVoiceBytes = 4 * 1024 * 1024;
export const voiceTypes = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
] as const;
const extensions: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};
const error = (code: string, status = 503) =>
  privateJson({ error: { code } }, status);

async function readAudio(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("VOICE_SIZE");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxVoiceBytes) throw Error("VOICE_SIZE");
      chunks.push(value);
    }
    if (!size) throw Error("VOICE_SIZE");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (cause) {
    await reader.cancel().catch(() => {});
    throw cause;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

/** Auth, account fencing, Origin and CSRF are enforced by the shared entry point.
 * Audio and transcript live only in this request; the ledger stores metadata only.
 * One durable reservation permits one provider dispatch, including unknown outcomes.
 */
export async function transcriptionRoute(
  request: Request,
  env: EnhancementConfig,
  gateway: EnhancementGateway,
  userId: string,
  transport: typeof fetch = fetch,
) {
  if (request.method !== "POST") return error("METHOD_NOT_ALLOWED", 405);
  if (env.AI_PAID_INFERENCE !== "on") return error("AI_DISABLED");
  if (
    !env.OPENAI_API_KEY ||
    !env.AI_WORKER_SECRET ||
    env.AI_WORKER_SECRET.length < 32 ||
    !configId(env.AI_PROCESSING_POLICY)
  )
    return error("AI_UNCONFIGURED");
  const type = request.headers.get("Content-Type")?.split(";")[0] ?? "";
  const operationId = request.headers.get("X-Operation-Id");
  const snapshotId = request.headers.get("X-Snapshot-Id");
  const revision = Number(request.headers.get("X-Snapshot-Revision"));
  const targetId = request.headers.get("X-Target-Id") ?? "";
  if (
    !extensions[type] ||
    !isUuid(operationId) ||
    !isUuid(snapshotId) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !/^[A-Za-z0-9_.:/-]{1,100}$/.test(targetId)
  )
    return error("INVALID_REQUEST", 422);
  const declared = request.headers.get("Content-Length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > maxVoiceBytes)
  )
    return error("VOICE_SIZE", 413);
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await readAudio(request);
  } catch (cause) {
    return error(
      cause instanceof Error && cause.message === "VOICE_SIZE"
        ? "VOICE_SIZE"
        : "VOICE_UPLOAD_FAILED",
      413,
    );
  }
  const secret = env.AI_WORKER_SECRET;
  const attemptId = `${operationId}-fallback`; // Existing durable RPC suffix for direct OpenAI.
  try {
    const snapshot = await gateway.loadSnapshot(snapshotId);
    if (!snapshot || snapshot.revision !== revision)
      return error("STALE_INPUT", 409);
    if (!experienceTarget(decodeDraft(snapshot.payload), targetId))
      return error("INVALID_TARGET", 422);
    const reservation = await gateway.reserveEnhancement({
      operationId,
      snapshotId,
      revision,
      targetId: `voice:${targetId}`,
      policy: `${env.AI_PROCESSING_POLICY!.slice(0, 100)}:voice`,
      secret,
    });
    if (!reservation.created) return error("VOICE_ALREADY_REQUESTED", 409);
    const fingerprint = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const started = await gateway.beginAttempt(
      {
        attemptId,
        operationId,
        operation: "voice_transcription",
        provider: "openai",
        providerScope: "configured-direct-audio",
        userId,
        modelRequested: "whisper-1",
        requestFingerprint: fingerprint,
        startedAt: new Date().toISOString(),
      },
      secret,
    );
    if (!started.created) return error("VOICE_ALREADY_REQUESTED", 409);
  } catch {
    return error("VOICE_ACCOUNTING_UNAVAILABLE");
  }

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30000)]);
  const result: AttemptResult = {
    status: "unknown",
    finishedAt: "",
    modelResolved: null,
    providerRequestId: null,
    providerResponseId: null,
    providerStatus: null,
    httpStatus: null,
    errorCode: "NETWORK_OR_RESPONSE_UNKNOWN",
    usage: normalizeUsage(null),
    price: null,
    estimatedNanoUsd: null,
  };
  let text: string | undefined;
  let code = "VOICE_OUTCOME_UNKNOWN";
  try {
    signal.throwIfAborted();
    const form = new FormData();
    form.set("file", new Blob([bytes], { type }), `answer.${extensions[type]}`);
    form.set("model", "whisper-1");
    form.set("response_format", "json");
    const response = await transport(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: form,
        redirect: "manual",
        signal,
      },
    );
    result.httpStatus = response.status;
    const requestId = response.headers.get("x-request-id");
    result.providerRequestId =
      requestId && /^[A-Za-z0-9_-]{1,128}$/.test(requestId) ? requestId : null;
    if (!response.ok) {
      await response.body?.cancel();
      result.status = response.status >= 500 ? "unknown" : "failed";
      result.providerStatus = "failed";
      result.errorCode = "PROVIDER_REJECTED";
      code =
        result.status === "unknown"
          ? "VOICE_OUTCOME_UNKNOWN"
          : "VOICE_PROVIDER_REJECTED";
    } else {
      const value = object(await boundedJson(response, 128 * 1024, signal));
      if (typeof value.text !== "string" || value.text.length > 12000) {
        result.status = "incomplete";
        result.errorCode = "OUTPUT_INVALID";
        code = "VOICE_OUTPUT_INVALID";
      } else {
        text = value.text.trim();
        result.status = "completed";
        result.providerStatus = "completed";
        result.modelResolved = "whisper-1";
        result.errorCode = null;
        code = "VOICE_NO_SPEECH";
      }
    }
  } catch {
    result.errorCode = signal.aborted
      ? request.signal.aborted
        ? "CANCELLED"
        : "TIMEOUT"
      : "NETWORK_OR_RESPONSE_UNKNOWN";
  }
  result.finishedAt = new Date().toISOString();
  // Whisper does not report text-token billing. Missing usage/cost remains unknown, never zero.
  try {
    await gateway.finishAttempt(attemptId, result, secret);
  } catch {
    return error("VOICE_OUTCOME_UNKNOWN");
  }
  return text
    ? privateJson({ text })
    : error(code, code === "VOICE_NO_SPEECH" ? 422 : 502);
}

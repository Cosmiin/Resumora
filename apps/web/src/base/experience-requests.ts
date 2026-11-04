/** Only these responses prove inference did not complete. Uncertain requests keep their IDs. */
export const experienceDefiniteFailures = new Set([
  "AI_REQUEST_FAILED",
  "AI_OUTPUT_INVALID",
  "AI_OUTPUT_TRUNCATED",
  "AI_PROVIDER_REJECTED",
  "INVALID_SCOPED_CONTEXT",
  "INVALID_POINT",
  "STALE_INPUT",
  "AI_DISABLED",
  "AI_UNCONFIGURED",
  "SAVE_REQUIRED",
  "INVALID_REQUEST",
  "VERSION_CONFLICT",
  "INVALID_TARGET",
  "IDEMPOTENCY_BODY_MISMATCH",
  "SESSION_REFRESH_REQUIRED",
]);
/** Bounded read-only reconciliation; no automatic re-generation or endless polling. */
export const experienceRecoveryDelays = [1000, 2000, 4000, 8000, 12000, 8000];
export function experienceErrorCode(error: unknown): string {
  const value = error as { code?: unknown; message?: unknown } | null;
  return String(
    value?.code ?? value?.message ?? "AI_REQUEST_UNKNOWN",
  ).toUpperCase();
}

/** Content-free, best-effort import diagnostics. Never part of a durable receipt. */
export type ImportTimingPhase =
  | "upload_acknowledgement"
  | "queue_acknowledgement"
  | "queue_claim"
  | "preflight"
  | "stage_reservation"
  | "attempt_reservation"
  | "provider_round_trip"
  | "validation"
  | "attempt_settlement"
  | "review_publication"
  | "terminal_settlement"
  | "browser_upload_acknowledgement"
  | "browser_discovery"
  | "browser_ready_observed";
export type ImportTimingEvent = {
  version: 1;
  domain: "server" | "browser";
  operationId: string;
  stageOperationId?: string;
  stage?: "admit" | "extract";
  attempt?: "primary" | "fallback";
  phase: ImportTimingPhase;
  edge: "start" | "complete" | "unknown" | "observed";
  atMs: number | null;
  durationMs: number | null;
};
export type ImportTimingOptions = {
  emit?: (event: ImportTimingEvent) => void | Promise<void>;
  now?: () => number;
};
type Scope = Pick<ImportTimingEvent, "stageOperationId" | "stage" | "attempt">;
const opaque = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value)
    ? value
    : undefined;
export function createImportTiming(
  domain: ImportTimingEvent["domain"],
  operationId: string,
  options: ImportTimingOptions = {},
) {
  let remaining = 64;
  const now = () => {
    try {
      const value = (options.now ?? (() => performance.now()))();
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  };
  function emit(
    phase: ImportTimingPhase,
    edge: ImportTimingEvent["edge"],
    durationMs: number | null,
    scope: Scope,
  ) {
    try {
      if (remaining-- <= 0 || !opaque(operationId)) return;
      const event: ImportTimingEvent = {
        version: 1,
        domain,
        operationId,
        phase,
        edge,
        durationMs,
        // Wall time is for log correlation only; durations use a local monotonic clock.
        atMs: Number.isFinite(Date.now()) ? Date.now() : null,
        ...(opaque(scope.stageOperationId)
          ? { stageOperationId: scope.stageOperationId }
          : {}),
        ...(["admit", "extract"].includes(scope.stage ?? "")
          ? { stage: scope.stage }
          : {}),
        ...(["primary", "fallback"].includes(scope.attempt ?? "")
          ? { attempt: scope.attempt }
          : {}),
      };
      const result = options.emit
        ? options.emit(event)
        : console.debug("cv-import-timing", event);
      // No await, retry, transport, or processing dependency on telemetry delivery.
      if (result) void Promise.resolve(result).catch(() => {});
    } catch {
      /* Diagnostics may never change import outcomes. */
    }
  }
  return {
    mark(phase: ImportTimingPhase, scope: Scope = {}) {
      emit(phase, "observed", null, scope);
    },
    span(phase: ImportTimingPhase, scope: Scope = {}) {
      const began = now();
      emit(phase, "start", null, scope);
      let ended = false;
      return (edge: "complete" | "unknown" = "complete") => {
        if (ended) return;
        ended = true;
        const end = now(),
          elapsed = began === null || end === null ? null : end - began;
        emit(
          phase,
          edge,
          elapsed !== null && elapsed >= 0 && elapsed <= 86400000
            ? elapsed
            : null,
          scope,
        );
      };
    },
  };
}
export type ImportTiming = ReturnType<typeof createImportTiming>;

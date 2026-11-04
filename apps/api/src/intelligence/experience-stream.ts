/** Observation never owns processing. Disconnect drops display events, not receipt settlement. */
export function experienceStream(
  operationId: string,
  run: (onDraft: (text: string) => void) => Promise<Response>,
  waitUntil?: (promise: Promise<unknown>) => void,
): Response {
  let closed = false,
    seq = 0;
  const encoder = new TextEncoder();
  const started = performance.now();
  let first = false;
  let previous = "";
  const timing = (phase: string) => {
    try {
      console.info(
        JSON.stringify({
          event: "experience_timing",
          domain: "server",
          operationId,
          phase,
          elapsedMs: Math.round(performance.now() - started),
        }),
      );
    } catch {
      /* Best effort. */
    }
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (value: object) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ ...value, operationId, seq: seq++ })}\n\n`,
            ),
          );
        } catch {
          closed = true;
        }
      };
      timing("started");
      const work = run((text) => {
        if (text && !first) {
          first = true;
          timing("first_draft");
        }
        if (text.length > 12000) return;
        if (!text || !text.startsWith(previous))
          emit({ kind: "draft_reset", text });
        else if (text.length > previous.length)
          emit({ kind: "draft_delta", text: text.slice(previous.length) });
        previous = text;
      })
        .then(async (response) => {
          const value = (await response.json()) as {
            error?: { code?: string };
          };
          if (response.ok) {
            timing("ready");
            emit({ kind: "ready", result: value });
          } else
            emit({
              kind: "failed",
              code: value?.error?.code ?? "AI_REQUEST_UNKNOWN",
            });
        })
        .catch(() => emit({ kind: "failed", code: "AI_REQUEST_UNKNOWN" }))
        .finally(() => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        });
      waitUntil?.(work);
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}

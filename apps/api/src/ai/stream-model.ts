import { AiUnavailableError, providerRequestFields, type AiCallLog, type ModelDeps, type Provider } from "./call-model.ts";

const FIRST_CHUNK_TIMEOUT_MS = 20_000;
const GAP_TIMEOUT_MS = 15_000;

export type StreamRequest = {
  userId: string;
  /** Short snake_case name, used in logs. */
  task: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  /** Cancels the call, for example when the browser gives up on a rewrite. */
  signal?: AbortSignal;
};

/** The provider failed after the first word was already sent on. Another provider would start a different text. */
export class AiStreamBrokenError extends Error {
  constructor() {
    super("The AI answer stopped before it was finished.");
  }
}

/** A failed stream attempt. Only the reason goes into logs: provider bodies may echo the prompt. */
class StreamFailure extends Error {}

/** Waits for `promise`, but gives up after `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StreamFailure(`timeout after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Resolves false when the signal fires, so a read that ignores the abort is still given up on. */
function onAbort(signal: AbortSignal | undefined): { promise: Promise<never>; stop(): void } {
  let stop = () => {};
  const promise = new Promise<never>((_, reject) => {
    if (!signal) return;
    const fire = () => reject(new StreamFailure("aborted"));
    if (signal.aborted) return fire();
    signal.addEventListener("abort", fire, { once: true });
    stop = () => signal.removeEventListener("abort", fire);
  });
  promise.catch(() => {});
  return { promise, stop };
}

type Usage = { prompt_tokens?: number; completion_tokens?: number };

/**
 * Streams the model's answer as text chunks, trying providers in order.
 * A failure or timeout before the first chunk moves on to the next provider; after it, the stream
 * throws AiStreamBrokenError instead. Each attempt is logged once, with tokens when reported.
 */
export async function* streamModel(deps: ModelDeps, req: StreamRequest): AsyncGenerator<string, void, undefined> {
  const firstMs = deps.timeoutMs ?? FIRST_CHUNK_TIMEOUT_MS;
  const gapMs = Math.min(GAP_TIMEOUT_MS, firstMs);

  for (const provider of deps.providers) {
    if (req.signal?.aborted) return;
    const started = Date.now();
    let logged = false;
    const log = async (entry: Partial<AiCallLog> & Pick<AiCallLog, "status">) => {
      logged = true;
      await deps
        .logCall({ userId: req.userId, task: req.task, provider: provider.name, model: provider.model, durationMs: Date.now() - started, ...entry })
        .catch((err: unknown) => console.error(JSON.stringify({ msg: "ai_calls log failed", error: String(err) })));
    };

    const own = new AbortController();
    const signal = req.signal ? AbortSignal.any([req.signal, own.signal]) : own.signal;
    const abort = onAbort(req.signal);
    let reader: ReadableStreamDefaultReader<string> | undefined;
    let yielded = false;
    let complete = false;
    let usage: Usage | undefined;

    /** Reads one SSE line; returns the text it carries, if any. */
    const readLine = (raw: string): string | undefined => {
      const line = raw.replace(/\r$/, "");
      if (line === "" || line.startsWith(":") || !line.startsWith("data:")) return undefined;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        complete = true;
        return undefined;
      }
      let data: { error?: unknown; usage?: Usage | null; choices?: Array<{ delta?: { content?: unknown }; finish_reason?: string | null }> };
      try {
        data = JSON.parse(payload);
      } catch {
        return undefined;
      }
      if (data.error) throw new StreamFailure("provider error");
      if (data.usage) usage = data.usage;
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "length") throw new StreamFailure("output cut off at the length limit");
      if (choice?.finish_reason === "stop") complete = true;
      else if (choice?.finish_reason) throw new StreamFailure(`stopped by the provider: ${choice.finish_reason}`);
      const content = choice?.delta?.content;
      return typeof content === "string" && content !== "" ? content : undefined;
    };

    try {
      const res = await Promise.race([
        within(
          deps.fetch(`${provider.url}/chat/completions`, {
            method: "POST",
            headers: { authorization: `Bearer ${provider.apiKey}`, "content-type": "application/json" },
            body: requestBody(provider, req),
            signal,
          }),
          firstMs,
        ),
        abort.promise,
      ]);
      // Only the status goes into errors: provider bodies may echo the prompt.
      if (!res.ok) throw new StreamFailure(`HTTP ${res.status}`);
      if (!res.body) throw new StreamFailure("empty response");
      reader = res.body.pipeThrough(new TextDecoderStream()).getReader();

      // Keep-alive comments don't count: the deadline moves only when real text arrives.
      // Before the first text it is one fixed deadline for the whole attempt.
      let deadline = started + firstMs;
      let buffer = "";
      for (;;) {
        const { done, value } = await Promise.race([within(reader.read(), Math.max(0, deadline - Date.now())), abort.promise]);
        if (done) break;
        buffer += value;
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const text = readLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          if (text !== undefined) {
            yielded = true;
            yield text;
            // Measured from when reading resumes, so a slow reader doesn't eat into the gap.
            deadline = Date.now() + gapMs;
          }
          newline = buffer.indexOf("\n");
        }
      }
      const last = readLine(buffer);
      if (last !== undefined) {
        yielded = true;
        yield last;
      }
      if (!yielded) throw new StreamFailure("no text in the answer");
      if (!complete) throw new StreamFailure("stream ended early");

      await log({ status: "ok", inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens });
      return;
    } catch (err) {
      if (req.signal?.aborted) {
        await log({ status: "error", error: "aborted", inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens });
        return;
      }
      await log({ status: "error", error: err instanceof StreamFailure ? err.message : "network error" });
      if (yielded) throw new AiStreamBrokenError();
    } finally {
      abort.stop();
      reader?.cancel().catch(() => {});
      own.abort();
      // The consumer stopped reading before the end.
      if (!logged) await log({ status: "error", error: "stopped by the reader" });
    }
  }
  throw new AiUnavailableError();
}

function requestBody(provider: Provider, req: StreamRequest): string {
  return JSON.stringify({
    model: provider.model,
    temperature: 0,
    ...providerRequestFields(provider, req.maxOutputTokens),
    stream: true,
    ...(provider.name === "openai" ? { stream_options: { include_usage: true } } : {}),
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
  });
}

import { z } from "zod";
import type { Env } from "../env.ts";

/** An OpenAI-compatible chat-completions provider. */
export type Provider = { name: "openrouter" | "openai"; url: string; apiKey: string; model: string };

/** One row of `ai_calls`. Never contains prompt or CV text. */
export type AiCallLog = {
  userId: string;
  task: string;
  provider: string;
  model: string;
  status: "ok" | "error";
  error?: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type ModelDeps = {
  /** Tried in order; the first that answers wins. */
  providers: Provider[];
  fetch: typeof fetch;
  logCall(entry: AiCallLog): Promise<void>;
  /** Per attempt. Default 45 s. */
  timeoutMs?: number;
};

export type ModelRequest<S extends z.ZodType> = {
  userId: string;
  /** Short snake_case name, used as the JSON schema name and in logs. */
  task: string;
  schema: S;
  system: string;
  user: string;
  maxOutputTokens: number;
};

/** Every provider failed (after retries). */
export class AiUnavailableError extends Error {
  constructor() {
    super("The AI service is unavailable right now.");
  }
}

const DEFAULT_TIMEOUT_MS = 45_000;
const ATTEMPTS_PER_PROVIDER = 2;

/** A failed attempt. `retry` says whether the same provider is worth trying again. */
class AttemptError extends Error {
  constructor(message: string, readonly retry: boolean) {
    super(message);
  }
}

export function providersFromEnv(
  env: Pick<Env, "OPENROUTER_API_KEY" | "OPENROUTER_MODEL" | "OPENAI_API_KEY" | "OPENAI_MODEL">,
): Provider[] {
  const all: Provider[] = [
    { name: "openrouter", url: "https://openrouter.ai/api/v1", apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL },
    { name: "openai", url: "https://api.openai.com/v1", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
  ];
  return all.filter((p) => p.apiKey && p.model);
}

/** JSON schema for structured output. Providers reject the `$schema` key. */
function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const json = { ...(z.toJSONSchema(schema) as Record<string, unknown>) };
  delete json.$schema;
  return json;
}

/**
 * Calls the model and returns output that matches `schema`.
 * Each provider gets one retry on 429, 5xx, timeout, or invalid output; other errors (e.g. 400)
 * move straight to the next provider. Every attempt is logged.
 */
export async function callModel<S extends z.ZodType>(deps: ModelDeps, req: ModelRequest<S>): Promise<z.infer<S>> {
  const body = (model: string) =>
    JSON.stringify({
      model,
      temperature: 0,
      max_tokens: req.maxOutputTokens,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: req.task, strict: true, schema: jsonSchemaFor(req.schema) },
      },
    });

  for (const provider of deps.providers) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_PROVIDER; attempt++) {
      const started = Date.now();
      const log = (entry: Partial<AiCallLog> & Pick<AiCallLog, "status">) =>
        deps
          .logCall({ userId: req.userId, task: req.task, provider: provider.name, model: provider.model, durationMs: Date.now() - started, ...entry })
          .catch((err: unknown) => console.error(JSON.stringify({ msg: "ai_calls log failed", error: String(err) })));
      try {
        const { output, usage } = await attemptOnce(deps, provider, body(provider.model), req.schema);
        await log({ status: "ok", inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens });
        return output;
      } catch (err) {
        const failure = err instanceof AttemptError ? err : new AttemptError("request failed", true);
        await log({ status: "error", error: failure.message });
        if (!failure.retry) break;
      }
    }
  }
  throw new AiUnavailableError();
}

type Usage = { prompt_tokens?: number; completion_tokens?: number };
const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).optional(),
});

async function attemptOnce<S extends z.ZodType>(
  deps: ModelDeps,
  provider: Provider,
  body: string,
  schema: S,
): Promise<{ output: z.infer<S>; usage?: Usage }> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Race as well as abort, so a fetch that ignores the signal is still given up on.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AttemptError(`timeout after ${timeoutMs} ms`, true)), timeoutMs);
  });
  try {
    const res = await Promise.race([
      deps.fetch(`${provider.url}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${provider.apiKey}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      }),
      timeout,
    ]);
    // Only the status goes into errors: provider bodies may echo the prompt.
    if (!res.ok) throw new AttemptError(`HTTP ${res.status}`, res.status === 429 || res.status >= 500);

    const completion = CompletionSchema.safeParse(await Promise.race([res.json().catch(() => null), timeout]));
    if (!completion.success) throw new AttemptError("unexpected response shape", true);
    const content = completion.data.choices[0]!.message.content ?? "";

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      throw new AttemptError("output is not valid JSON", true);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path.join(".") || "(root)";
      throw new AttemptError(`output does not match the schema at ${path}`, true);
    }
    return { output: parsed.data, usage: completion.data.usage };
  } catch (err) {
    if (err instanceof AttemptError) throw err;
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new AttemptError(`timeout after ${timeoutMs} ms`, true);
    }
    throw new AttemptError("network error", true);
  } finally {
    clearTimeout(timer);
  }
}

import { z } from "zod";
import type { Env } from "../env.ts";

/** An OpenAI-compatible chat-completions provider. */
export type Provider = { name: "openrouter" | "openai"; url: string; apiKey: string; model: string; strongModel?: string };

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
  /** Waits before a retry (see RATE_LIMIT_PAUSE_MS). Tests pass a fake. */
  sleep?(ms: number): Promise<void>;
};

/** One piece of the user message. A PDF is sent to the model as a file, not as extracted text. */
export type UserPart = { type: "text"; text: string } | { type: "pdf"; filename: string; base64: string };

export type ModelRequest<S extends z.ZodType> = {
  userId: string;
  /** Short snake_case name, used as the JSON schema name and in logs. */
  task: string;
  schema: S;
  system: string;
  user: string | UserPart[];
  maxOutputTokens: number;
  tier?: "cheap" | "strong";
  /** Overrides ModelDeps.timeoutMs for slow tasks such as a full CV extraction. */
  timeoutMs?: number;
};

/** Every provider failed (after retries). */
export class AiUnavailableError extends Error {
  constructor() {
    super("The AI service is unavailable right now.");
  }
}

/** Every provider refused the file (wrong type, not readable, not supported). Retrying will not help. */
export class AiInputRejectedError extends Error {
  constructor() {
    super("The AI service could not read the file.");
  }
}

const DEFAULT_TIMEOUT_MS = 45_000;
const ATTEMPTS_PER_PROVIDER = 2;
/**
 * OpenRouter's 429 means the model's capacity, shared with OpenRouter's other customers, is full for a moment
 * ("temporarily rate-limited upstream"): an immediate retry usually meets the same wall, so wait first.
 */
const RATE_LIMIT_PAUSE_MS = 2000;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The answer hit the output limit. Retrying (or another provider) would be cut off the same way. */
export class AiOutputTooLongError extends Error {
  constructor() {
    super("The answer was cut off at the output limit.");
  }
}

/** A failed attempt. `retry` says whether the same provider is worth trying again. */
class AttemptError extends Error {
  constructor(message: string, readonly retry: boolean, readonly tooLong = false, readonly inputRejected = false) {
    super(message);
  }
  get rateLimited(): boolean {
    return this.message === "HTTP 429";
  }
}

export function providersFromEnv(
  env: Pick<Env, "OPENROUTER_API_KEY" | "OPENROUTER_MODEL" | "OPENROUTER_MODEL_STRONG" | "OPENAI_API_KEY" | "OPENAI_MODEL" | "OPENAI_MODEL_STRONG">,
): Provider[] {
  const all: Provider[] = [
    {
      name: "openrouter", url: "https://openrouter.ai/api/v1", apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL,
      ...(env.OPENROUTER_MODEL_STRONG ? { strongModel: env.OPENROUTER_MODEL_STRONG } : {}),
    },
    {
      name: "openai", url: "https://api.openai.com/v1", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL,
      ...(env.OPENAI_MODEL_STRONG ? { strongModel: env.OPENAI_MODEL_STRONG } : {}),
    },
  ];
  return all.filter((p) => p.apiKey && p.model);
}

/**
 * The provider-specific part of a chat-completions body: the token limit and the privacy routing.
 * Shared by callModel and streamModel so both send CVs only where callModel would.
 */
export function providerRequestFields(provider: Provider, maxOutputTokens: number): Record<string, unknown> {
  return provider.name === "openai"
    ? // GPT-5 models reject `max_tokens`; `store: false` keeps CVs out of OpenAI's stored completions.
      { max_completion_tokens: maxOutputTokens, store: false }
    : {
        max_tokens: maxOutputTokens,
        // CVs are personal data: only endpoints that neither keep nor train on it, and that
        // support every parameter we send (structured output), may serve the request.
        provider: { data_collection: "deny", zdr: true, require_parameters: true },
      };
}

/** The chat-completions content for the user message; both providers take the same file part. */
function userContent(user: string | UserPart[]): string | unknown[] {
  if (typeof user === "string") return user;
  return user.map((part) =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : { type: "file", file: { filename: part.filename, file_data: `data:application/pdf;base64,${part.base64}` } },
  );
}

/** Statuses and wording that mean "I cannot read this file", as opposed to a bad key or a bad request. */
const REJECTED_STATUSES = new Set([400, 415, 422]);
const REJECTED_WORDS = /file|pdf|content type|unsupported/i;

type JsonNode = Record<string, unknown>;

/** JSON schema for structured output. Providers reject the `$schema` key. */
function jsonSchemaFor(schema: z.ZodType): JsonNode {
  const json = { ...(z.toJSONSchema(schema) as JsonNode) };
  delete json.$schema;
  return json;
}

/** Zod writes a nullable field as `type: [..., "null"]` or as an anyOf with a null branch. */
const acceptsNull = (node: JsonNode): boolean =>
  node.type === "null" || (Array.isArray(node.type) && node.type.includes("null")) ||
  (Array.isArray(node.anyOf) && (node.anyOf as JsonNode[]).some(acceptsNull));

/** The JSON schema sent as structured output (see strictSchema). */
export const structuredOutputSchema = (schema: z.ZodType): JsonNode => strictSchema(jsonSchemaFor(schema));

/**
 * The schema as OpenAI's strict structured output accepts it: every object lists all its properties in `required`
 * (OpenAI answers HTTP 400 otherwise, so the fallback never worked for such a schema). A property the zod schema
 * leaves optional is sent as nullable instead; `dropAbsentNulls` turns the model's null for it back into no key.
 */
function strictSchema(node: JsonNode): JsonNode {
  const out: JsonNode = { ...node };
  if (node.properties) {
    const required = new Set((node.required ?? []) as string[]);
    const properties: Record<string, JsonNode> = {};
    for (const [key, value] of Object.entries(node.properties as Record<string, JsonNode>)) {
      const strict = strictSchema(value);
      properties[key] = required.has(key) || acceptsNull(strict) ? strict : { anyOf: [strict, { type: "null" }] };
    }
    out.properties = properties;
    out.required = Object.keys(properties);
  }
  if (node.items) out.items = strictSchema(node.items as JsonNode);
  if (Array.isArray(node.anyOf)) out.anyOf = (node.anyOf as JsonNode[]).map(strictSchema);
  return out;
}

/** The branch of `node` (itself or one of its anyOf) that describes `value`'s shape. */
function branchFor(node: JsonNode, value: object): JsonNode | undefined {
  const fits = (n: JsonNode) => (Array.isArray(value) ? !!n.items : !!n.properties);
  return fits(node) ? node : (node.anyOf as JsonNode[] | undefined)?.find(fits);
}

/** Removes the nulls the model sent for properties that the original (non-strict) schema leaves optional. */
function dropAbsentNulls(value: unknown, node: JsonNode): unknown {
  if (!value || typeof value !== "object") return value;
  const branch = branchFor(node, value);
  if (!branch) return value;
  if (Array.isArray(value)) return value.map((item) => dropAbsentNulls(item, branch.items as JsonNode));
  const required = new Set((branch.required ?? []) as string[]);
  const properties = branch.properties as Record<string, JsonNode>;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const property = properties[key];
    if (item === null && property && !required.has(key) && !acceptsNull(property)) continue;
    out[key] = property ? dropAbsentNulls(item, property) : item;
  }
  return out;
}

/**
 * Calls the model and returns output that matches `schema`.
 * Each provider gets one retry on 429, 5xx, timeout, or invalid output; other errors (e.g. 400)
 * move straight to the next provider. Every attempt is logged.
 */
export async function callModel<S extends z.ZodType>(deps: ModelDeps, req: ModelRequest<S>): Promise<z.infer<S>> {
  const json = jsonSchemaFor(req.schema);
  const body = (provider: Provider) =>
    JSON.stringify({
      model: provider.model,
      temperature: 0,
      ...providerRequestFields(provider, req.maxOutputTokens),
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: userContent(req.user) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: req.task, strict: true, schema: strictSchema(json) },
      },
    });

  const hasFile = Array.isArray(req.user) && req.user.some((p) => p.type === "pdf");
  let rejectedBy = 0;
  for (const configured of deps.providers) {
    const provider = req.tier === "strong" && configured.strongModel ? { ...configured, model: configured.strongModel } : configured;
    for (let attempt = 1; attempt <= ATTEMPTS_PER_PROVIDER; attempt++) {
      const started = Date.now();
      const log = (entry: Partial<AiCallLog> & Pick<AiCallLog, "status">) =>
        deps
          .logCall({ userId: req.userId, task: req.task, provider: provider.name, model: provider.model, durationMs: Date.now() - started, ...entry })
          .catch((err: unknown) => console.error(JSON.stringify({ msg: "ai_calls log failed", error: String(err) })));
      try {
        const { output, usage } = await attemptOnce(deps, provider, body(provider), req.schema, json, req.timeoutMs, hasFile);
        await log({ status: "ok", inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens });
        return output;
      } catch (err) {
        const failure = err instanceof AttemptError ? err : new AttemptError("request failed", true);
        await log({ status: "error", error: failure.message });
        if (failure.tooLong) throw new AiOutputTooLongError();
        if (failure.inputRejected) rejectedBy++;
        if (!failure.retry) break;
        if (failure.rateLimited && provider.name === "openrouter" && attempt < ATTEMPTS_PER_PROVIDER) {
          await (deps.sleep ?? defaultSleep)(RATE_LIMIT_PAUSE_MS);
        }
      }
    }
  }
  if (deps.providers.length > 0 && rejectedBy === deps.providers.length) throw new AiInputRejectedError();
  throw new AiUnavailableError();
}

type Usage = { prompt_tokens?: number; completion_tokens?: number };
const CompletionSchema = z.object({
  choices: z
    .array(z.object({ finish_reason: z.string().nullish(), message: z.object({ content: z.string().nullable() }) }))
    .min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).optional(),
});

async function attemptOnce<S extends z.ZodType>(
  deps: ModelDeps,
  provider: Provider,
  body: string,
  schema: S,
  json: JsonNode,
  requestTimeoutMs?: number,
  hasFile = false,
): Promise<{ output: z.infer<S>; usage?: Usage }> {
  const timeoutMs = requestTimeoutMs ?? deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
    if (!res.ok) {
      // The body is only read to tell a refused file from other errors; it is never logged.
      const text = hasFile && REJECTED_STATUSES.has(res.status) ? await Promise.race([res.text().catch(() => ""), timeout]) : "";
      throw new AttemptError(`HTTP ${res.status}`, res.status === 429 || res.status >= 500, false, REJECTED_WORDS.test(text));
    }

    const completion = CompletionSchema.safeParse(await Promise.race([res.json().catch(() => null), timeout]));
    if (!completion.success) throw new AttemptError("unexpected response shape", true);
    const choice = completion.data.choices[0]!;
    if (choice.finish_reason === "length") throw new AttemptError("output cut off at the length limit", false, true);
    const content = choice.message.content ?? "";

    let answer: unknown;
    try {
      answer = JSON.parse(content);
    } catch {
      throw new AttemptError("output is not valid JSON", true);
    }
    const parsed = schema.safeParse(dropAbsentNulls(answer, json));
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

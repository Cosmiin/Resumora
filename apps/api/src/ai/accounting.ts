// Accounting only: never pass prompts, model output, headers or provider errors here.
export const PRICE_SOURCE = 'https://developers.openai.com/api/docs/pricing';
export type PriceSnapshot = {
  version: string;
  observedOn: string;
  effectiveFrom: string;
  source: string;
  currency: 'USD';
  tier: 'default';
  // Integer nano-USD per token. No binary floating point money arithmetic.
  inputNanoUsd: string;
  cachedInputNanoUsd: string;
  outputNanoUsd: string;
};

// Source-observed date, not a claim about when OpenAI last changed its prices.
const prices: Readonly<Record<string, readonly [string, string, string]>> = {
  'gpt-5.4-nano': ['200', '20', '1250'],
  'gpt-5.4-nano-2026-03-17': ['200', '20', '1250'],
  'gpt-5.4-mini': ['750', '75', '4500'],
  'gpt-5.4-mini-2026-03-17': ['750', '75', '4500'],
};

export function priceFor(model: string, at: string, tier: string | null): PriceSnapshot | null {
  const rates = Object.hasOwn(prices, model) ? prices[model] : undefined;
  if (!rates || tier !== 'default' || at < '2026-10-26T00:00:00.000Z') return null;
  return {
    version: 'openai-standard-text-2026-10-26.v1', observedOn: '2026-10-26',
    effectiveFrom: '2026-10-26T00:00:00.000Z', source: PRICE_SOURCE, currency: 'USD', tier: 'default',
    inputNanoUsd: rates[0], cachedInputNanoUsd: rates[1], outputNanoUsd: rates[2],
  };
}

export type ProviderUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
};
export type Usage = {
  state: 'reported' | 'missing' | 'invalid';
  input: number | null;
  output: number | null;
  cachedInput: number | null;
  reasoning: number | null;
  total: number | null;
  raw: ProviderUsage | null;
};
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
const counter = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

export function normalizeUsage(value: unknown): Usage {
  const empty: Usage = { state: 'missing', input: null, output: null, cachedInput: null, reasoning: null, total: null, raw: null };
  if (value == null) return empty;
  const v = object(value);
  const inputDetails = object(v.input_tokens_details);
  const outputDetails = object(v.output_tokens_details);
  // Retain documented numeric usage fields exactly; discard arbitrary payload fields/strings.
  const raw: ProviderUsage = {};
  for (const key of ['input_tokens', 'output_tokens', 'total_tokens'] as const) {
    if (counter(v[key])) raw[key] = v[key];
  }
  for (const key of ['cached_tokens', 'cache_write_tokens'] as const) {
    if (counter(inputDetails[key])) (raw.input_tokens_details ??= {})[key] = inputDetails[key];
  }
  if (counter(outputDetails.reasoning_tokens)) raw.output_tokens_details = { reasoning_tokens: outputDetails.reasoning_tokens };
  const input = raw.input_tokens ?? null;
  const output = raw.output_tokens ?? null;
  const total = raw.total_tokens ?? null;
  const cachedInput = raw.input_tokens_details?.cached_tokens ?? null;
  const reasoning = raw.output_tokens_details?.reasoning_tokens ?? null;
  const valid = input !== null && output !== null && total !== null && cachedInput !== null
    && Number.isSafeInteger(input + output) && total === input + output && cachedInput <= input
    && (reasoning === null || reasoning <= output)
    && (outputDetails.reasoning_tokens === undefined || counter(outputDetails.reasoning_tokens))
    && (inputDetails.cache_write_tokens === undefined || counter(inputDetails.cache_write_tokens));
  return { state: valid ? 'reported' : 'invalid', input, output, total, cachedInput, reasoning, raw };
}

export function estimateNanoUsd(usage: Usage, price: PriceSnapshot | null): string | null {
  if (usage.state !== 'reported' || !price || (usage.raw?.input_tokens_details?.cache_write_tokens ?? 0) !== 0) return null;
  return (BigInt(usage.input! - usage.cachedInput!) * BigInt(price.inputNanoUsd)
    + BigInt(usage.cachedInput!) * BigInt(price.cachedInputNanoUsd)
    + BigInt(usage.output!) * BigInt(price.outputNanoUsd)).toString();
}

// Round half up only at the display boundary. Stored totals retain nano-USD precision.
export function usd(nano: string, places = 6): string {
  if (!Number.isInteger(places) || places < 0 || places > 9) throw new Error('Invalid money precision');
  const divisor = 10n ** BigInt(9 - places);
  const rounded = (BigInt(nano) + divisor / 2n) / divisor;
  const scale = 10n ** BigInt(places);
  return `$${rounded / scale}${places ? '.' + (rounded % scale).toString().padStart(places, '0') : ''}`;
}

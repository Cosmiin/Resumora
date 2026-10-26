import type { VerifiedOwner } from '../admin/auth.ts';
import { estimateNanoUsd, normalizeUsage, object, priceFor } from './accounting.ts';
import { boundedJson } from './http.ts';
import type { Attempt, AttemptResult, UsageLedger } from './ledger.ts';

export interface OpenAIConfig {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_PROVIDER_SCOPE?: string;
}
export type CheckContext = { owner: VerifiedOwner; operationId: string; attemptId: string };
const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const metadataId = (v: unknown): string | null => typeof v === 'string' && identifier.test(v) ? v : null;

/** Internal, fixed connection check only. No CV/job feature or public generation endpoint.
 * Live execution requires an explicit code-level capability, secrets and durable ledger.
 * Worker entrypoint never constructs this adapter or grants that capability.
 * Inject synthetic transport for tests; never use execution:'live' without separate approval.
 */
export function prepareConnection(config: OpenAIConfig, options: {
  ledger: UsageLedger;
  execution?: 'disabled' | 'synthetic' | 'live';
  transport?: typeof fetch;
  maxOutputTokens?: number;
  maxInputBytes?: number;
  timeoutMs?: number;
}) {
  const execution = options.execution ?? 'disabled';
  if (!['disabled', 'synthetic', 'live'].includes(execution)) throw new Error('INVALID_EXECUTION_MODE');
  const maxOutput = options.maxOutputTokens ?? 32;
  const maxInput = options.maxInputBytes ?? 256;
  const timeout = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(maxOutput) || maxOutput < 16 || maxOutput > 256
    || !Number.isInteger(maxInput) || maxInput < 1 || maxInput > 4096
    || !Number.isInteger(timeout) || timeout < 1 || timeout > 30_000) throw new Error('INVALID_LIMITS');
  return {
    async check(context: CheckContext): Promise<Attempt> {
      if (execution === 'disabled') throw new Error('OPENAI_DISABLED');
      if (execution === 'synthetic' && (options.ledger.durability !== 'synthetic' || !options.transport)) throw new Error('SYNTHETIC_TRANSPORT_REQUIRED');
      if (execution === 'live' && (options.ledger.durability !== 'durable' || !config.OPENAI_API_KEY)) throw new Error('DURABLE_LEDGER_AND_SECRET_REQUIRED');
      if (!context.owner?.subject || !identifier.test(context.operationId) || !identifier.test(context.attemptId)
        || !config.OPENAI_MODEL || !identifier.test(config.OPENAI_MODEL.replaceAll('.', '_'))
        || !config.OPENAI_PROVIDER_SCOPE || !identifier.test(config.OPENAI_PROVIDER_SCOPE)) throw new Error('INVALID_CONTEXT');
      const input = 'Reply with OK.';
      const body = JSON.stringify({ model: config.OPENAI_MODEL, input, max_output_tokens: maxOutput,
        store: false, stream: false, service_tier: 'default', tools: [], truncation: 'disabled' });
      if (new TextEncoder().encode(input).byteLength > maxInput || new TextEncoder().encode(body).byteLength > 4096) throw new Error('REQUEST_TOO_LARGE');
      const startedAt = new Date().toISOString();
      const requestFingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))]
        .map(b => b.toString(16).padStart(2, '0')).join('');
      const reservation = await options.ledger.begin({ attemptId: context.attemptId, operationId: context.operationId,
        operation: 'connection_check', provider: 'openai', providerScope: config.OPENAI_PROVIDER_SCOPE,
        userId: context.owner.subject, modelRequested: config.OPENAI_MODEL, requestFingerprint, startedAt });
      // Replays, including still-started/unknown attempts, must never issue another paid request.
      if (!reservation.created) return reservation.attempt;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeout);
      const result: AttemptResult = { status: 'unknown', finishedAt: startedAt, modelResolved: null,
        providerRequestId: null, providerResponseId: null, providerStatus: null, httpStatus: null,
        errorCode: null, usage: normalizeUsage(null), price: null, estimatedNanoUsd: null };
      try {
        const transport = options.transport ?? fetch;
        // One HTTP attempt, fixed endpoint, no SDK automatic retries or redirect credentials.
        const response = await transport('https://api.openai.com/v1/responses', {
          method: 'POST', redirect: 'error', signal: abort.signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${execution === 'synthetic' ? 'synthetic-only' : config.OPENAI_API_KEY}`,
            'X-Client-Request-Id': context.attemptId }, body,
        });
        result.httpStatus = response.status;
        result.providerRequestId = metadataId(response.headers.get('x-request-id'));
        const data = object(await boundedJson(response, 262_144));
        result.providerResponseId = metadataId(data.id);
        result.modelResolved = metadataId(typeof data.model === 'string' ? data.model.replaceAll('.', '_') : null)
          ? data.model as string : null;
        result.usage = normalizeUsage(data.usage);
        if (data.status === 'completed' || data.status === 'incomplete' || data.status === 'failed') result.providerStatus = data.status;
        if (!response.ok) { result.status = 'failed'; result.errorCode = 'PROVIDER_REJECTED'; }
        else if (result.providerStatus && result.providerResponseId && result.modelResolved) {
          result.status = result.providerStatus;
          if (result.status === 'failed') result.errorCode = 'PROVIDER_FAILED';
        } else result.errorCode = 'NETWORK_OR_RESPONSE_UNKNOWN';
        result.price = result.modelResolved ? priceFor(result.modelResolved, startedAt, typeof data.service_tier === 'string' ? data.service_tier : null) : null;
        result.estimatedNanoUsd = estimateNanoUsd(result.usage, result.price);
      } catch {
        // Never retain provider error messages or response bodies. No assumption of free usage.
        result.status = 'unknown';
        result.errorCode = abort.signal.aborted ? 'TIMEOUT' : 'NETWORK_OR_RESPONSE_UNKNOWN';
      } finally { clearTimeout(timer); }
      result.finishedAt = new Date().toISOString();
      // Persistence failure propagates: reserved row stays unknown; do not retry inference.
      return options.ledger.finish(context.attemptId, result);
    },
  };
}

// Nonproduction test/preview fixture. Never import into the Worker entrypoint.
// This module has no provider transport or environment access.
import { estimateNanoUsd, normalizeUsage, priceFor } from '../src/ai/accounting.ts';
import { summarize } from '../src/ai/ledger.ts';
import type { Attempt, AttemptResult, AttemptStart, Period, UsageLedger } from '../src/ai/ledger.ts';

export class SyntheticLedger implements UsageLedger {
  readonly durability = 'synthetic' as const;
  private attempts = new Map<string, Attempt>();

  async begin(start: AttemptStart) {
    const previous = this.attempts.get(start.attemptId);
    if (previous) {
      const identity = (a: AttemptStart) => JSON.stringify([a.operationId, a.operation, a.provider, a.providerScope, a.userId, a.modelRequested, a.requestFingerprint]);
      if (identity(start) !== identity(previous)) throw new Error('ATTEMPT_CONTEXT_MISMATCH');
      return { created: false, attempt: structuredClone(previous) };
    }
    const attempt: Attempt = { ...structuredClone(start), result: null, duplicateOf: null };
    this.attempts.set(start.attemptId, attempt);
    return { created: true, attempt: structuredClone(attempt) };
  }

  async finish(id: string, result: AttemptResult): Promise<Attempt> {
    const attempt = this.attempts.get(id);
    if (!attempt) throw new Error('ATTEMPT_NOT_RESERVED');
    if (attempt.result) {
      if (JSON.stringify(attempt.result) !== JSON.stringify(result)) throw new Error('ATTEMPT_RESULT_MISMATCH');
      return structuredClone(attempt);
    }
    const duplicate = result.providerResponseId && [...this.attempts.values()].find(a => a.attemptId !== id
      && a.provider === attempt.provider && a.providerScope === attempt.providerScope
      && a.result?.providerResponseId === result.providerResponseId && !a.duplicateOf);
    // Preserve the delivered evidence, but count a known provider response once.
    if (duplicate) {
      const evidence = (r: AttemptResult) => JSON.stringify([r.modelResolved, r.usage, r.price, r.estimatedNanoUsd, r.status, r.reportedCost?.nanoUsd ?? null, r.reportedCost?.currency ?? null, r.reportedCost?.source ?? null, r.upstreamProvider ?? null]);
      if (evidence(duplicate.result!) !== evidence(result)) throw new Error('PROVIDER_EVIDENCE_CONFLICT');
      attempt.duplicateOf = duplicate.attemptId;
    }
    attempt.result = structuredClone(result);
    return structuredClone(attempt);
  }

  async report(period: Period) { return structuredClone(summarize([...this.attempts.values()], period)); }
}

export async function demoLedger(): Promise<SyntheticLedger> {
  const ledger = new SyntheticLedger();
  const rows = [
    { operation: 'cv_tailor', model: 'gpt-5.4-mini', input: 4800, cached: 2400, output: 1300, reasoning: 320, status: 'completed' },
    { operation: 'job_parse', model: 'gpt-5.4-nano', input: 2200, cached: 0, output: 420, reasoning: 40, status: 'completed' },
    { operation: 'cv_rewrite', model: 'gpt-5.4-mini', input: 1800, cached: 1200, output: 240, reasoning: 80, status: 'incomplete' },
    { operation: 'connection_check', model: 'gpt-5.4-nano', status: 'failed' },
    { operation: 'cv_parse', model: 'gpt-5.4-nano', status: 'unknown' },
    { operation: 'job_parse', model: 'synthetic-unpriced-model', input: 900, cached: 0, output: 110, reasoning: 0, status: 'completed' },
  ] as const;
  for (const [i, row] of rows.entries()) {
    const startedAt = `2026-10-26T10:${10 + i}:00.000Z`;
    const usage = normalizeUsage('input' in row ? { input_tokens: row.input, output_tokens: row.output, total_tokens: row.input + row.output,
      input_tokens_details: { cached_tokens: row.cached }, output_tokens_details: { reasoning_tokens: row.reasoning } } : null);
    const price = priceFor(row.model, startedAt, 'default');
    await ledger.begin({ attemptId: `synthetic-attempt-${i}`, operationId: `synthetic-operation-${i}`, provider: 'openai', providerScope: 'synthetic-project',
      userId: 'synthetic-owner', operation: row.operation, modelRequested: row.model, requestFingerprint: 'synthetic-fixed-request', startedAt });
    await ledger.finish(`synthetic-attempt-${i}`, { status: row.status, finishedAt: startedAt, modelResolved: row.model,
      providerRequestId: row.status === 'unknown' ? null : `synthetic-req-${i}`, providerResponseId: 'input' in row ? `synthetic-resp-${i}` : null,
      providerStatus: row.status === 'unknown' ? null : row.status, httpStatus: row.status === 'failed' ? 429 : row.status === 'unknown' ? null : 200,
      errorCode: row.status === 'failed' ? 'PROVIDER_REJECTED' : row.status === 'unknown' ? 'TIMEOUT' : null,
      usage, price, estimatedNanoUsd: estimateNanoUsd(usage, price) });
  }
  return ledger;
}

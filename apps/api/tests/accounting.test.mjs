import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateNanoUsd, normalizeUsage, priceFor, usd } from '../src/ai/accounting.ts';
import { periodFrom, summarize } from '../src/ai/ledger.ts';
import { demoLedger, SyntheticLedger } from '../fixtures/synthetic-ledger.ts';
import { providerUsage, ownerId } from './helpers.mjs';

const at = '2026-10-26T10:00:00.000Z';
const price = priceFor('gpt-5.4-nano', at, 'default');
test('cached input is subtracted once; reasoning is already output; exact integer price snapshot', () => {
  const usage = normalizeUsage(providerUsage);
  assert.equal(usage.state, 'reported');
  assert.deepEqual(usage.raw, providerUsage);
  assert.equal(estimateNanoUsd(usage, price), '378000'); // 600*200 + 400*20 + 200*1250
  assert.equal(usd('378000'), '$0.000378');
  assert.equal(usd('1499'), '$0.000001');
  assert.equal(usd('1500'), '$0.000002');
  assert.equal(usd('999999999'), '$1.000000');
  assert.equal(usd('1500000000', 0), '$2');
  assert.equal(price.source, 'https://developers.openai.com/api/docs/pricing');
  assert.equal(price.effectiveFrom, '2026-10-26T00:00:00.000Z');
  assert.equal(price.currency, 'USD');
});

test('missing/invalid usage, unknown models, nonstandard tiers, write cache and past dates remain unpriced', () => {
  for (const value of [null, {}, { ...providerUsage, input_tokens_details: {} },
    { ...providerUsage, total_tokens: 1199 }, { ...providerUsage, input_tokens: -1 },
    { ...providerUsage, output_tokens: 1.5 }, { ...providerUsage, input_tokens_details: { cached_tokens: 1001 } },
    { ...providerUsage, output_tokens_details: { reasoning_tokens: 201 } }, { ...providerUsage, output_tokens: Number.MAX_SAFE_INTEGER }]) {
    assert.equal(estimateNanoUsd(normalizeUsage(value), price), null);
  }
  assert.equal(priceFor('unlisted-model', at, 'default'), null);
  assert.equal(priceFor('constructor', at, 'default'), null);
  assert.equal(priceFor('gpt-5.4-nano', at, 'flex'), null);
  assert.equal(priceFor('gpt-5.4-nano', '2026-10-25T10:00:00.000Z', 'default'), null);
  const writes = normalizeUsage({ ...providerUsage, input_tokens_details: { cached_tokens: 400, cache_write_tokens: 100 } });
  assert.equal(estimateNanoUsd(writes, price), null);
  const partial = normalizeUsage({ ...providerUsage, output_tokens_details: undefined });
  assert.equal(partial.reasoning, null);
  assert.equal(estimateNanoUsd(partial, price), '378000');
});

test('raw usage drops payloads and arbitrary text while retaining documented numeric fields', () => {
  const usage = normalizeUsage({ ...providerUsage, prompt: 'secret', api_key: 'secret', input_tokens_details: { cached_tokens: 400, cache_write_tokens: 0, text: 'secret' } });
  assert.deepEqual(usage.raw, { ...providerUsage, input_tokens_details: { cached_tokens: 400, cache_write_tokens: 0 } });
});

test('attempt reservation and result ingestion are idempotent; a real new response counts as a new attempt', async () => {
  const ledger = new SyntheticLedger();
  const start = { attemptId: 'a1', operationId: 'operation1', operation: 'connection_check', provider: 'openai',
    providerScope: 'project1', userId: ownerId, modelRequested: 'gpt-5.4-nano', requestFingerprint: 'body1', startedAt: at };
  const result = { status: 'completed', finishedAt: at, modelResolved: 'gpt-5.4-nano', providerRequestId: 'req_1', providerResponseId: 'resp_1',
    providerStatus: 'completed', httpStatus: 200, errorCode: null, usage: normalizeUsage(providerUsage), price, estimatedNanoUsd: '378000' };
  const reserved = await Promise.all([ledger.begin(start), ledger.begin(start)]);
  assert.equal(reserved.filter(r => r.created).length, 1);
  await assert.rejects(ledger.begin({ ...start, requestFingerprint: 'changed' }), /MISMATCH/);
  await assert.rejects(ledger.begin({ ...start, userId: 'other' }), /MISMATCH/);
  await ledger.finish('a1', result);
  await ledger.finish('a1', result);
  await assert.rejects(ledger.finish('a1', { ...result, estimatedNanoUsd: '0' }), /MISMATCH/);
  await ledger.begin({ ...start, attemptId: 'a2' });
  assert.equal((await ledger.finish('a2', { ...result, providerRequestId: 'redelivery' })).duplicateOf, 'a1');
  await ledger.begin({ ...start, attemptId: 'a3' });
  await ledger.finish('a3', { ...result, providerResponseId: 'resp_2', providerRequestId: 'req_2' });
  await ledger.begin({ ...start, attemptId: 'a4' });
  await assert.rejects(ledger.finish('a4', { ...result, usage: normalizeUsage({ ...providerUsage, total_tokens: 1 }) }), /CONFLICT/);
  const report = await ledger.report({ from: '2026-10-26', to: '2026-10-26' });
  assert.equal(report.totals.attempts, 4);
  assert.equal(report.totals.duplicates, 1);
  assert.equal(report.totals.knownNanoUsd, '756000');
  assert.equal(report.totals.unknown, 1); // started reservation is never free
  assert.equal(report.totals.unknownCost, 1);
});

test('UTC periods validate calendar dates and include both boundaries, with empty/report breakdown states', async () => {
  assert.deepEqual(periodFrom(new URL('https://x/?from=2026-10-01&to=2026-10-26')), { from: '2026-10-01', to: '2026-10-26' });
  for (const query of ['from=2026-02-30', 'from=2026-10-27&to=2026-10-26', 'from=2024-01-01&to=2026-10-26', 'from=bad', 'from=2026-10-01&from=2026-10-02']) {
    assert.throws(() => periodFrom(new URL('https://x/?' + query)), /INVALID_PERIOD/);
  }
  const ledger = await demoLedger();
  const report = await ledger.report({ from: '2026-10-26', to: '2026-10-26' });
  assert.equal(report.totals.attempts, 6);
  assert.equal(report.totals.unknownCost, 3);
  assert.equal(report.totals.unknownUsage, 2);
  assert.equal(report.totals.unpricedUsage, 1);
  assert.equal(report.totals.reasoning, 440);
  assert.equal(report.models.length, 3);
  assert.equal(report.operations.length, 5);
  const empty = await ledger.report({ from: '2026-10-27', to: '2026-10-28' });
  assert.equal(empty.totals.attempts, 0);
  assert.equal(empty.totals.knownNanoUsd, '0');
  assert.deepEqual(empty.recent, []);
  assert.equal(summarize(Array.from({ length: 70 }, (_, i) => ({ ...report.recent[0], attemptId: String(i) })), report.period).recent.length, 50);
  const partial = structuredClone(report.recent.find(a => a.result.usage.state === 'reported'));
  partial.result.usage.reasoning = null;
  const partialReport = summarize([partial], report.period);
  assert.equal(partialReport.totals.reasoning, 0); // known subtotal only
  assert.equal(partialReport.totals.unknownReasoning, 1);
});

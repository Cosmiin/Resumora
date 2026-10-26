import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareConnection } from '../src/ai/openai.ts';
import { SyntheticLedger } from '../fixtures/synthetic-ledger.ts';
import { signingFixture, verifiedOwner, providerResponse, providerUsage } from './helpers.mjs';

const config = { OPENAI_API_KEY: 'synthetic-provider-secret-never-print', OPENAI_MODEL: 'gpt-5.4-nano', OPENAI_PROVIDER_SCOPE: 'project-test' };
const context = async () => ({ owner: await verifiedOwner(await signingFixture()), operationId: 'check-operation', attemptId: 'check-attempt' });

test('fixed bounded Responses request, disabled by default, synthetic transport never sends configured secrets', async () => {
  const ownerContext = await context();
  let calls = 0;
  const ledger = new SyntheticLedger();
  const transport = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-only');
    assert.equal(init.headers['X-Client-Request-Id'], ownerContext.attemptId);
    assert.deepEqual(JSON.parse(init.body), { model: 'gpt-5.4-nano', input: 'Reply with OK.', max_output_tokens: 32,
      store: false, stream: false, service_tier: 'default', tools: [], truncation: 'disabled' });
    return providerResponse();
  };
  await assert.rejects(prepareConnection(config, { ledger, transport }).check(ownerContext), /DISABLED/);
  await assert.rejects(prepareConnection(config, { ledger, execution: 'live', transport }).check(ownerContext), /DURABLE_LEDGER/);
  await assert.rejects(prepareConnection(config, { ledger, execution: 'synthetic' }).check(ownerContext), /SYNTHETIC_TRANSPORT/);
  assert.equal(calls, 0);
  const adapter = prepareConnection(config, { ledger, transport, execution: 'synthetic' });
  const attempt = await adapter.check(ownerContext);
  assert.equal(attempt.result.status, 'completed');
  assert.equal(attempt.result.providerRequestId, 'req_synthetic');
  assert.equal(attempt.result.providerResponseId, 'resp_synthetic');
  assert.equal(attempt.result.estimatedNanoUsd, '378000');
  assert.equal(attempt.userId, ownerContext.owner.subject);
  assert.equal(JSON.stringify(attempt).includes(config.OPENAI_API_KEY), false);
  assert.equal(JSON.stringify(attempt).includes('synthetic-private-model-output'), false);
  assert.equal(JSON.stringify(attempt).includes('Reply with OK.'), false);
  await adapter.check(ownerContext);
  assert.equal(calls, 1);
  await assert.rejects(prepareConnection(config, { ledger, transport, execution: 'synthetic', maxOutputTokens: 64 }).check(ownerContext), /CONTEXT_MISMATCH/);
  assert.equal(calls, 1);
});

test('failed, incomplete, missing-usage and unpriced responses preserve evidence without invented costs', async () => {
  for (const [overrides, httpStatus, expected] of [
    [{ error: { message: 'private provider error and key' }, usage: null, status: null }, 429, 'failed'],
    [{ status: 'incomplete' }, 200, 'incomplete'],
    [{ usage: null }, 200, 'completed'],
    [{ model: 'unpriced-model' }, 200, 'completed'],
    [{ status: 'failed' }, 200, 'failed'],
    [{ status: 'in_progress' }, 200, 'unknown'],
    [{ service_tier: 'priority' }, 200, 'completed'],
  ]) {
    let calls = 0;
    const adapter = prepareConnection(config, { ledger: new SyntheticLedger(), execution: 'synthetic', transport: async () => {
      calls++; return providerResponse(overrides, httpStatus);
    } });
    const result = (await adapter.check(await context())).result;
    assert.equal(calls, 1); // no automatic retry for 429/failed/unknown
    assert.equal(result.status, expected);
    assert.equal(JSON.stringify(result).includes('private provider error'), false);
    if (overrides.usage === null || overrides.model === 'unpriced-model' || overrides.service_tier === 'priority') assert.equal(result.estimatedNanoUsd, null);
    if (overrides.status === 'incomplete') assert.equal(result.usage.output, providerUsage.output_tokens);
  }
});

test('timeout and malformed/oversized responses remain unknown; replay never issues another request', async () => {
  const ownerContext = await context();
  for (const transport of [
    async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('private timeout details')), { once: true })),
    async () => new Response('invalid private response', { headers: { 'x-request-id': 'req_bad' } }),
    async () => new Response('x'.repeat(262_145)),
    async () => { throw new Error('connection secret'); },
  ]) {
    let calls = 0;
    const adapter = prepareConnection(config, { ledger: new SyntheticLedger(), execution: 'synthetic', timeoutMs: 5,
      transport: (...args) => { calls++; return transport(...args); } });
    const attempt = await adapter.check(ownerContext);
    assert.equal(attempt.result.status, 'unknown');
    assert.equal(attempt.result.estimatedNanoUsd, null);
    assert.equal(attempt.result.usage.state, 'missing');
    assert.ok(['TIMEOUT', 'NETWORK_OR_RESPONSE_UNKNOWN'].includes(attempt.result.errorCode));
    await adapter.check(ownerContext);
    assert.equal(calls, 1);
  }
});

test('limits/context and durable reservation fail before transport; settlement failure never repeats provider', async () => {
  let calls = 0;
  const transport = async () => { calls++; return providerResponse(); };
  for (const limits of [{ maxOutputTokens: 257 }, { maxOutputTokens: 15 }, { maxInputBytes: 4097 }, { timeoutMs: 30001 }]) {
    assert.throws(() => prepareConnection(config, { ledger: new SyntheticLedger(), ...limits }), /INVALID_LIMITS/);
  }
  const ownerContext = await context();
  assert.throws(() => prepareConnection(config, { ledger: new SyntheticLedger(), execution: 'misspelled', transport }), /INVALID_EXECUTION_MODE/);
  await assert.rejects(prepareConnection(config, { ledger: new SyntheticLedger(), execution: 'synthetic', maxInputBytes: 1, transport }).check(ownerContext), /REQUEST_TOO_LARGE/);
  await assert.rejects(prepareConnection({ ...config, OPENAI_MODEL: undefined }, { ledger: new SyntheticLedger(), execution: 'synthetic', transport }).check(ownerContext), /INVALID_CONTEXT/);
  const ledger = new SyntheticLedger();
  const failing = { durability: 'synthetic', begin: ledger.begin.bind(ledger), finish: async () => { throw new Error('storage unavailable'); } };
  const adapter = prepareConnection(config, { ledger: failing, execution: 'synthetic', transport });
  await assert.rejects(adapter.check(ownerContext), /storage unavailable/);
  assert.equal(calls, 1);
  const replay = await adapter.check(ownerContext);
  assert.equal(replay.result, null);
  assert.equal(calls, 1);
});

test('explicit retry under same operation records another distinct billable response', async () => {
  let calls = 0;
  const ledger = new SyntheticLedger();
  const adapter = prepareConnection(config, { ledger, execution: 'synthetic', transport: async () => providerResponse({ id: `resp_${++calls}` }) });
  const ownerContext = await context();
  const first = await adapter.check(ownerContext);
  const next = await adapter.check({ ...ownerContext, attemptId: 'retry-attempt' });
  assert.equal(first.operationId, next.operationId);
  const report = await ledger.report({ from: '2026-10-01', to: '2099-01-01' });
  assert.equal(report.totals.attempts, 2);
  assert.equal(report.totals.knownNanoUsd, '756000');
});

test('provider and transport failures emit no prompt, response, credential or raw-error logs', async () => {
  const ownerContext = await context();
  const logged = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const method of Object.keys(original)) console[method] = (...args) => logged.push(args);
  try {
    for (const transport of [async () => providerResponse({ error: { message: config.OPENAI_API_KEY } }, 500),
      async () => { throw new Error(config.OPENAI_API_KEY); }]) {
      await prepareConnection(config, { ledger: new SyntheticLedger(), execution: 'synthetic', transport }).check(ownerContext);
    }
  } finally { Object.assign(console, original); }
  assert.deepEqual(logged, []);
});

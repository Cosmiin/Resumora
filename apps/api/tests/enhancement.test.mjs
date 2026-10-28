import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareEnhancement, normalizeChatUsage } from '../src/ai/enhancement.ts';
import { assertRouteEvidence } from '../src/ai/region.ts';
import { projectEnhancementContext } from '../src/ai/enhancement-context.ts';
import { SyntheticLedger } from '../fixtures/synthetic-ledger.ts';

// All calls are synthetic. A mistaken default/global fetch must fail without touching a network.
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('REAL_NETWORK_FORBIDDEN'); };
test.after(() => { globalThis.fetch = originalFetch; });
const primary = { provider: 'openrouter', model: 'synthetic/model', providerScope: 'synthetic-router', upstreamEndpoint: 'synthetic/eu-test' };
const fallback = { provider: 'openai', model: 'synthetic-model', providerScope: 'synthetic-project', upstreamEndpoint: 'openai' };
const approval = route => ({ route, state: 'approved', evidenceId: 'synthetic-only-not-real-proof', expiresAt: '2099-01-01T00:00:00Z',
  countries: ['RO', 'DE'], covers: ['application', 'gateway', 'inference', 'subprocessors', 'logs'] });
const context = { targetId: 'role-1', locale: 'ro', facts: [{ id: 'fact-1', text: 'Maintained synthetic reporting.', sourceId: 'source-1',
  sourceClaimId: 'claim-1', sourceLineage: [{ sourceId: 'earlier-source', sourceClaimId: 'claim-old' }] }] };
const input = () => ({ operationId: 'synthetic-operation', userId: 'synthetic-owner', context: structuredClone(context) });
const usage = { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30, prompt_tokens_details: { cached_tokens: 5 },
  completion_tokens_details: { reasoning_tokens: 2 }, cost: 0.0002 };
const response = (provider = 'openrouter', overrides = {}, status = 200) => Response.json({
  id: `response-${provider}`, model: provider === 'openrouter' ? primary.model : fallback.model, provider: 'synthetic-provider', usage,
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: context.facts[0].text, factIds: ['fact-1'] }) } }], ...overrides,
}, { status });
const options = overrides => ({ execution: 'synthetic', primary, fallback, evidence: [approval(primary), approval(fallback)],
  ledger: new SyntheticLedger(), transport: async () => response(), ...overrides });

test('fail closed for absent/expired/incomplete/non-EU/model-mismatched route evidence before transport', async () => {
  for (const evidence of [[], [approval(primary)], [{ ...approval(primary), countries: ['CH'] }, approval(fallback)],
    [{ ...approval(primary), countries: ['GB'] }, approval(fallback)], [{ ...approval(primary), countries: ['NO'] }, approval(fallback)],
    [{ ...approval(primary), countries: [] }, approval(fallback)], [{ ...approval(primary), expiresAt: '2020-01-01' }, approval(fallback)],
    [{ ...approval(primary), state: 'unverified' }, approval(fallback)], [{ ...approval(primary), covers: ['inference'] }, approval(fallback)],
    [{ ...approval(primary), route: { ...primary, model: 'other' } }, approval(fallback)]]) {
    let calls = 0;
    await assert.rejects(prepareEnhancement(options({ evidence, transport: async () => { calls++; return response(); } })).propose(input()), /EU_ROUTE_UNAPPROVED/);
    assert.equal(calls, 0);
  }
  assert.throws(() => assertRouteEvidence({ ...primary, provider: 'other' }, approval(primary)), /INVALID_ROUTE/);
});

test('live mode/default disabled even with fabricated evidence; no fallback fetch or secret capability', async () => {
  for (const execution of [undefined, 'live', 'enabled']) {
    await assert.rejects(prepareEnhancement(options({ execution })).propose(input()), /DISABLED/);
  }
  await assert.rejects(prepareEnhancement(options({ transport: undefined })).propose(input()), /SYNTHETIC_TRANSPORT_REQUIRED/);
  await assert.rejects(prepareEnhancement(options({ ledger: { durability: 'durable' } })).propose(input()), /SYNTHETIC_TRANSPORT_REQUIRED/);
});

test('scoped projection omits contacts/identity/raw sources/unconfirmed facts and preserves answer/source boundary', () => {
  const fact = (id, status = 'user_authored') => ({ id, fieldId: id, sourceId: 'source-1', value: id, status });
  const draft = { language: 'ro', name: fact('private-name'), contacts: [{ value: fact('private-email') }],
    roles: [{ id: 'role-1', context: fact('context-1'), bullets: [fact('unconfirmed', 'extracted_unconfirmed')], company: fact('private-company') }],
    optionalSections: [], sources: [{ text: 'private-raw-document' }],
    answers: [{ id: 'answer-1', targetId: 'role-1', text: 'Confirmed synthetic answer.', status: 'confirmed', sourceId: 'source-answer' },
      { id: 'answer-draft', targetId: 'role-1', text: 'draft', status: 'draft' },
      { id: 'answer-other', targetId: 'other', text: 'other', status: 'confirmed', sourceId: 'source-other' }] };
  const projected = projectEnhancementContext(draft, 'role-1');
  assert.deepEqual(projected.facts.map(f => f.id), ['context-1', 'answer-1']);
  assert.equal(/private|unconfirmed|answer-draft|answer-other/.test(JSON.stringify(projected)), false);
  assert.throws(() => projectEnhancementContext(draft, 'other'), /INVALID_TARGET/);
  assert.equal(draft.answers[0].status, 'confirmed');
});

for (const kind of ['role', 'projects', 'certifications', 'volunteering', 'custom']) {
  for (const field of ['main', 'bullet']) {
    test(`confirmed answer projection requires matching eligible text and source: ${kind} ${field}`, () => {
      const originalText = 'Maintained synthetic reports.';
      const originalSource = 'source-answer-original';
      const cases = [
        { name: 'unchanged authored field', deduplicated: true },
        { name: 'unchanged confirmed field', status: 'user_confirmed', deduplicated: true },
        { name: 'revised answer', text: 'Automated synthetic reports.', sourceId: 'source-answer-revised' },
        { name: 'independently edited field', value: 'Reviewed synthetic reports.' },
        { name: 'same text from another source', sourceId: 'source-answer-reconfirmed' },
        { name: 'source retained only in lineage', fieldSourceId: 'local_manual', sourceLineage: [{ sourceId: originalSource }] },
        { name: 'unconfirmed linked field', status: 'extracted_unconfirmed', omitted: true },
        { name: 'draft linked field', status: 'draft', omitted: true },
        { name: 'empty linked field', value: ' ', omitted: true },
        { name: 'removed linked field', removed: true, omitted: true },
      ];
      for (const scenario of cases) {
        const linked = { id: 'linked-fact', fieldId: 'stable-field', value: scenario.value ?? originalText,
          status: scenario.status ?? 'user_authored', sourceId: scenario.fieldSourceId ?? originalSource,
          ...(scenario.sourceLineage ? { sourceLineage: scenario.sourceLineage } : {}) };
        const empty = { id: 'empty-fact', fieldId: 'empty-field', value: '', status: 'user_authored', sourceId: 'local_manual' };
        const main = field === 'main' && !scenario.removed ? linked : empty;
        const bullets = field === 'bullet' && !scenario.removed ? [linked] : [];
        const answer = { id: 'confirmed-answer', targetId: 'target-1', cvFieldId: 'stable-field', status: 'confirmed',
          text: scenario.text ?? originalText, sourceId: scenario.sourceId ?? originalSource };
        const draft = { language: 'en', answers: [answer],
          roles: kind === 'role' ? [{ id: 'target-1', context: main, bullets }] : [],
          optionalSections: kind === 'role' ? [] : [{ kind, entries: [{ id: 'target-1', details: main, bullets }] }] };
        const before = structuredClone(draft);
        const expected = scenario.omitted ? [] : [{ id: linked.id, text: linked.value, sourceId: linked.sourceId,
          ...(linked.sourceLineage ? { sourceLineage: linked.sourceLineage } : {}) }];
        if (!scenario.deduplicated) expected.push({ id: answer.id, text: answer.text, sourceId: answer.sourceId });
        assert.deepEqual(projectEnhancementContext(draft, 'target-1').facts, expected, scenario.name);
        assert.deepEqual(draft, before, scenario.name);
      }
    });
  }
}

test('one regional request, source-preserving proposal, no mutation or prompt/key/output in ledger; replay never regenerates', async () => {
  const ledger = new SyntheticLedger();
  let calls = 0;
  const adapter = prepareEnhancement(options({ ledger, transport: async (url, init) => {
    calls++;
    assert.equal(url, 'https://eu.openrouter.ai/api/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-only');
    assert.equal(init.redirect, 'manual');
    const body = JSON.parse(init.body);
    assert.equal(body.model, primary.model);
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.equal(body.max_completion_tokens, 256);
    assert.deepEqual(body.provider, { only: [primary.upstreamEndpoint], allow_fallbacks: false, require_parameters: true, data_collection: 'deny', zdr: true });
    assert.equal(body.tools, undefined);
    return response();
  } }));
  const result = await adapter.propose(input());
  assert.equal(result.proposal.status, 'proposal');
  assert.deepEqual(result.proposal.sources, context.facts);
  assert.equal(result.attempts[0].result.usage.cachedInput, 5);
  assert.equal(result.attempts[0].result.reportedCost.nanoUsd, '200000');
  assert.equal(JSON.stringify(result.attempts).includes(context.facts[0].text), false);
  assert.equal(JSON.stringify(result.attempts).includes('synthetic-only"'), false);
  assert.deepEqual(input().context, context);
  assert.equal((await adapter.propose(input())).proposal, null);
  assert.equal(calls, 1);
});

test('one fallback on bare availability or transport failure; attempts share operation and unknown primary cost stays unknown', async () => {
  for (const failure of [() => Response.json({}, { status: 503 }),
    ...[502, 503, 504].map(status => () => new Response(null, { status })),
    () => { throw new TypeError('private transport error'); }]) {
    const ledger = new SyntheticLedger();
    let calls = 0;
    const result = await prepareEnhancement(options({ ledger, transport: async (url, init) => {
      if (++calls === 1) return failure();
      assert.equal(url, 'https://eu.api.openai.com/v1/chat/completions');
      assert.equal(init.headers.Authorization, 'Bearer synthetic-only');
      assert.equal(JSON.parse(init.body).provider, undefined);
      return response('openai');
    } })).propose(input());
    assert.equal(calls, 2);
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].operationId, result.attempts[1].operationId);
    assert.notEqual(result.attempts[0].attemptId, result.attempts[1].attemptId);
    assert.equal(result.attempts[0].result.estimatedNanoUsd, null);
    assert.equal(result.attempts[0].result.usage.input, null);
    assert.equal(result.attempts[1].result.reportedCost, null); // no router/global rate applied to direct regional route
    const totals = (await ledger.report({ from: '2020-01-01', to: '2099-01-01' })).totals;
    assert.equal(totals.attempts, 2);
    assert.equal(totals.unknownUsage, 1);
    assert.equal(totals.unknownCost, 2);
    assert.equal(totals.knownNanoUsd, '0'); // known subtotal only, never a claim of free generation
  }
  let calls = 0;
  await prepareEnhancement(options({ transport: async () => { calls++; return Response.json({}, { status: 503 }); } })).propose(input());
  assert.equal(calls, 2); // no third request, no loop
});

test('no fallback on auth/quota/validation/region errors, redirects, refusal, unsupported facts, malformed or invalid encoding', async () => {
  const responses = [
    ...[400, 401, 403, 404, 422, 429, 500].map(status => () => Response.json({}, { status })),
    () => response('openrouter', { error: { code: 'region_policy', message: 'private' } }, 503),
    () => new Response(null, { status: 307, headers: { Location: 'https://outside.invalid/' } }),
    () => response('openrouter', { choices: [{ finish_reason: 'stop', message: { refusal: 'private' } }] }),
    () => response('openrouter', { choices: [{ finish_reason: 'content_filter', message: {} }] }),
    () => response('openrouter', { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: 'Invented 99% impact', factIds: ['fact-1'] }) } }] }),
    () => response('openrouter', { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: context.facts[0].text, factIds: ['unknown'] }) } }] }),
    () => response('openrouter', { choices: [{ finish_reason: 'length', message: {} }] }),
    () => new Response('private invalid JSON'), () => new Response(new Uint8Array([0xff])), () => new Response('x'.repeat(65_537)),
  ];
  for (const make of responses) {
    let calls = 0;
    const result = await prepareEnhancement(options({ transport: async () => { calls++; return make(); } })).propose(input());
    assert.equal(calls, 1);
    assert.equal(result.proposal, null);
    assert.equal(JSON.stringify(result.attempts).includes('private'), false);
  }
});

test('timeout permits at most one fallback within total budget; total deadline and caller abort stop ignored transports', async () => {
  let calls = 0;
  const result = await prepareEnhancement(options({ attemptTimeoutMs: 10, totalTimeoutMs: 1000, transport: async () => {
    if (++calls === 1) return new Promise(() => {});
    return response('openai');
  } })).propose(input());
  assert.equal(calls, 2);
  assert.equal(result.attempts[0].result.errorCode, 'TIMEOUT');
  assert.equal(result.attempts[0].result.reportedCost, null);
  assert.ok(result.proposal);
  calls = 0;
  const deadlineResult = await prepareEnhancement(options({ attemptTimeoutMs: 50, totalTimeoutMs: 10, transport: async () => { calls++; return new Promise(() => {}); } })).propose(input());
  assert.equal(calls, 1);
  assert.equal(deadlineResult.proposal, null);
  const abort = new AbortController();
  const abortedInput = { ...input(), signal: abort.signal };
  const pending = prepareEnhancement(options({ transport: async () => { abort.abort(); return new Promise(() => {}); } })).propose(abortedInput);
  assert.equal((await pending).attempts[0].result.errorCode, 'CANCELLED');
  assert.equal((await prepareEnhancement(options({})).propose(abortedInput)).attempts.length, 0);
});

test('ledger settlement failure closes fallback and replay; usage from failed output still counted with provenance', async () => {
  const ledger = new SyntheticLedger();
  let calls = 0;
  const adapter = prepareEnhancement(options({ ledger: { durability: 'synthetic', begin: ledger.begin.bind(ledger), finish: async () => { throw new Error('SETTLEMENT_FAILED'); } },
    transport: async () => { calls++; return Response.json({}, { status: 503 }); } }));
  await assert.rejects(adapter.propose(input()), /SETTLEMENT_FAILED/);
  assert.equal((await adapter.propose(input())).attempts[0].result, null);
  assert.equal(calls, 1);
  const costLedger = new SyntheticLedger();
  await prepareEnhancement(options({ ledger: costLedger, transport: async () => response('openrouter', { choices: [] }) })).propose(input());
  const totals = (await costLedger.report({ from: '2020-01-01', to: '2099-01-01' })).totals;
  assert.equal(totals.failed, 1);
  assert.equal(totals.input, 20);
  assert.equal(totals.cachedInput, 5);
  assert.equal(totals.knownNanoUsd, '200000');
  assert.equal(normalizeChatUsage({ ...usage, prompt_tokens_details: {} }).state, 'invalid'); // no invented cache zeros
});


test('unclassified transport exception cannot bypass policy by triggering fallback; payload and ledger use no configured keys or logs', async () => {
  const logged = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  const secret = 'synthetic-configured-secret-must-not-be-used';
  let calls = 0;
  for (const key of Object.keys(originals)) console[key] = (...args) => logged.push(args);
  try {
    const result = await prepareEnhancement(options({ OPENAI_API_KEY: secret, OPENROUTER_API_KEY: secret,
      transport: async (_url, init) => {
        calls++;
        assert.equal(JSON.stringify(init).includes(secret), false);
        throw new Error(secret);
      } })).propose(input());
    assert.equal(result.proposal, null);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(result.attempts[0].result.errorCode, 'OUTPUT_INVALID');
  } finally { Object.assign(console, originals); }
  assert.deepEqual(logged, []);
});

test('deadline bounds stalled body read and does not wait for late primary completion', async () => {
  let calls = 0, bodyCancelled = false;
  const result = await prepareEnhancement(options({ attemptTimeoutMs: 5, totalTimeoutMs: 1000,
    transport: async () => {
      if (++calls === 1) return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { bodyCancelled = true; } }));
      return response('openai');
    } })).propose(input());
  assert.equal(calls, 2);
  assert.equal(result.attempts[0].result.errorCode, 'TIMEOUT');
  assert.equal(result.attempts[0].result.usage.state, 'missing');
  assert.equal(bodyCancelled, true);
  assert.ok(result.proposal);
});

test('unrepresentable/invalid router charge remains unknown while reported zero is explicitly known', async () => {
  for (const cost of [undefined, null, '0.1', -1, 0.0000000001, 0]) {
    const result = await prepareEnhancement(options({ transport: async () => response('openrouter', { usage: { ...usage, cost } }) })).propose(input());
    assert.equal(result.attempts[0].result.reportedCost?.nanoUsd ?? null, cost === 0 ? '0' : null);
    assert.equal(result.attempts[0].result.estimatedNanoUsd, null);
  }
});


test('duplicate provider response cannot carry conflicting router cost evidence', async () => {
  const ledger = new SyntheticLedger();
  const a = await prepareEnhancement(options({ ledger })).propose(input());
  const previous = a.attempts[0];
  await ledger.begin({ ...previous, attemptId: 'other-delivery' });
  await assert.rejects(ledger.finish('other-delivery', { ...previous.result,
    reportedCost: { ...previous.result.reportedCost, nanoUsd: '999999' } }), /PROVIDER_EVIDENCE_CONFLICT/);
});

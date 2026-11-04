import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDraft, fact, newRole } from '@resumora/contracts/editor/model';
import { encodeDraft } from '@resumora/contracts/editor/transport';
import { getSkillInventory, skillReviewFingerprint } from '@resumora/contracts/intelligence/skills-improvement';
import { skillInventoryPolicy } from '@resumora/contracts/intelligence/skill-keywords';
import { intelligenceRoute, isIntelligencePath } from '../src/intelligence/routes.ts';
import { configuredIntelligenceRoute, configuredStructuredRunner } from '../src/intelligence/configured.ts';
import { SyntheticLedger } from '../fixtures/synthetic-ledger.ts';

async function fixture() {
  const draft = blankDraft(); draft.language = 'en';
  draft.contentLanguage = { locale: 'en', confidence: 'high', source: 'import', policyVersion: 'cv-language/1' };
  draft.technicalSkills = [fact('SQL')];
  const role = newRole(); role.context = fact('Prepared SQL reports.'); draft.roles = [role];
  const snapshot = { id: crypto.randomUUID(), revision: 1, payload: encodeDraft(draft) };
  const body = { snapshotId: snapshot.id, revision: 1, targetId: draft.id, operationId: crypto.randomUUID(), fingerprint: await skillReviewFingerprint(draft) };
  const result = { schemaVersion: 'skills-improvement/1', fingerprint: body.fingerprint, inventory: getSkillInventory(draft), removed: [] };
  const state = { head: snapshot, calls: 0, reservations: [], begins: 0, receipts: new Map() };
  const gateway = {
    loadSnapshot: async id => id === snapshot.id ? snapshot : null,
    loadDraft: async () => state.head,
    getWorkspaceOperation: async id => state.receipts.get(id) ?? null,
    beginWorkspaceOperation: async (id, kind, input) => {
      state.begins++; if (state.receipts.has(id)) return { created: false };
      state.receipts.set(id, { id, kind, input, state: 'processing', result: null }); return { created: true };
    },
    finishWorkspaceOperation: async (id, status, value) => { const receipt = { ...state.receipts.get(id), state: status, result: value }; state.receipts.set(id, receipt); return receipt; },
    reserveCareer: async input => { state.reservations.push(input); return true; },
  };
  const options = { enabled: true, userId: crypto.randomUUID(), gateway, workflow: {}, operations: { improveSkills: async input => { state.calls++; assert.equal(input.draft.id, draft.id); assert.equal(input.fingerprint, body.fingerprint); return structuredClone(result); } } };
  const request = (value = body, init = {}) => new Request('https://app.invalid/v1/intelligence/skills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value), ...init });
  const send = (value = body) => intelligenceRoute(request(value), options);
  return { draft, snapshot, body, result, state, gateway, options, request, send };
}
const changedHead = (f, edit) => { const d = structuredClone(f.draft); edit(d); f.state.head = { id: crypto.randomUUID(), revision: 2, payload: encodeDraft(d) }; };

test('skills route registers and persists one owned profile operation with replay', async () => {
  assert.equal(isIntelligencePath('/v1/intelligence/skills'), true);
  const f = await fixture(), original = structuredClone(f.snapshot);
  for (let i = 0; i < 2; i++) { const response = await f.send(); assert.equal(response.status, 200, await response.clone().text()); assert.deepEqual(await response.json(), f.result); }
  assert.equal(f.state.calls, 1); assert.equal(f.state.begins, 1);
  assert.deepEqual(f.state.reservations, [{ operationId: f.body.operationId, snapshotId: f.snapshot.id, revision: 1, targetId: f.draft.id, kind: 'rewrite' }]);
  const receipt = f.state.receipts.get(f.body.operationId); assert.equal(receipt.kind, 'rewrite'); assert.equal(receipt.input.skillsImprovement, true); assert.equal(receipt.input.fingerprint, f.body.fingerprint); assert.equal(receipt.state, 'ready');
  assert.deepEqual(f.snapshot, original);
});

test('owned snapshot, revision, profile target and fingerprint are checked before reservations', async () => {
  for (const [change, status] of [[b => { b.snapshotId = crypto.randomUUID(); }, 404], [b => { b.revision = 3; }, 404], [b => { b.targetId = 'foreign-profile'; }, 422], [b => { b.fingerprint = '0'.repeat(64); }, 409], [b => { b.fingerprint = 'bad'; }, 400], [b => { b.extra = true; }, 400]]) {
    const f = await fixture(), body = { ...f.body }; change(body);
    const response = await f.send(body); assert.equal(response.status, status, await response.text()); assert.equal(f.state.calls, 0); assert.equal(f.state.begins, 0); assert.equal(f.state.reservations.length, 0);
  }
});

test('unrelated metadata saves permit the same input while edited skill and experience inputs fail stale', async () => {
  for (const [edit, status] of [[d => { d.presentation.templateVersionId = 'folio-v1'; }, 200], [d => { d.skillReview = { operationId: crypto.randomUUID(), snapshotId: crypto.randomUUID(), revision: 2, fingerprint: 'a'.repeat(64) }; }, 200], [d => { d.technicalSkills[0].value = 'Python'; }, 409], [d => { d.skillReserves = { technicalSkills: [fact('Python')], professionalSkills: [] }; }, 409], [d => { d.roles[0].context.value = 'Owned Python automation.'; }, 409], [d => { d.id = 'other-profile'; }, 409]]) {
    const f = await fixture(); changedHead(f, edit); const response = await f.send();
    assert.equal(response.status, status, await response.text()); assert.equal(f.state.calls, status === 200 ? 1 : 0);
  }
});

test('edits during paid work persist the completed result but withhold stale output and never rerun', async () => {
  const f = await fixture(); f.options.operations.improveSkills = async () => { f.state.calls++; changedHead(f, d => { d.roles[0].context.value = 'Changed responsibilities'; }); return f.result; };
  const response = await f.send(); assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'STALE_INPUT');
  assert.deepEqual(f.state.receipts.get(f.body.operationId).result, f.result); assert.equal(f.state.receipts.get(f.body.operationId).state, 'ready');
  assert.equal((await f.send()).status, 409); assert.equal(f.state.calls, 1);
});

test('the final input fence runs after receipt persistence as well', async () => {
  const f = await fixture(), finish = f.gateway.finishWorkspaceOperation;
  f.gateway.finishWorkspaceOperation = async (...args) => { const receipt = await finish(...args); changedHead(f, d => { d.technicalSkills[0].value = 'Rust'; }); return receipt; };
  const response = await f.send(); assert.equal(response.status, 409); assert.equal(f.state.receipts.get(f.body.operationId).state, 'ready'); assert.equal(f.state.calls, 1);
});

test('receipt replay also refuses edits made while fetching a completed receipt', async () => {
  const f = await fixture(); assert.equal((await f.send()).status, 200);
  const get = f.gateway.getWorkspaceOperation;
  f.gateway.getWorkspaceOperation = async id => { const result = await get(id); changedHead(f, d => { d.roles[0].context.value = 'Updated duties'; }); return result; };
  const response = await f.send(); assert.equal(response.status, 409); assert.equal(f.state.calls, 1);
});

test('processing, unknown and failed receipts never invoke another provider attempt', async () => {
  for (const status of ['processing', 'unknown', 'failed']) {
    const f = await fixture(); assert.equal((await f.send()).status, 200); f.state.receipts.get(f.body.operationId).state = status;
    const response = await f.send(); assert.equal(response.status, status === 'failed' ? 502 : 409); assert.equal(f.state.calls, 1); assert.equal(f.state.begins, 1);
  }
});

test('a receipt owned by a different operation purpose cannot be reused', async () => {
  const f = await fixture(); assert.equal((await f.send()).status, 200); f.state.receipts.get(f.body.operationId).input.skillsImprovement = false;
  const response = await f.send(); assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'IDEMPOTENCY_BODY_MISMATCH'); assert.equal(f.state.calls, 1);
});

test('disabled AI, missing durable receipt methods and unsettled language stop before paid work', async () => {
  for (const configure of [f => { f.options.enabled = false; }, f => { delete f.gateway.beginWorkspaceOperation; }, f => { delete f.gateway.finishWorkspaceOperation; }, f => { delete f.gateway.getWorkspaceOperation; }]) {
    const f = await fixture(); configure(f); const response = await f.send(); assert.equal(response.status, 503); assert.equal(f.state.calls, 0); assert.equal(f.state.reservations.length, 0);
  }
  const f = await fixture(); delete f.draft.contentLanguage; f.draft.roles[0].context.value = 'Préparer les rapports de gestion pour les équipes commerciales et analyser les résultats de chaque mois afin de soutenir les décisions des responsables.';
  f.snapshot.payload = encodeDraft(f.draft); f.body.fingerprint = await skillReviewFingerprint(f.draft);
  const response = await f.send(); assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'CONTENT_LANGUAGE_REQUIRED'); assert.equal(f.state.calls, 0);
});

test('lost ready-receipt acknowledgement recovers the completed result without duplicate work', async () => {
  const f = await fixture(), finish = f.gateway.finishWorkspaceOperation; let writes = 0;
  f.gateway.finishWorkspaceOperation = async (...args) => { writes++; await finish(...args); throw Error('lost acknowledgement'); };
  const response = await f.send(); assert.equal(response.status, 200); assert.equal(writes, 1); assert.equal(f.state.calls, 1); assert.equal((await f.send()).status, 200); assert.equal(f.state.calls, 1);
});

const env = { AI_PAID_INFERENCE: 'on', AI_WORKER_SECRET: 'synthetic-worker-secret-not-real-32-bytes', AI_PROCESSING_POLICY: 'synthetic-policy', OPENROUTER_API_KEY: 'synthetic-router', OPENAI_API_KEY: 'synthetic-direct', OPENROUTER_ENDPOINT: 'synthetic', OPENROUTER_MODEL: 'router-career', OPENAI_MODEL: 'direct-career' };
const reply = (body, value) => Response.json({ id: crypto.randomUUID(), model: body.model, usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });

test('configured Improve skills reserves every stage, uses skill budgets and survives browser disconnect', async () => {
  const f = await fixture(), ledger = new SyntheticLedger(), reservations = new Set(), calls = [], background = [], controller = new AbortController();
  const gateway = { ...f.gateway, createImportStore: () => ({}), reserveEnhancement: async input => { assert.equal(input.targetId, f.draft.id); assert.equal(input.snapshotId, f.snapshot.id); const created = !reservations.has(input.operationId); reservations.add(input.operationId); return { created }; }, beginAttempt: async input => { assert.ok(reservations.has(input.operationId), 'every child stage is reserved before usage accounting'); return ledger.begin(input); }, finishAttempt: (id, result) => ledger.finish(id, result) };
  const response = await configuredIntelligenceRoute(f.request(f.body, { signal: controller.signal }), env, gateway, f.options.userId, async (_url, init) => {
    const body = JSON.parse(init.body), data = JSON.parse(body.messages[1].content); calls.push(body);
    assert.equal(body.max_completion_tokens, skillInventoryPolicy.outputTokens);
    if (calls.length === 1) controller.abort(); assert.equal(init.signal.aborted, false);
    return reply(body, data.existing?.some(s => s.id) ? { skills: data.existing.map(s => ({ label: s.label, category: s.category, sourceSkillIds: [s.id], importance: 'core' })), removed: [] } : { skills: [] });
  }, { waitUntil: promise => background.push(promise) });
  assert.equal(response.status, 200, await response.clone().text()); await Promise.all(background);
  assert.equal(calls.length, 2); assert.equal(reservations.size, 3); assert.equal(f.state.receipts.get(f.body.operationId).state, 'ready'); assert.ok(background.length);
  const repeated = await configuredIntelligenceRoute(f.request(), env, gateway, f.options.userId, () => assert.fail('ready receipt cannot repeat provider work'));
  assert.equal(repeated.status, 200);
});

test('cleanup stage receives the skill token budget and classifies unsupported output accurately', async () => {
  const f = await fixture(), ledger = new SyntheticLedger(); let calls = 0;
  const run = configuredStructuredRunner(env, f.options.userId, { durability: 'durable', begin: s => ledger.begin(s), finish: (id, r) => ledger.finish(id, r), report: async () => ({}) }, AbortSignal.timeout(1000), async (_url, init) => { calls++; const body = JSON.parse(init.body); assert.equal(body.max_completion_tokens, skillInventoryPolicy.outputTokens); return reply(body, {}); });
  await assert.rejects(run({ operationId: crypto.randomUUID(), userId: f.options.userId, operation: 'cv_rewrite', tier: 'career', promptVersion: 'skills-improvement/3', input: { locale: 'en' }, system: 'Synthetic test', schema: { type: 'object' }, maxOutputTokens: skillInventoryPolicy.outputTokens, validateOutput: () => { throw Error('AI_OUTPUT_INVALID'); } }), /AI_OUTPUT_INVALID/);
  assert.ok(calls > 0);
});

test('a latest-head read outage after inference still persists the validated result', async () => {
  const f = await fixture();
  f.options.operations.improveSkills = async () => { f.state.calls++; f.gateway.loadDraft = async () => { throw Error('temporary head outage'); }; return f.result; };
  const response = await f.send(); assert.equal(response.status, 409);
  assert.equal(f.state.receipts.get(f.body.operationId).state, 'ready'); assert.deepEqual(f.state.receipts.get(f.body.operationId).result, f.result);
});

test('concurrent dispatches share one durable operation and one provider execution', async () => {
  const f = await fixture(); let release, started;
  const pending = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { started = resolve; });
  f.options.operations.improveSkills = async () => { f.state.calls++; started(); await pending; return f.result; };
  const first = f.send();
  await Promise.race([entered, first.then(() => { if (!f.state.calls) assert.fail('Generation did not start'); })]);
  const concurrent = await f.send(); assert.equal(concurrent.status, 409); release();
  assert.equal((await first).status, 200); assert.equal(f.state.calls, 1); assert.equal(f.state.reservations.length, 1);
});

test('configured Improve skills refuses a gateway without receipt persistence before reservations', async () => {
  const f = await fixture(); let reservations = 0;
  const gateway = { ...f.gateway, finishWorkspaceOperation: undefined, createImportStore: () => ({}), reserveEnhancement: async () => { reservations++; return { created: true }; } };
  const response = await configuredIntelligenceRoute(f.request(), env, gateway, f.options.userId, () => assert.fail('No provider without durable receipts'));
  assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'AI_UNCONFIGURED'); assert.equal(reservations, 0); assert.equal(f.state.begins, 0);
});

// JSONB/object transports may return identical data with different property order.
function storedJson(value) {
  if (Array.isArray(value)) return value.map(storedJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().reverse().map(key => [key, storedJson(value[key])]));
}
test('a newly saved profile stays eligible after database JSON object ordering changes', async () => {
  const f = await fixture();
  f.snapshot.payload = storedJson(f.snapshot.payload);
  const response = await f.send();
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(f.state.calls, 1);
});
test('a reordered latest head remains compatible but a real skill edit still conflicts', async () => {
  const f = await fixture();
  f.state.head = {...f.snapshot, id:crypto.randomUUID(), revision:2, payload:storedJson(f.snapshot.payload)};
  const response = await f.send();
  assert.equal(response.status, 200, await response.clone().text());
  f.state.head.payload.content.technicalSkills[0].value = 'Changed skill';
  const stale = await f.send();
  assert.equal(stale.status, 409);
  assert.equal(f.state.calls, 1);
});

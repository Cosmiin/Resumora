import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cvRoute } from '../src/cv/routes.ts';
import { blankDraft } from '@resumora/contracts/editor/model';
import { encodeDraft, decodeDraft } from '@resumora/contracts/editor/transport';

const req = (path = '', body, method) => new Request('https://resumora.invalid/v1/base-cv' + path, {
  method: method ?? (body === undefined ? 'GET' : 'POST'),
  ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});
const write = (draft, expectedRevision = 0) => ({ draft, expectedRevision, mode: 'autosave', requestId: crypto.randomUUID() });
// Authenticated owner-scoped durable-port double, not Supabase/RLS evidence.
function store() {
  const rows = [], requests = new Map();
  const error = (status, code) => { throw Object.assign(new Error('private upstream detail'), { status, code }); };
  function publish(input, reason, payload, restoredFrom) {
    const body = JSON.stringify({ input, reason });
    const prior = requests.get(input.requestId);
    if (prior) return prior.body === body ? structuredClone(prior.row) : error(409, 'IDEMPOTENCY_BODY_MISMATCH');
    if (input.expectedRevision !== rows.length) return error(409, 'VERSION_CONFLICT');
    const row = { id: crypto.randomUUID(), parentId: rows.at(-1)?.id ?? null, revision: rows.length + 1,
      createdAt: new Date().toISOString(), reason, payload: structuredClone(payload), ...(restoredFrom ? { restoredFrom } : {}) };
    rows.push(row); requests.set(input.requestId, { body, row }); return structuredClone(row);
  }
  return {
    loadDraft: async () => structuredClone(rows.at(-1) ?? null),
    draftHistory: async () => structuredClone(rows).reverse(),
    saveDraft: async input => publish(input, input.mode === 'autosave' ? 'autosave' : 'save', input.payload),
    restoreDraft: async input => {
      const old = rows.find(row => row.id === input.snapshotId);
      if (!old) return error(404, 'RESOURCE_NOT_FOUND');
      return publish(input, 'restore', old.payload, old.id);
    },
  };
}
test('CV roundtrip retains incomplete values, exact context and stable links without publication', async () => {
  const gateway = store(), draft = blankDraft();
  draft.answers.push({ id: 'answer-1', targetId: 'role-1', question: 'impact', questionText: 'What changed?',
    text: 'No number was measured.', status: 'draft' });
  draft.sources.push({ id: 'answer-source', kind: 'answer', label: 'What changed?', text: draft.answers[0].text });
  draft.name.status = 'extracted_unconfirmed';
  const saved = await (await cvRoute(req('/save', write(draft)), gateway)).json();
  assert.equal(saved.revision, 1); assert.deepEqual(saved.draft, draft);
  assert.equal(saved.draft.roles.length, 0); assert.equal(saved.draft.name.status, 'extracted_unconfirmed');
  assert.deepEqual(await (await cvRoute(req(), gateway)).json(), saved);
  const next = structuredClone(draft); next.name.value = 'Synthetic edit';
  next.answers[0].cvFieldId = 'stable-contribution';
  const second = await (await cvRoute(req('/save', write(next, 1)), gateway)).json();
  const restored = await (await cvRoute(req('/restore', { snapshotId: saved.id, expectedRevision: 2, requestId: crypto.randomUUID() }), gateway)).json();
  assert.equal(restored.revision, 3); assert.equal(restored.parentId, second.id); assert.equal(restored.restoredFrom, saved.id);
  assert.deepEqual(restored.draft, draft);
  const history = await (await cvRoute(req('/history'), gateway)).json();
  assert.deepEqual(history.map(row => row.revision), [3, 2, 1]);
  assert.equal(history[1].draft.answers[0].cvFieldId, 'stable-contribution');
  assert.deepEqual(history[2].draft, draft);
  assert.deepEqual(await (await cvRoute(req(), store())).json(), null);
});
test('stale writes, request replay/mismatch and cross-owner snapshot restore fail without clobbering', async () => {
  const a = store(), b = store(), input = write(blankDraft());
  const first = await (await cvRoute(req('/save', input), a)).json();
  assert.deepEqual(await (await cvRoute(req('/save', input), a)).json(), first);
  assert.equal((await cvRoute(req('/save', { ...input, mode: 'checkpoint' }), a)).status, 422);
  const changed = structuredClone(input); changed.draft.name.value = 'changed';
  assert.deepEqual(await (await cvRoute(req('/save', changed), a)).json(), { error: { code: 'requestMismatch' } });
  assert.deepEqual(await (await cvRoute(req('/save', write(changed.draft)), a)).json(), { error: { code: 'conflict' } });
  assert.equal((await cvRoute(req('/restore', { snapshotId: first.id, expectedRevision: 0, requestId: crypto.randomUUID() }), b)).status, 404);
  assert.deepEqual(await (await cvRoute(req(), a)).json(), first);
});
test('checkpoint validation and malformed/oversized requests never invoke gateway writes', async () => {
  let calls = 0;
  const gateway = { saveDraft() { calls++; throw new Error('unexpected'); } };
  assert.equal((await cvRoute(req('/save', { ...write(blankDraft()), mode: 'checkpoint' }), gateway)).status, 422);
  for (const body of [null, [], {}, { ...write(blankDraft()), userId: crypto.randomUUID() },
    { ...write(blankDraft()), expectedRevision: -1 }, { ...write(blankDraft()), draft: { id: 'bad' } },
    { ...write(blankDraft()), requestId: 'dev_uuid' }])
    assert.equal((await cvRoute(req('/save', body), gateway)).status, 400);
  assert.equal((await cvRoute(req('/save', { ...write(blankDraft()), huge: 'x'.repeat(1048576) }), gateway)).status, 413);
  assert.equal((await cvRoute(req('/save', undefined, 'GET'), gateway)).status, 405);
  assert.equal(calls, 0);
});
test('upstream diagnostics are sanitized and expired outcomes are not retried', async () => {
  for (const [status, code, expected] of [[403, 'RESOURCE_FORBIDDEN', 404], [401, 'AUTHENTICATION_REQUIRED', 401], [410, 'REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE', 410], [500, 'secret-diagnostic', 503]]) {
    let calls = 0;
    const response = await cvRoute(req(), { async loadDraft() { calls++; throw Object.assign(new Error('secret-details'), { status, code }); } });
    assert.equal(response.status, expected); assert.equal(calls, 1);
    assert.ok(!JSON.stringify(await response.json()).includes('secret'));
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
});
test('versioned envelope preserves data without aliasing or accepting unknown versions', () => {
  const draft = blankDraft(), envelope = encodeDraft(draft);
  assert.equal(Object.hasOwn(envelope.content, 'answers'), false);
  const decoded = decodeDraft(envelope); decoded.name.value = 'caller edit';
  assert.notEqual(envelope.content.name.value, decoded.name.value);
  assert.throws(() => decodeDraft({ ...envelope, schemaVersion: 'future' }));
});
test('history uses bounded revision cursor and rejects malformed cursors', async () => {
  const calls = [];
  const gateway = { async draftHistory(input) { calls.push(input); return []; } };
  assert.equal((await cvRoute(req('/history'), gateway)).status, 200);
  assert.equal((await cvRoute(req('/history?beforeRevision=21'), gateway)).status, 200);
  assert.deepEqual(calls, [{ limit: 20 }, { beforeRevision: 21, limit: 20 }]);
  for (const query of ['?beforeRevision=-1', '?beforeRevision=0', '?beforeRevision=1.5', '?limit=999', '?beforeRevision=2&beforeRevision=1'])
    assert.equal((await cvRoute(req('/history' + query), gateway)).status, 400);
  assert.equal(calls.length, 2);
});

test('template version choices survive route/envelope history and restore, including future references', async () => {
  const gateway = store(), draft = blankDraft();
  const first = await (await cvRoute(req('/save', write(draft)), gateway)).json();
  let revision = first.revision;
  const refs = ['template_folio_2_1_0', 'template_meridian_2_1_0', 'template_signal_2_1_0', 'template_archive_2_1_0', 'template_monograph_2_1_0', 'template_future_9_0_0'];
  for (const templateVersionId of refs) {
    draft.presentation.templateVersionId = templateVersionId;
    const response = await cvRoute(req('/save', write(draft, revision)), gateway);
    assert.equal(response.status, 200);
    const row = await response.json(); revision = row.revision;
    assert.equal(row.draft.presentation.templateVersionId, templateVersionId);
    assert.deepEqual(row.draft, draft);
  }
  const history = await (await cvRoute(req('/history'), gateway)).json();
  assert.deepEqual(history.slice(0, refs.length).map(row => row.draft.presentation.templateVersionId), [...refs].reverse());
  const restored = await (await cvRoute(req('/restore', { snapshotId: first.id, expectedRevision: revision, requestId: crypto.randomUUID() }), gateway)).json();
  assert.equal(restored.draft.presentation.templateVersionId, undefined);
  assert.equal(history[0].draft.presentation.templateVersionId, 'template_future_9_0_0');
});

test('invalid template version shapes are rejected before any persistence write', async () => {
  let calls = 0;
  const gateway = { async saveDraft() { calls++; throw new Error('unexpected'); } };
  for (const value of ['', null, 42, { id: 'template_folio_2_1_0' }, 'T01@2.1.0', 'x'.repeat(81)]) {
    const draft = blankDraft(); draft.presentation.templateVersionId = value;
    assert.equal((await cvRoute(req('/save', write(draft)), gateway)).status, 400);
  }
  assert.equal(calls, 0);
});

test('template choice and typed saved photo survive one envelope and immutable restore', async () => {
  const gateway = store(), draft = blankDraft();
  draft.presentation.templateVersionId = 'template_archive_2_1_0';
  draft.presentation.photo = { assetId: '11111111-1111-4111-8111-111111111111',
    crop: { version: 1, centerX: .6, centerY: .4, zoom: 2 }, shape: 'circle', visible: true };
  const first = await (await cvRoute(req('/save', write(draft)), gateway)).json();
  assert.deepEqual(first.draft.presentation, draft.presentation);
  const changed = structuredClone(draft); changed.presentation.templateVersionId = 'template_signal_2_1_0';
  changed.presentation.photo.visible = false; changed.presentation.photo.shape = 'square';
  await cvRoute(req('/save', write(changed, 1)), gateway);
  const restored = await (await cvRoute(req('/restore', { snapshotId: first.id, expectedRevision: 2, requestId: crypto.randomUUID() }), gateway)).json();
  assert.deepEqual(restored.draft.presentation, draft.presentation);
  const malformed = structuredClone(changed); malformed.presentation.photo.crop.zoom = 9;
  assert.equal((await cvRoute(req('/save', write(malformed, 3)), gateway)).status, 400);
});

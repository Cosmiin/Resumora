import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDraft, newRole, newOptionalEntry, fact } from '../../../packages/contracts/src/editor/model.ts';
import { encodeDraft, decodeDraft } from '../../../packages/contracts/src/editor/transport.ts';
import { projectJobEditor, isJobEditorPayload, jobEditorFacts } from '../../../packages/contracts/src/jobs/documents.ts';
import { jobDocumentsRoute } from '../src/jobs/documents.ts';
import { createDatabaseGateway } from '../src/db/supabase.ts';
const uid = () => crypto.randomUUID();
function fixture() {
  const d = blankDraft(); d.name.value = 'Synthetic user';
  const role = newRole(); role.company.value = 'Source company'; role.title.value = 'Engineer';
  role.context.value = 'Maintained PLC systems'; role.bullets.push(fact('Reduced downtime'));
  d.roles.push(role);
  const entry = newOptionalEntry(); entry.details.value = 'Built a prototype';
  d.optionalSections.push({ id: 'projects', kind: 'projects', label: 'Projects', entries: [entry] });
  d.presentation.order.push('projects');
  d.answers.push({ id: 'answer', targetId: role.id, question: 'impact', questionText: 'Exact question?', text: 'Exact answer', status: 'confirmed', sourceId: 'local_manual',
    cvFieldId: role.context.fieldId });
  d.presentation.templateVersionId = 'future-template-v9';
  d.presentation.photo = { assetId: uid(), shape: 'circle', visible: true, crop: { version: 1, centerX: .4, centerY: .6, zoom: 1.2 } };
  const source = { id: uid(), revision: 4, payload: encodeDraft(d), parentId: null, reason: 'save', createdAt: '2026-10-29T00:00:00Z' };
  const payload = { schemaVersion: 'resumora-job-editor/1', acceptance: 'accepted', source: { snapshotId: source.id, revision: 4 },
    job: { id: uid(), versionId: null, fingerprint: 'a'.repeat(64) }, selectedFacts: jobEditorFacts(d).map(f => f.ref), selectedAnswerIds: ['answer'],
    wording: [{ targetId: role.id, text: 'Maintained PLC systems and reduced downtime.', origin: 'ai_generated', acceptance: 'accepted',
      valueIds: [role.context.id, role.bullets[0].id], answerIds: ['answer'] }],
    presentation: {}, localAdditions: [] };
  const row = { id: uid(), documentId: uid(), revision: 1, parentId: null, createdAt: source.createdAt, reason: 'save', payload, sourcePayload: source.payload };
  return { d, role, entry, source, payload, row };
}
const req = (jobId, action = '', body, query = '') => new Request(`https://api.test/v1/jobs/${jobId}/cv${action}${query}`, body === undefined ? {} : {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('projection retains exact facts, answers, provenance, unknown template and photo independently of Base', () => {
  const { d, source, payload, role } = fixture(); const original = structuredClone(source);
  payload.localAdditions = [{ id: 'job_local_skill', targetId: 'technicalSkills', kind: 'technicalSkill', text: 'Local skill', scope: 'job-only', origin: 'user_authored' }];
  const projected = projectJobEditor(source.payload, payload);
  assert.deepEqual(projected.roles[0], d.roles[0]); assert.deepEqual(projected.answers, d.answers);
  assert.deepEqual(projected.presentation.photo, d.presentation.photo);
  assert.equal(projected.presentation.templateVersionId, 'future-template-v9');
  assert.equal(projected.presentation.approvedWording[role.id].text, payload.wording[0].text);
  assert.equal(projected.presentation.approvedWording[role.id].sources.at(-1).text, 'Exact answer');
  assert.equal(projected.technicalSkills[0].sourceId, 'job_local_manual');
  assert.equal(projected.technicalSkills[0].status, 'user_authored');
  assert.deepEqual(source, original); assert.deepEqual(decodeDraft(encodeDraft(projected)), projected);
  const second = structuredClone(payload); second.job.id = uid(); second.wording[0].text = 'Other wording';
  assert.equal(projectJobEditor(source.payload, second).presentation.approvedWording[role.id].text, 'Other wording');
  assert.equal(projected.presentation.approvedWording[role.id].text, payload.wording[0].text);
});

test('pending proposals, fact/title/date/source re-attestation, wrong entity/value/evidence and unscoped local additions are rejected', () => {
  const { source, payload, role } = fixture();
  for (const mutate of [
    p => p.acceptance = 'pending', p => p.wording[0].acceptance = 'pending', p => p.wording[0].title = 'CEO',
    p => p.presentation.approvedWording = {}, p => p.presentation.contributionHtml = { [role.id]: 'unreviewed' },
    p => p.wording[0].targetId = role.title.fieldId, p => p.wording[0].valueIds = [role.title.id],
    p => p.wording[0].valueIds = [role.start.id], p => p.selectedFacts[0].sourceId = 'foreign',
    p => p.selectedFacts[0].valueId = 'foreign', p => p.selectedFacts[0].entityId = 'foreign',
    p => p.selectedAnswerIds = ['foreign'], p => p.wording[0].answerIds = ['foreign'],
    p => p.selectedFacts.push(p.selectedFacts[0]), p => p.wording.push(p.wording[0]),
    p => p.localAdditions = [{ id: 'job_local_a', targetId: 'identity', kind: 'title', text: 'CEO', scope: 'job-only', origin: 'user_authored' }],
    p => p.localAdditions = [{ id: 'job_local_a', targetId: 'technicalSkills', kind: 'technicalSkill', text: 'SQL', scope: 'career', origin: 'user_authored' }],
    p => p.presentation.order = ['foreign'],
  ]) {
    const bad = structuredClone(payload); mutate(bad);
    assert.throws(() => projectJobEditor(source.payload, bad));
  }
  const pending = structuredClone(source.payload); pending.content.roles[0].context.status = 'extracted_unconfirmed';
  assert.throws(() => projectJobEditor(pending, payload));
  const unconfirmed = structuredClone(source.payload); unconfirmed.answers[0].status = 'draft';
  assert.throws(() => projectJobEditor(unconfirmed, payload));
  assert.equal(isJobEditorPayload(payload), true);
});

test('route uses pinned owned snapshot; save/load/history/version/restore/delete remain scoped with strict bodies and cursors', async () => {
  const { source, payload, row } = fixture(); const calls = [];
  const gateway = {
    loadSnapshot: async id => { calls.push(['source', id]); return source; },
    jobEditorContext: async id => ({ job: payload.job, source: payload.source }),
    saveJobEditor: async (id, input) => { calls.push(['save',id,input]); return row; },
    loadJobEditor: async (...args) => { calls.push(['load',...args]); return row; },
    jobEditorHistory: async (...args) => { calls.push(['history',...args]); return [row]; },
    restoreJobEditor: async (...args) => { calls.push(['restore',...args]); return { ...row, revision: 2, reason: 'restore', restoredFrom: row.id }; },
    deleteJobEditor: async (...args) => { calls.push(['delete',...args]); return { documentId: row.documentId, deleted: true }; },
  };
  const save = { requestId: uid(), expectedRevision: 0, documentId: null, payload };
  let response = await jobDocumentsRoute(req(payload.job.id, '/save', save), gateway); assert.equal(response.status, 200);
  const saved = await response.json(); assert.equal(saved.draft.presentation.templateVersionId, 'future-template-v9');
  assert.equal('sourcePayload' in saved, false); assert.deepEqual(saved.payload, payload);
  assert.equal(calls[1][1], payload.job.id); assert.deepEqual(calls[1][2], save);
  assert.equal((await jobDocumentsRoute(req(payload.job.id), gateway)).status, 200);
  await jobDocumentsRoute(req(payload.job.id, '', undefined, `?documentId=${row.documentId}&versionId=${row.id}`), gateway);
  assert.deepEqual(calls.at(-1), ['load',payload.job.id,row.documentId,row.id]);
  await jobDocumentsRoute(req(payload.job.id, '/history', undefined, `?documentId=${row.documentId}&beforeRevision=2`), gateway);
  assert.deepEqual(calls.at(-1), ['history',payload.job.id,row.documentId,{ beforeRevision: 2, limit: 20 }]);
  const command = { requestId: uid(), documentId: row.documentId, expectedRevision: 1 };
  assert.equal((await jobDocumentsRoute(req(payload.job.id, '/restore', { ...command, versionId: row.id }), gateway)).status, 200);
  assert.equal((await jobDocumentsRoute(req(payload.job.id, '/delete', command), gateway)).status, 200);
  for (const query of ['?documentId=foreign', `?documentId=${row.documentId}&beforeRevision=0`, `?documentId=${row.documentId}&beforeRevision=2&beforeRevision=3`, '?tenantId=spoofed'])
    assert.equal((await jobDocumentsRoute(req(payload.job.id, '/history', undefined, query), gateway)).status, 400);
  for (const body of [{ ...save, userId: uid() }, { ...save, payload: { ...payload, acceptance: 'pending' } }, { ...save, expectedRevision: -1 }])
    assert.equal((await jobDocumentsRoute(req(payload.job.id, '/save', body), gateway)).status, 400);
  const count = calls.length;
  assert.equal((await jobDocumentsRoute(req(payload.job.id, '/save', { ...save, payload: { ...payload, job: { ...payload.job, id: uid() } } }), gateway)).status, 400);
  assert.equal(calls.length, count);
  assert.equal((await jobDocumentsRoute(req(payload.job.id, '/save', save), { ...gateway, loadSnapshot: async () => null })).status, 404);
  assert.equal((await jobDocumentsRoute(req(payload.job.id, '/save'), gateway)).status, 405);
  assert.equal((await jobDocumentsRoute(req(payload.job.id, '/restore', { ...command, versionId: uid() }), { ...gateway,
    restoreJobEditor: async () => { throw { status: 409, code: 'IDEMPOTENCY_BODY_MISMATCH' }; } })).status, 409);
});

test('gateway sends only authenticated RPC arguments and validates job editor responses', async () => {
  const { source, payload, row } = fixture(); const calls = [];
  const gateway = createDatabaseGateway({ SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic' },
    { user: { id: uid() }, accessToken: 'synthetic-token' }, async (url, init) => {
      const args = JSON.parse(init.body); const name = url.split('/').at(-1); calls.push({ name,args,headers:init.headers });
      return Response.json(name === 'job_editor_context' ? { job: payload.job, source: payload.source }
        : name === 'job_editor_history' ? [row] : name === 'delete_job_editor' ? { documentId: row.documentId, deleted: true } : row);
    });
  const input = { requestId: uid(), documentId: null, expectedRevision: 0, payload, userId: 'spoofed' };
  assert.deepEqual(await gateway.saveJobEditor(payload.job.id, input), row);
  assert.deepEqual(calls[0].args, { p_key: input.requestId, p_job: payload.job.id, p_document: null, p_expected_revision: 0, p_payload: payload });
  assert.equal(calls[0].headers.Authorization, 'Bearer synthetic-token');
  await gateway.jobEditorContext(payload.job.id); await gateway.loadJobEditor(payload.job.id, row.documentId, row.id);
  await gateway.jobEditorHistory(payload.job.id, row.documentId, { beforeRevision: 4 });
  await gateway.restoreJobEditor(payload.job.id, { ...input, documentId: row.documentId, versionId: row.id });
  await gateway.deleteJobEditor(payload.job.id, { ...input, documentId: row.documentId });
  assert.deepEqual(calls.map(c => c.name), ['save_job_editor','job_editor_context','load_job_editor','job_editor_history','restore_job_editor','delete_job_editor']);
  for (const run of [() => gateway.loadJobEditor(payload.job.id, row.documentId), () => gateway.jobEditorHistory(payload.job.id,row.documentId,{ beforeRevision: 0 }),
    () => gateway.saveJobEditor(payload.job.id,{ ...input,payload:{ ...payload, acceptance:'pending' } })]) assert.throws(run);
  const bad = createDatabaseGateway({ SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic' },
    { user: { id: uid() }, accessToken: 'synthetic-token' }, async () => Response.json({ ...row, payload: { ...payload, acceptance: 'pending' } }));
  await assert.rejects(bad.loadJobEditor(payload.job.id), error => error.status === 503);
});

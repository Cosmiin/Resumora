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

test('I0 integration preserves imported metadata and selected answer evidence in the job projection', async () => {
  const { readFileSync } = await import('node:fs');
  const { answerEvidenceText } = await import('../../../packages/contracts/src/intelligence/model.ts');
  const sourcePayload = JSON.parse(readFileSync(new URL('../../../packages/contracts/fixtures/job-editor-import.json', import.meta.url), 'utf8'));
  const d = decodeDraft(sourcePayload), original = structuredClone(sourcePayload);
  const f = fixture(); f.source.payload = sourcePayload;
  f.payload.selectedFacts = jobEditorFacts(d).map(row => row.ref);
  f.payload.selectedAnswerIds = ['selected-answer'];
  f.payload.wording = [{ targetId: 'imported-role', text: 'Explicitly accepted job description with reviewed controls.',
    origin: 'ai_generated', acceptance: 'accepted', valueIds: [d.roles[0].context.id], answerIds: ['selected-answer'] }];
  const projection = projectJobEditor(sourcePayload, f.payload);
  assert.equal(projection.presentation.approvedWording['imported-role'].sources.at(-1).text, answerEvidenceText(d.answers[0]));
  assert.equal(projection.presentation.approvedWording['imported-role'].sources.at(-1).text,
    'Reviewed controls\nOwned rollout\nExact free-text detail');
  for (const key of ['answers','sources','importReview','questionPlans','roleRewriteReviews']) assert.deepEqual(projection[key], d[key]);
  assert.deepEqual(projection.presentation.approvedWording['other-role'], d.presentation.approvedWording['other-role']);
  assert.equal(projection.presentation.approvedWording['other-role'].scope, 'experience');
  assert.equal(projection.presentation.templateVersionId, 'unknown-import-template');
  assert.equal(projection.roles[0].context.value, 'Maintained PLC systems');
  assert.equal(JSON.stringify(projection.presentation.approvedWording).includes('Pending Base proposal must not be applied'), false);
  assert.deepEqual(decodeDraft(encodeDraft(projection)), projection); assert.deepEqual(sourcePayload, original);

});


test('job-local summary and ordered competence selection preserve source facts and reject foreign handles', async () => {
  const { d, source, payload } = fixture();
  payload.presentation.summaryText = 'Professional summary for this vacancy';
  payload.presentation.professionalSkillIds = ['job_local_p'];
  payload.presentation.technicalSkillIds = ['job_local_t'];
  payload.localAdditions = [
    { id: 'job_local_p', targetId: 'professionalSkills', kind: 'professionalSkill', text: 'Planning', scope: 'job-only', origin: 'user_authored' },
    { id: 'job_local_t', targetId: 'technicalSkills', kind: 'technicalSkill', text: 'SQL', scope: 'job-only', origin: 'user_authored' },
  ];
  const result = projectJobEditor(source.payload, payload);
  assert.equal(result.summary.text, payload.presentation.summaryText);
  assert.deepEqual(result.professionalSkills.map(f => f.value), ['Planning']);
  assert.deepEqual(result.technicalSkills.map(f => f.value), ['SQL']);
  assert.deepEqual(decodeDraft(source.payload), d);
  payload.presentation.technicalSkillIds = ['job_local_p'];
  assert.throws(() => projectJobEditor(source.payload, payload));
  payload.presentation.technicalSkillIds = ['foreign'];
  assert.throws(() => projectJobEditor(source.payload, payload));

});


test('whole-experience scope is optional, strict, and preserved in the projected editor codec', () => {
  const { source, payload, role } = fixture();
  const original = structuredClone(source);
  for (const origin of ['user_authored', 'ai_generated']) {
    const scoped = structuredClone(payload);
    scoped.wording[0] = { ...scoped.wording[0], origin, scope: 'experience' };
    assert.equal(isJobEditorPayload(scoped), true);
    const draft = projectJobEditor(source.payload, scoped);
    assert.deepEqual(decodeDraft(encodeDraft(draft)), draft);
    assert.equal(draft.presentation.approvedWording[role.id].scope, 'experience');
    assert.equal(draft.presentation.approvedWording[role.id].origin, origin);
    assert.deepEqual(draft.roles, decodeDraft(source.payload).roles);
    for (const scope of ['paragraph', 'career', null, 1]) {
      scoped.wording[0].scope = scope;
      assert.equal(isJobEditorPayload(scoped), false);
      assert.throws(() => projectJobEditor(source.payload, scoped));
    }
  }
  assert.equal(isJobEditorPayload(payload), true);
  assert.equal(projectJobEditor(source.payload, payload).presentation.approvedWording[role.id].scope, undefined);
  assert.deepEqual(source, original);
});

test('mounted current-only route refuses historical selectors before any storage read',async()=>{const id=uid();let reads=0;const gateway={loadCurrentJobDocument:async()=>{reads++;return null;}};for(const action of ['/history','/restore'])assert.equal((await jobDocumentsRoute(req(id,action),gateway)).status,410);assert.equal((await jobDocumentsRoute(req(id,'',undefined,'?versionId='+uid()),gateway)).status,400);assert.equal(reads,0);});

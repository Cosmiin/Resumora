import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDraft, fact, newRole } from '../../../packages/contracts/src/editor/model.ts';
import { encodeDraft, decodeDraft } from '../../../packages/contracts/src/editor/transport.ts';
import { jobEditorFacts, projectJobEditor } from '../../../packages/contracts/src/jobs/documents.ts';
import { materializeJobDocument, selfContainedJobDraft } from '../../../packages/contracts/src/jobs/current-document.ts';
import { eligibleEvidence, visibleCvFields, validateTailor, validateMatch, tailorTargets, overviewFields } from '../../../packages/contracts/src/jobs/workflow.ts';
import { jobOperations } from '../src/jobs/operations.ts';
import { jobWorkflowRoute } from '../src/jobs/workflow.ts';
import { processJobWorkflow } from '../src/jobs/processor.ts';

const jobId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const snapshotId = '33333333-3333-4333-8333-333333333333';
const vacancy = () => ({ schemaVersion: 'vacancy-extraction/3', sourceLocale: 'en', overview: Object.fromEntries(overviewFields.map(k => [k, null])), requirements: [], issues: [], completeness: 'complete' });
const skill = (id, value, skillOrigin) => ({ ...fact(value), id, fieldId: `${id}_field`, ...(skillOrigin ? { skillOrigin } : {}) });
function draft() {
  const d = blankDraft(); d.language = 'en';
  d.contentLanguage = { locale: 'en', confidence: 'high', source: 'import', policyVersion: 'cv-language/1' };
  d.technicalSkills = [skill('sql', 'SQL')];
  d.professionalSkills = [skill('planning', 'Planning')];
  d.skillExclusions = ['deleted skill'];
  d.skillReserves = { technicalSkills: [skill('python', 'Python', 'self_declared'), skill('kubernetes', 'Kubernetes', 'experience')], professionalSkills: [skill('negotiation', 'Negotiation', 'self_declared')] };
  const role = newRole(); role.id = 'role'; role.context.value = 'Prepared SQL reports.'; d.roles = [role];
  return d;
}
function section(targetId, skillIds = [], evidenceIds = skillIds) {
  return { targetId, action: 'rewrite', text: '', skillIds, evidenceIds, requirementIds: [], reason: 'Select relevant saved skills', warnings: [] };
}
function proposal(d, selected = { technicalSkills: ['python', 'sql'], professionalSkills: ['negotiation'] }) {
  return { schemaVersion: 'job-tailor/1', sections: tailorTargets(d).map(targetId => selected[targetId] ? section(targetId, selected[targetId]) : { ...section(targetId), action: 'retain' }) };
}
function gateway(d, result, prior = null) {
  const writes = [], base = { id: snapshotId, revision: 1, payload: encodeDraft(d) };
  const operation = { id: operationId, kind: 'tailor', state: 'ready', languagePolicyVersion: 'cv-language/1', jobRevision: 1, snapshotId, snapshotRevision: 1, documentVersionId: prior?.id ?? null, targetDocumentVersionId: prior?.id ?? null, result };
  return { writes, base, operation, getJob: async () => ({ id: jobId, intake: { text: 'Python and negotiation' } }), getJobWorkflow: async () => ({ revision: 1, reviewed: vacancy(), operations: [operation] }), loadDraft: async () => base, loadCurrentJobDocument: async () => prior, saveCurrentJobDocument: async input => { writes.push(input); return { id: operationId, revision: (prior?.revision ?? 0) + 1 }; } };
}
function accept(g, decisions = [{ targetId: 'technicalSkills', accept: true }, { targetId: 'professionalSkills', accept: true }], prior = null) {
  return jobWorkflowRoute(new Request(`https://app.invalid/v1/jobs/${jobId}/workflow/accept`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID(), operationId, documentId: prior?.documentId ?? null, expectedRevision: prior?.revision ?? 0, decisions }) }), g);
}
function editorPayload(d) {
  return { schemaVersion: 'resumora-job-editor/1', acceptance: 'accepted', source: { snapshotId, revision: 1 }, job: { id: jobId, versionId: null, fingerprint: 'a'.repeat(64) }, selectedFacts: jobEditorFacts(d).filter(row => row.fact.status === 'user_authored').map(row => row.ref), selectedAnswerIds: [], wording: [], presentation: {}, localAdditions: [] };
}

test('reserves are owned profile evidence with origin, but never visible until explicitly selected', () => {
  const d = draft(), before = structuredClone(d), rows = eligibleEvidence(d);
  assert.deepEqual(rows.filter(e => e.key === 'skill').map(e => e.id), ['planning', 'negotiation', 'sql', 'python', 'kubernetes']);
  const python = rows.find(e => e.id === 'python');
  assert.equal(python.sourceId, d.skillReserves.technicalSkills[0].sourceId);
  assert.equal(python.targetId, 'technicalSkills'); assert.equal(python.skillOrigin, undefined); assert.equal(python.inCv, false);
  assert.equal(rows.find(e => e.id === 'sql').skillOrigin, undefined);
  assert.ok(!visibleCvFields(d).some(e => ['python', 'kubernetes', 'negotiation'].includes(e.id)));
  assert.deepEqual(d, before);
});

test('future provider selection and acceptance promote exact reserve IDs without changing Base or saved CVs', async () => {
  const d = draft(), oldSource = structuredClone(d); delete oldSource.skillReserves;
  const old = selfContainedJobDraft(oldSource);
  old.summary.text = 'Previously saved wording';
  const prior = { id: crypto.randomUUID(), documentId: crypto.randomUUID(), revision: 2, locale: 'en', payload: encodeDraft(old) };
  const before = structuredClone(d), previousPayload = structuredClone(prior.payload), calls = [];
  const result = await jobOperations(async task => {
    calls.push(task);
    if (task.attemptPhase === 'verify') return { checks: task.input.checks.map(c => ({ id: c.id, verdict: 'supported', reason: 'Existing labels only' })) };
    assert.deepEqual(task.input.skillGroups.technicalSkills.map(f => f.id), ['sql', 'python', 'kubernetes']);
    assert.deepEqual(task.input.skillGroups.professionalSkills.map(f => f.id), ['planning', 'negotiation']);
    assert.equal(task.input.currentTargets.find(t => t.id === 'technicalSkills').text, 'SQL');
    assert.match(task.system, /self_declared/);
    return proposal(d);
  }).tailor({ operationId, userId: jobId, draft: d, vacancy: vacancy(), match: { schemaVersion: 'job-evidence-match/1', components: [] } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].input.checks.find(c => c.id === 'technicalSkills').evidence.find(e => e.id === 'python').skillOrigin, undefined);
  const g = gateway(d, result, prior), response = await accept(g, undefined, prior);
  assert.equal(response.status, 200, await response.text());
  const saved = decodeDraft(g.writes[0].payload);
  assert.deepEqual(saved.technicalSkills.map(f => [f.id, f.value]), [['python', 'Python'], ['sql', 'SQL']]);
  assert.deepEqual(saved.professionalSkills.map(f => f.id), ['negotiation']);
  assert.equal(saved.technicalSkills[0].skillOrigin, undefined);
  assert.equal(saved.skillReserves, undefined); assert.equal(saved.skillReview, undefined); assert.equal(saved.skillExclusions, undefined);
  assert.equal(saved.summary.text, old.summary.text); assert.deepEqual(saved.answers, []);
  assert.deepEqual(d, before); assert.deepEqual(prior.payload, previousPayload); assert.deepEqual(decodeDraft(prior.payload), old);
});

test('workflow proposal labels resolve reserve IDs while current sections remain active only', async () => {
  const d = draft(), g = gateway(d, proposal(d));
  const response = await jobWorkflowRoute(new Request(`https://app.invalid/v1/jobs/${jobId}/workflow`), g), data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.skillLabels.python, 'Python');
  assert.equal(data.currentSections.find(s => s.id === 'technicalSkills').text, 'SQL'); assert.equal(g.writes.length, 0);
});

test('editor materialization resolves selected reserves and preserves prior active-only snapshots', () => {
  const d = draft(), source = encodeDraft(d), before = structuredClone(source), payload = editorPayload(d);
  payload.presentation.technicalSkillIds = ['python', 'sql']; payload.presentation.professionalSkillIds = ['negotiation'];
  const saved = decodeDraft(materializeJobDocument(source, payload));
  assert.deepEqual(saved.technicalSkills.map(f => f.id), ['python', 'sql']);
  assert.equal(saved.skillReserves, undefined); assert.deepEqual(source, before);
  const legacy = draft(); delete legacy.skillReserves; delete legacy.technicalSkills[0].skillOrigin;
  const oldSource = encodeDraft(legacy), oldPayload = editorPayload(legacy);
  oldPayload.presentation.technicalSkillIds = ['sql'];
  const oldSaved = materializeJobDocument(oldSource, oldPayload);
  d.technicalSkills[0].value = 'Changed in the latest profile';
  assert.equal(decodeDraft(oldSaved).technicalSkills[0].value, 'SQL');
});

test('reserve selection rejects wrong-category, foreign, unaccepted and uncited IDs before writing', async () => {
  const d = draft(); d.skillReserves.technicalSkills.push({ ...skill('pending', 'Rust'), status: 'extracted_unconfirmed' });
  for (const [skillIds, evidenceIds] of [[['negotiation'], ['negotiation']], [['foreign'], ['sql']], [['pending'], ['sql']], [['python'], ['sql']]]) {
    const bad = { schemaVersion: 'job-tailor/1', sections: [section('technicalSkills', skillIds, evidenceIds)] }, g = gateway(d, bad);
    const response = await accept(g, [{ targetId: 'technicalSkills', accept: true }]);
    assert.equal(response.status, 400, JSON.stringify({ skillIds, body: await response.text() })); assert.equal(g.writes.length, 0);
  }
});

test('future tailoring allows thirty selected skills per category and rejects thirty-one before saving', async () => {
  const d = draft(); d.skillReserves.technicalSkills = Array.from({ length: 30 }, (_, i) => skill(`reserve_${i}`, `Tool ${i}`, 'self_declared'));
  const ids = ['sql', ...d.skillReserves.technicalSkills.map(f => f.id)];
  for (const count of [20, 21]) {
    const result = { schemaVersion: 'job-tailor/1', sections: [section('technicalSkills', ids.slice(0, count))] }, g = gateway(d, result);
    const response = await accept(g, [{ targetId: 'technicalSkills', accept: true }]);
    assert.equal(response.status, count === 20 ? 200 : 400, await response.text());
    assert.equal(g.writes.length, count === 20 ? 1 : 0);
    if (g.writes.length) {
      const saved = decodeDraft(g.writes[0].payload);
      assert.equal(saved.technicalSkills.length, 20); assert.equal(saved.skillReserves, undefined);
    }
  }
});

test('self-declared skill labels cannot justify generated summary, title or role responsibilities', async () => {
  const d = draft(); d.technicalSkills[0].skillOrigin = 'self_declared';
  const evidence = eligibleEvidence(d);
  for (const targetId of ['summary', d.titles[0].fieldId, 'role']) {
    const result = { schemaVersion: 'job-tailor/1', sections: [{ ...section(targetId, [], ['sql']), text: 'Led enterprise SQL integrations.' }] };
    assert.throws(() => validateTailor(result, d, vacancy(), evidence, targetId), /INVALID_WORKFLOW_OUTPUT/);
    const g = gateway(d, result), response = await accept(g, [{ targetId, accept: true }]);
    assert.equal(response.status, 400); assert.equal(g.writes.length, 0);
  }
});

test('legacy skill labels remain selectable but bare labels cannot establish experience prose', () => {
  const d = draft(); delete d.skillReserves;
  const evidence = eligibleEvidence(d), selected = { schemaVersion: 'job-tailor/1', sections: [section('technicalSkills', ['sql'])] };
  assert.deepEqual(validateTailor(selected, d, vacancy(), evidence, 'technicalSkills'), selected);
  const fabricated = { schemaVersion: 'job-tailor/1', sections: [{ ...section('summary', [], ['sql']), text: 'Led SQL integration projects.' }] };
  assert.throws(() => validateTailor(fabricated, d, vacancy(), evidence, 'summary'), /INVALID_WORKFLOW_OUTPUT/);
});

test('matching cannot turn self-declared-only skill evidence into demonstrated experience', () => {
  const d = draft(); d.technicalSkills[0].skillOrigin = 'self_declared';
  const v = vacancy(); v.requirements = [{ id: 'r1', categories: ['responsibilities'], eligibility: false, components: [{ id: 'c1', text: 'Led SQL projects' }] }];
  const result = { schemaVersion: 'job-evidence-match/1', components: ['profile', 'cv'].map(scope => ({ requirementId: 'r1', componentId: 'c1', scope, matchClass: 'demonstrated', evidence: [{ id: 'sql', quote: 'SQL' }], reason: 'Only a saved label' })) };
  assert.throws(() => validateMatch(result, v, eligibleEvidence(d)), /INVALID_WORKFLOW_OUTPUT/);
  result.components.forEach(c => { c.matchClass = 'claimed_limited'; });
  assert.deepEqual(validateMatch(result, v, eligibleEvidence(d)), result);
});


test('background tailoring of an existing self-contained CV still receives current Base reserves', async () => {
  const d = draft(), priorSource = structuredClone(d); delete priorSource.skillReserves;
  const prior = { id: crypto.randomUUID(), documentId: crypto.randomUUID(), revision: 1, locale: 'en', payload: encodeDraft(selfContainedJobDraft(priorSource)) };
  const before = structuredClone(prior), calls = []; let settled;
  const store = { claim: async () => ({ operation: { id: operationId, kind: 'tailor', targetLocale: 'en' }, lease: operationId, jobId, userId: jobId, base: encodeDraft(d), document: prior, vacancy: vacancy(), match: { schemaVersion: 'job-evidence-match/1', components: [] }, actions: {} }), finish: async (...args) => { settled = args; } };
  await processJobWorkflow({ AI_PAID_INFERENCE: 'on' }, { store, run: async task => {
    calls.push(task);
    if (task.attemptPhase === 'verify') return { checks: task.input.checks.map(c => ({ id: c.id, verdict: 'supported', reason: 'Saved labels selected' })) };
    assert.deepEqual(task.input.skillGroups.technicalSkills.map(f => f.id), ['sql', 'python', 'kubernetes']);
    assert.equal(task.input.evidence.find(e => e.id === 'python').inCv, false);
    assert.equal(task.input.currentTargets.find(t => t.id === 'technicalSkills').text, 'SQL');
    return proposal(d);
  } });
  assert.equal(settled[2], null); assert.deepEqual(settled[1], proposal(d)); assert.equal(calls.length, 2); assert.deepEqual(prior, before);
});

test('reserve editor promotion obeys twenty-skill limit while legacy saved projections stay readable', () => {
  const d = draft(); d.skillReserves.technicalSkills = Array.from({ length: 30 }, (_, i) => skill(`reserve_${i}`, `Tool ${i}`));
  const source = encodeDraft(d), payload = editorPayload(d), ids = ['sql', ...d.skillReserves.technicalSkills.map(f => f.id)];
  payload.presentation.technicalSkillIds = ids.slice(0, 20);
  assert.equal(projectJobEditor(source, payload).technicalSkills.length, 20);
  payload.presentation.technicalSkillIds = ids;
  assert.throws(() => projectJobEditor(source, payload), /invalidJobEditor/);
  d.technicalSkills.push(...d.skillReserves.technicalSkills); delete d.skillReserves;
  const oldPayload = editorPayload(d); oldPayload.presentation.technicalSkillIds = ids;
  assert.equal(projectJobEditor(encodeDraft(d), oldPayload).technicalSkills.length, 31);
});

test('a mixed prose citation cannot launder self-declared skills into claimed responsibilities', () => {
  const d = draft(); d.technicalSkills[0].skillOrigin = 'self_declared';
  const result = { schemaVersion: 'job-tailor/1', sections: [{ ...section('summary', [], ['sql', d.roles[0].context.id]), text: 'Led enterprise SQL integrations.' }] };
  assert.throws(() => validateTailor(result, d, vacancy(), eligibleEvidence(d), 'summary'), /INVALID_WORKFLOW_OUTPUT/);
});


test('a new CV materialization excludes all unselected reserves and pending profile review state', () => {
  const d = draft(); d.skillReview = { operationId, snapshotId, revision: 1, fingerprint: 'a'.repeat(64) };
  const before = structuredClone(d), saved = selfContainedJobDraft(d);
  assert.deepEqual(saved.technicalSkills.map(f => f.id), ['sql']);
  assert.deepEqual(saved.professionalSkills.map(f => f.id), ['planning']);
  assert.equal(saved.skillReserves, undefined); assert.equal(saved.skillReview, undefined); assert.equal(saved.skillExclusions, undefined);
  assert.deepEqual(d, before);
});

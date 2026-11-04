import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDraft, newRole, fact } from '@resumora/contracts/editor/model';
import { encodeDraft, decodeDraft } from '@resumora/contracts/editor/transport';
import * as experience from '@resumora/contracts/intelligence/experience';
import { intelligenceOperations } from '../src/intelligence/operations.ts';

test('failed whole-role validation identifies the rule without logging CV or provider text', async t => {
  const { d, r } = fixture();
  const log = t.mock.method(console, 'error', () => {});
  await assert.rejects(intelligenceOperations(async c => {
    const output = { text: 'Private draft text', explanation: 'Clearer.', factIds: ['unknown-source'] };
    return c.validateOutput(output);
  }).experience(await input(d, r)), /AI_OUTPUT_INVALID/);
  assert.equal(log.mock.calls.length, 1);
  const diagnostic = JSON.parse(log.mock.calls[0].arguments[0]);
  assert.equal(diagnostic.event, 'experience_validation_failed');
  assert.equal(diagnostic.reason, 'FACT_IDS');
  assert.ok(!JSON.stringify(diagnostic).includes('Private'));
  assert.ok(!JSON.stringify(diagnostic).includes('unknown-source'));
});

function fixture() {
  const d = blankDraft(), r = newRole(); d.language = 'en';
  r.title = fact('Analyst'); r.context = fact('Prepared weekly reports for finance.');
  r.bullets = [fact('Maintained SQL queries.')]; d.roles = [r]; return { d, r };
}
async function input(d, r, intent = 'role', extra = {}) {
  return { operationId: crypto.randomUUID(), userId: crypto.randomUUID(), draft: d, targetId: r.id,
    request: { intent, fingerprint: await experience.experienceFingerprint(d, r.id), ...extra } };
}
test('whole-role generation keeps all evidence, permits intro and bullets, and does not mutate the Profile', async () => {
  const {d,r}=fixture(), before=structuredClone(d); let calls=0;
  const result=await intelligenceOperations(async c=>{
    calls++; assert.match(c.system,/whole|WHOLE/); assert.equal(c.input.facts.length,2);
    return {text:'Prepared weekly reports for finance.\n\n- Maintained SQL queries.',explanation:'Clarifies scope and contribution.',factIds:c.input.facts.map(f=>f.id)};
  }).experience(await input(d,r));
  assert.equal(result.intent,'role'); assert.equal(calls,1); assert.ok(experience.isExperienceResult(result)); assert.deepEqual(d,before);
});
test('projects and volunteering resolve while unsupported or hidden entries cannot be enriched',async()=>{
  assert.equal(typeof experience.experienceTarget,'function');
  const {d,r}=fixture();
  for(const kind of ['projects','volunteering']) {
    const e={id:`entry-${kind}`,title:fact('Community reports'),details:fact('Prepared weekly reports.'),bullets:[fact('Maintained SQL queries.')]};
    d.optionalSections.push({id:`section-${kind}`,kind,heading:fact(kind),entries:[e]});
    assert.equal(experience.experienceTarget(d,e.id).kind,kind);
    assert.match(experience.experienceText(d,e.id),/SQL/);
    assert.equal((await intelligenceOperations(async()=>({questions:[]})).experience(await input(d,e,'questions'))).intent,'questions');
  }
  d.presentation.hiddenFields=[r.bullets[0].fieldId];
  assert.ok(!experience.experienceFacts(d,r.id).some(f=>f.text.includes('SQL')));
  assert.ok(!experience.experienceText(d,r.id).includes('SQL'));
  d.presentation.hidden=['experience']; assert.equal(experience.experienceTarget(d,r.id),undefined);
});
test('whole-role context never silently drops large distinct evidence',async()=>{
  const {d,r}=fixture();r.bullets=Array.from({length:30},(_,i)=>fact(`Responsibility ${i}.`)); let calls=0;
  await assert.rejects(intelligenceOperations(async()=>{calls++;return{};}).experience(await input(d,r)),/INVALID_SCOPED_CONTEXT/);
  assert.equal(calls,0);
});
test('whole-role citations cover every supplied chunk of a long source fact',async()=>{
 const {d,r}=fixture();r.context=fact('Prepared reports. '.repeat(130));r.bullets=[];
 await assert.rejects(intelligenceOperations(async c=>({text:'Prepared reports.',explanation:'Clearer.',factIds:[c.input.facts[0].id]})).experience(await input(d,r)),/AI_OUTPUT_INVALID/);
});
test('whole-role rewrite may omit uncertain coaching replies while preserving every existing CV responsibility', async () => {
  const { d, r } = fixture();
  d.answers.push({ id: 'uncertain-answer', targetId: r.id, sourceId: 'answer-source', status: 'confirmed',
    question: 'impact', questionText: 'Who used these reports?', text: "I do not remember, perhaps someone in the company." });
  const result = await intelligenceOperations(async c => {
    const output = { text: 'Prepared weekly reports for finance.\n\n- Maintained SQL queries.', explanation: 'Clarifies the existing work.',
      factIds: c.input.facts.filter(f => !f.id.startsWith('uncertain-answer')).map(f => f.id) };
    return c.validateOutput(output);
  }).experience(await input(d, r));
  assert.equal(result.intent, 'role');
  assert.deepEqual(result.factIds, [r.context.id, r.bullets[0].id]);
  assert.equal(d.answers[0].text, "I do not remember, perhaps someone in the company.");
});
test('contextual answer hints survive generation and saved sessions, while older questions remain valid', async () => {
  const { d, r } = fixture();
  const hint = 'Name the team receiving the reports and the decision they helped make. Only include what you remember.';
  const result = await intelligenceOperations(async () => ({ questions: [{ dimension: 'impact', text: 'Who used the reports?', hint }] })).experience(await input(d, r, 'questions'));
  assert.equal(result.questions[0].hint, hint);
  d.experienceEnrichment = { [r.id]: { version: 1, guided: true, round: { id: 'round', fingerprint: result.fingerprint, questions: result.questions, answerIds: ['answer'] } } };
  assert.deepEqual(decodeDraft(encodeDraft(d)), d);
  const legacy = { ...result, questions: [{ id: 'q', dimension: 'impact', text: 'Who used the reports?' }] };
  assert.ok(experience.isExperienceResult(legacy));
  assert.ok(!experience.isExperienceResult({ ...result, questions: [{ ...result.questions[0], hint: 'x'.repeat(501) }] }));
});
test('optional answers do not permit dropping an existing CV responsibility or inventing a metric', async () => {
  const { d, r } = fixture();
  d.answers.push({ id: 'answer', targetId: r.id, sourceId: 'answer-source', status: 'confirmed', question: 'tools', questionText: 'Which tools?', text: 'SQL.' });
  for (const incomplete of [true, false]) {
    await assert.rejects(intelligenceOperations(async c => c.validateOutput({
      text: incomplete ? 'Prepared weekly reports for finance.' : 'Prepared 99 reports for finance. Maintained SQL queries.',
      explanation: 'Clearer.', factIds: incomplete ? [c.input.facts[0].id] : c.input.facts.map(f => f.id),
    })).experience(await input(d, r)), /AI_OUTPUT_INVALID/);
  }
});
test('candidate preview is bound to staged exact text and additive session metadata roundtrips',async()=>{
  const {d,r}=fixture(), fingerprint=await experience.experienceFingerprint(d,r.id);
  const proposal={schemaVersion:'experience-assistant/1',targetId:r.id,fingerprint,intent:'role',text:'Prepared weekly reports for finance.\n\n- Maintained SQL queries.',explanation:'Clearer scope.',factIds:[r.context.id,r.bullets[0].id]};
  d.experienceEnrichment={[r.id]:{version:1,roleProposal:proposal,candidate:proposal.text}};
  assert.ok(experience.isExperienceResult(proposal));assert.deepEqual(decodeDraft(encodeDraft(d)),d);
  assert.ok(experience.isExperienceRequest({intent:'preview',fingerprint,candidate:proposal.text}));
  assert.ok(!experience.isExperienceRequest({intent:'role',fingerprint,candidate:proposal.text}));
  let calls=0;
  await assert.rejects(intelligenceOperations(async()=>{calls++;return{};}).experience(await input(d,r,'preview',{candidate:'Changed text'})),/STALE_INPUT/);
  assert.equal(calls,0);
});
test('preview assesses exact staged wording without applying it to the Profile',async()=>{
 const {d,r}=fixture(),fingerprint=await experience.experienceFingerprint(d,r.id),candidate='Prepared weekly finance reports.\n\n- Maintained SQL reporting queries.';
 d.experienceEnrichment={[r.id]:{version:1,candidate,roleProposal:{schemaVersion:'experience-assistant/1',targetId:r.id,fingerprint,intent:'role',text:candidate,explanation:'Clearer.',factIds:[r.context.id,r.bullets[0].id]}}};
 const before=structuredClone(d);let calls=0;
 const result=await intelligenceOperations(async c=>{calls++;assert.ok(c.input.points.every(p=>candidate.includes(p.text)));assert.equal(c.input.facts,undefined);return{points:c.input.points.map(p=>({id:p.id,meaningful:true,contribution:'specific',clarity:'specific',specificity:'specific',issue:'none',duplicateOf:null,strength:null,improvement:null,suggestedQuestion:null})),dimensions:['contribution','methods','scope','outcome'].map(dimension=>({dimension,grade:'missing',evidencePointIds:[]})),experience:null};}).experience(await input(d,r,'preview',{candidate}));
 assert.equal(result.intent,'preview');assert.equal(result.assessment.score,100);assert.equal(calls,1);assert.deepEqual(d,before);assert.ok(experience.isExperienceResult(result));
});

 test('whole-role questions with existing answers and no round do not crash before provider dispatch', async () => {
  const { d, r } = fixture();
  d.answers.push({ id: 'old-answer', targetId: r.id, status: 'confirmed', sourceId: 'source', question: 'impact', questionText: 'Who used it?', text: 'The finance team.' });
  let calls = 0;
  const result = await intelligenceOperations(async () => {
    calls++;
    return { questions: [{ dimension: 'tools', text: 'Which tools did you use?', hint: 'Name only tools you remember using.' }] };
  }).experience(await input(d, r, 'questions'));
  assert.equal(calls, 1);
  assert.equal(result.intent, 'questions');
 });

test('questions about another point are not suppressed by an unfinished answer to the same wording', async () => {
  const { d, r } = fixture(), points = experience.experiencePoints(experience.experienceText(d, r.id));
  const question = { id: 'q-old', dimension: 'impact', text: 'Who used this work?' };
  d.answers.push({ id: 'a-old', targetId: r.id, status: 'draft', question: 'impact', questionText: question.text, text: 'Still recalling' });
  d.experienceEnrichment = { [r.id]: { version: 1, guided: true, round: { id: 'round-old', fingerprint: 'a'.repeat(64), point: points[0], questions: [question], answerIds: ['a-old'] } } };
  const result = await intelligenceOperations(async c => {
    assert.deepEqual(c.input.previous, []);
    return { questions: [{ dimension: question.dimension, text: question.text, hint: 'Name the team who used this specific work.' }] };
  }).experience(await input(d, r, 'questions', { point: points[1] }));
  assert.equal(result.questions.length, 1);
  assert.deepEqual(result.point, points[1]);
  d.experienceEnrichment[r.id].rounds = [d.experienceEnrichment[r.id].round];
  assert.deepEqual(decodeDraft(encodeDraft(d)), d);
});

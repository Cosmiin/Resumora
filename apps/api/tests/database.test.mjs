import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabaseGateway, DatabaseError } from '../src/db/supabase.ts';

const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic' };
const identity = { user: { id }, accessToken: 'original-user-access-token' };
const payload = { schemaVersion: 'resumora-editor-draft/1', content: { pending: true }, answers: [{ question: 'Q?', answer: 'A' }] };
const rejected = (status, code) => error => error instanceof DatabaseError && error.status === status && error.code === code;

test('database gateway fails closed on missing identity/config and privileged keys', () => {
  for (const config of [{}, { ...env, SUPABASE_URL: 'http://synthetic.supabase.co' },
    { ...env, SUPABASE_URL: 'https://synthetic.supabase.co/redirect' },
    { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' },
    { ...env, SUPABASE_PUBLISHABLE_KEY: `x.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.x` },
    { ...env, SUPABASE_PUBLISHABLE_KEY: `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x` }]) {
    assert.throws(() => createDatabaseGateway(config, identity), rejected(503, 'DATABASE_UNAVAILABLE'));
  }
  assert.throws(() => createDatabaseGateway(env, null), rejected(401, 'UNAUTHORIZED'));
  assert.throws(() => createDatabaseGateway(env, { ...identity, accessToken: 'bad\r\ntoken' }), rejected(401, 'UNAUTHORIZED'));
});

test('draft mapping preserves original token, exact payload and revision without caller actor fields', async () => {
  const calls = [];
  const snapshot = { id, revision: 1, parentId: null, payload, reason: 'save', createdAt: '2026-10-27T00:00:00Z' };
  const gateway = createDatabaseGateway(env, identity, async (url, init) => {
    calls.push({ url, init });
    return Response.json(snapshot);
  });
  assert.deepEqual(await gateway.saveDraft({ requestId, expectedRevision: 0, mode: 'checkpoint', payload, userId: 'spoofed' }), snapshot);
  assert.equal(calls.length, 1); // Auth owns verification; no second Auth call.
  const { url, init } = calls[0];
  assert.equal(url, `${env.SUPABASE_URL}/rest/v1/rpc/save_base_draft`);
  assert.equal(init.headers.Authorization, `Bearer ${identity.accessToken}`);
  assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(init.headers['Content-Profile'], 'app');
  assert.equal(init.headers['Accept-Profile'], 'app');
  assert.equal(init.redirect, 'manual');
  assert.deepEqual(JSON.parse(init.body), { p_key: requestId, p_expected_revision: 0, p_payload: payload, p_mode: 'checkpoint' });
});

test('workspace provisioning maps the request key to the existing SQL command', async () => {
  const calls = [];
  const gateway = createDatabaseGateway(env, identity, async (url, init) => { calls.push([url.split('/').at(-1), JSON.parse(init.body)]); return Response.json({}); });
  await gateway.provisionWorkspace(requestId);
  assert.deepEqual(calls, [
    ['provision_workspace', { request_key: requestId }],
  ]);
});

test('job metadata list stays bounded and opening a job preserves full capture and requirements', async () => {
  const detail = { id, state: 'draft', versionId: null, createdAt: '2026-10-28T00:00:00Z',
    snapshotId: requestId, snapshotRevision: 1,
    intake: { text: 'a'.repeat(200000), title: '😀'.repeat(20000), company: 'b'.repeat(20000), sourceUrl: 'https://example.invalid/job' },
    requirements: Array.from({length:100}, () => ({ text:'a'.repeat(1000), priority:'required' })) };
  const summaries = Array.from({length:50}, (_,i) => ({ id: `11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,
    state:'draft', createdAt:detail.createdAt, title:'😀'.repeat(200) }));
  const calls = [];
  const gateway = createDatabaseGateway(env, identity, async (url, init) => {
    const name = url.split('/').at(-1);
    calls.push([name, JSON.parse(init.body)]);
    assert.equal(init.headers.Authorization, `Bearer ${identity.accessToken}`);
    return Response.json(name === 'list_target_jobs' ? summaries : JSON.parse(init.body).p_job === id ? detail : null);
  });
  assert.deepEqual(await gateway.listJobs(), summaries);
  assert.deepEqual(await gateway.getJob(id), detail);
  assert.equal(await gateway.getJob(requestId), null);
  assert.deepEqual(calls, [['list_target_jobs', {}], ['get_target_job', { p_job: id }], ['get_target_job', { p_job: requestId }]]);
});

test('load/history/restore map cursors and snapshot identity; invalid inputs never reach transport', async () => {
  const calls = [];
  const gateway = createDatabaseGateway(env, identity, async (url, init) => {
    const name = url.split('/').at(-1);
    calls.push([name, JSON.parse(init.body)]);
    return Response.json(name === 'base_draft_history' ? [] : name === 'load_base_draft' ? null
      : { id, revision: 9, parentId: requestId, restoredFrom: id, reason: 'restore', createdAt: '2026-10-27T00:00:00Z', payload });
  });
  assert.equal(await gateway.loadDraft(), null);
  await gateway.draftHistory({ beforeRevision: 8, limit: 5 });
  await gateway.restoreDraft({ requestId, expectedRevision: 8, snapshotId: id });
  assert.deepEqual(calls, [['load_base_draft', {}], ['base_draft_history', { p_before_revision: 8, p_limit: 5 }],
    ['restore_base_draft', { p_key: requestId, p_expected_revision: 8, p_snapshot: id }]]);
  assert.throws(() => gateway.saveDraft({ requestId: 'bad', expectedRevision: 0, mode: 'checkpoint', payload }), rejected(400, 'INVALID_REQUEST'));
  assert.throws(() => gateway.restoreDraft({ requestId, expectedRevision: -1, snapshotId: id }), rejected(400, 'INVALID_REQUEST'));
  assert.throws(() => gateway.draftHistory({ limit: 21 }), rejected(400, 'INVALID_REQUEST'));
  assert.equal(calls.length, 3);
});

test('SQL authorization, conflict and replay errors preserve status and safe machine code', async () => {
  for (const [status, code] of [[401, 'AUTHENTICATION_REQUIRED'], [403, 'RESOURCE_FORBIDDEN'], [404, 'SNAPSHOT_NOT_FOUND'],
    [409, 'VERSION_CONFLICT'], [409, 'IDEMPOTENCY_BODY_MISMATCH'], [410, 'REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE']]) {
    const gateway = createDatabaseGateway(env, identity, async () => Response.json({ code: `PT${status}`, message: code, details: 'private' }, { status }));
    await assert.rejects(gateway.loadDraft(), rejected(status, code));
  }
});

test('network/schema/redirect/malformed upstream failures are sanitized and never retried', async () => {
  for (const transport of [async () => { throw new Error('private-connection-detail'); },
    async () => Response.json({ code: 'PGRST106', message: 'private-schema-detail' }, { status: 406 }),
    async () => new Response('', { status: 302, headers: { Location: 'https://untrusted.invalid' } }),
    async () => new Response('private-not-json'), async () => Response.json({ id: 'invalid-success' })]) {
    let calls = 0;
    const gateway = createDatabaseGateway(env, identity, (...args) => { calls++; return transport(...args); });
    await assert.rejects(gateway.loadDraft(), rejected(503, 'DATABASE_UNAVAILABLE'));
    assert.equal(calls, 1);
  }
  const gateway = createDatabaseGateway(env, identity, async () => Response.json({ code: 'PT422', message: 'private user data' }, { status: 422 }));
  await assert.rejects(gateway.loadDraft(), rejected(422, 'DATABASE_REQUEST_REJECTED'));
});


test('workspace draft lists accept typed arrays and missing owned resources remain null', async () => {
 const row={id,kind:'intake',revision:1,value:{text:'Unfinished QA vacancy',sourceUrl:''},updatedAt:'2026-10-31T00:00:00Z',submittedJobId:null};
 for(const value of [[],[row]]) {
  const gateway=createDatabaseGateway(env,identity,async()=>Response.json(value));
  assert.deepEqual(await gateway.listWorkspaceDrafts(),value);
 }
 for(const value of [{},Array(101).fill(row),[{...row,kind:'unrestricted'}],[{...row,value:{secret:'unsupported'}}],[{...row,revision:0}]]) {
  const gateway=createDatabaseGateway(env,identity,async()=>Response.json(value));
  await assert.rejects(gateway.listWorkspaceDrafts(),rejected(503,'DATABASE_UNAVAILABLE'));
 }
 const gateway=createDatabaseGateway(env,identity,async()=>Response.json(null));
 assert.equal(await gateway.getWorkspaceDraft('intake',id),null);
 assert.equal(await gateway.getWorkspaceOperation(id),null);
});
test('job intake transports retain explicit interface fallback at their authenticated RPC boundary',async()=>{
 const calls=[],gateway=createDatabaseGateway(env,identity,async(url,init)=>{calls.push({name:url.split('/').at(-1),body:JSON.parse(init.body)});return Response.json({});});
 await gateway.saveJob({requestId,intake:{text:'Synthetic employer description'},snapshotId:null,snapshotRevision:null,requirements:[],interfaceLocale:'en'});
 await gateway.saveJobUrl(requestId,'https://jobs.ashbyhq.com/example/job','en');
 await gateway.submitWorkspaceIntake({requestId,id,expectedRevision:1,interfaceLocale:'en'});
 await gateway.requestJobWorkflow({requestId,jobId:id,kind:'extract',revision:1,interfaceLocale:'en'});
 assert.deepEqual(calls.map(c=>c.name),['save_target_job_with_locale','save_target_url_with_locale','submit_workspace_intake_with_locale','request_job_workflow_with_locale']);
 assert.ok(calls.every(c=>c.body.p_interface_locale==='en'));
});

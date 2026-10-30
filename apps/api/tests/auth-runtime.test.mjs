import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bundleWorker as build } from './bundle-worker.mjs';
import { encodeDraft } from '@resumora/contracts/editor/transport';
import { selfContainedJobDraft } from '@resumora/contracts/jobs/current-document';
import { blankDraft } from '@resumora/contracts/editor/model';
import { saveSession, authHeaders } from '../src/auth/session.ts';
import { readCookie, writeCookie } from '../src/auth/cookies.ts';
import { Miniflare, Response as RuntimeResponse, convertV4MiniflareOptions } from 'miniflare';

test('native composed Worker enforces identity/CSRF/recovery and confines cookie refresh to session checks', async () => {
  const env = { APP_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:5173', API_ORIGIN: 'http://127.0.0.1:5173', SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', AUTH_COOKIE_KEY: Buffer.alloc(32, 9).toString('base64') };
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'runtime@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' };
  const token = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.synthetic';
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser' });
  const jobId = '22222222-2222-4222-8222-222222222222';
  const sourceId = crypto.randomUUID();
  const jobPin = { id: jobId, versionId: null, fingerprint: 'a'.repeat(64) };
  const sourcePayload = encodeDraft(blankDraft());
  const calls = [];
  let databaseFailure = false, authFailure = false;
  let runtimeUser=user,runtimeToken=token,storageFailure=true,storageMissing=false;
  const importKey=`${user.id}/${sourceId}/original.pdf`,photoKey=`${user.id}/${sourceId}.jpg`;
  let cleanupRows=[{bucket:'cv-imports',objectKey:importKey},{bucket:'cv-photos',objectKey:photoKey}];
  const storageCalls=[];let removeCalls=0;
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{type:'ESModule',path:'entry.mjs',contents:bundle.outputFiles[0].text},...bundle.wasm], compatibilityDate: '2026-10-25', compatibilityFlags:['nodejs_compat'], host: '127.0.0.1', port: 0, unsafeRegisterWorker: false, bindings: env,
    outboundService: async request => {
      const url = new URL(request.url); assert.equal(url.origin, env.SUPABASE_URL); calls.push(url.pathname);
      if (url.pathname === '/auth/v1/token') return RuntimeResponse.json({ access_token: token, refresh_token: 'runtime-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user });
      if (url.pathname === '/auth/v1/user' && authFailure) return RuntimeResponse.json({ message: 'synthetic auth failure' }, { status: 429 });
      if (url.pathname === '/auth/v1/user') { assert.equal(request.headers.get('authorization'), 'Bearer ' + runtimeToken); return RuntimeResponse.json(runtimeUser); }
      if (url.pathname === '/auth/v1/logout') return RuntimeResponse.json({});
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        assert.equal(request.headers.get('authorization'), 'Bearer ' + runtimeToken);
        assert.equal(request.headers.get('content-profile'), 'app');
        assert.equal(request.headers.get('accept-profile'), 'app');
        assert.equal(request.method, 'POST');
        if (databaseFailure) return RuntimeResponse.json({ message: 'private synthetic diagnostic' }, { status: 500 });
        if(url.pathname.endsWith('/remove_base_cv')) {removeCalls++;return RuntimeResponse.json({removed:true,generation:1,revision:2,cleanupPending:true});}
        if(url.pathname.endsWith('/base_removal_objects')) return RuntimeResponse.json(cleanupRows);
        if(url.pathname.endsWith('/ack_base_removal_object')) {const i=await request.json();cleanupRows=cleanupRows.filter(r=>r.bucket!==i.p_bucket||r.objectKey!==i.p_object_key);return RuntimeResponse.json(null);}
        if(url.pathname.endsWith('/load_base_state')) return RuntimeResponse.json({snapshot:null,generation:1,revision:2,cleanupPending:cleanupRows.length>0});
        if (url.pathname.endsWith('/load_base_draft')) return RuntimeResponse.json(null);
        if (url.pathname.endsWith('/save_base_draft')) {
          const input = await request.json();
          return RuntimeResponse.json({ id: crypto.randomUUID(), parentId: null, revision: 1, createdAt: new Date().toISOString(), reason: 'autosave', payload: input.p_payload });
        }
        if (url.pathname.endsWith('/job_editor_context')) return RuntimeResponse.json({ job: jobPin, source: { snapshotId: sourceId, revision: 1 } });
        if (url.pathname.endsWith('/load_editor_snapshot')) return RuntimeResponse.json({ id: sourceId, parentId: null, revision: 1, createdAt: new Date().toISOString(), reason: 'save', payload: sourcePayload });
        if (url.pathname.endsWith('/save_current_job_document')) {
          const input = await request.json();
          assert.equal(input.p_job, jobId);assert.equal(input.p_base_snapshot,sourceId);
          assert.equal('userId' in input, false);
          return RuntimeResponse.json({ id: crypto.randomUUID(), documentId: crypto.randomUUID(),
            revision: 1, createdAt: new Date().toISOString(),locale:input.p_locale,fingerprint:'b'.repeat(64),provenance:{},payload:input.p_payload });
        }
        assert.fail('Unexpected RPC');
      }
      if(url.pathname.startsWith('/storage/v1/object/')) {
        assert.equal(request.method,'DELETE');assert.equal(request.headers.get('authorization'),'Bearer '+runtimeToken);
        const body=await request.json();assert.equal(body.prefixes.length,1);assert.ok([importKey,photoKey].includes(body.prefixes[0]));storageCalls.push({path:url.pathname,key:body.prefixes[0]});
        return RuntimeResponse.json(storageFailure?{message:'private storage diagnostic'}:{}, {status:storageFailure?503:storageMissing?404:200});
      }
      assert.fail('Unexpected outbound request');
    },
  }));
  const jar = new Map();
  function accept(response) { for (const cookie of response.headers.getSetCookie()) { const [pair] = cookie.split(';'); const at = pair.indexOf('='); if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1)); else jar.delete(pair.slice(0, at)); } }
  try {
    const origin = (await runtime.ready).origin;
    const call = async (path, body, headers = {}) => {
      const response = await fetch(origin + '/v1/auth' + path, { method: body ? 'POST' : 'GET', headers: { Cookie: [...jar].map(([k,v]) => k + '=' + v).join('; '), ...(body ? { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }); accept(response); return response;
    };
    const resource = async (base, path = '', body, headers = {}) => {
      const cookie = [...jar].map(([k,v]) => k + '=' + v).join('; ');
      const session = await readCookie(new Request(env.APP_ORIGIN, { headers: { Cookie: cookie } }), env, 'session');
      const response = await fetch(origin + base + path, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'X-Resumora-Account': user.id, ...(!body ? { 'X-CSRF-Token': session?.csrf ?? '' } : {}), ...(body ? { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }); accept(response); return response;
    };
    const cv = (...args) => resource('/v1/base-cv', ...args);
    const jobCv = (...args) => resource('/v1/jobs/22222222-2222-4222-8222-222222222222/cv', ...args);
    for (const path of ['', '/context', '/history', '/save', '/restore', '/delete']) assert.equal((await jobCv(path)).status, 401);
    assert.equal((await cv()).status, 401);
    for(const path of ['/remove','/removal-cleanup'])assert.equal((await cv(path,{})).status,401);
    assert.equal(calls.length, 0);
    const initial = await (await call('/session')).json(); assert.equal(initial.user, null);
    const credentials = { email: user.email, password: 'synthetic-password' };
    assert.equal((await call('/login', credentials)).status, 403); assert.equal(calls.length, 0);
    const login = await call('/login', credentials, { 'X-CSRF-Token': initial.csrfToken }); assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/); assert.equal(login.headers.get('set-cookie').includes(token), false);
    const signed = await (await call('/session')).json(); assert.equal(signed.user.id, user.id); assert.equal(signed.recovery, false);
    const photoWrite = headers => fetch(origin + '/v1/photos', {method:'POST',body:new Uint8Array([1]),headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),Origin:env.APP_ORIGIN,'Content-Type':'image/jpeg','X-Resumora-Account':user.id,...headers}});
    assert.equal((await photoWrite({})).status,403);
    assert.equal((await photoWrite({'X-CSRF-Token':signed.csrfToken,Origin:'https://evil.invalid'})).status,403);
    const enabledGate=await photoWrite({'X-CSRF-Token':signed.csrfToken});
    assert.equal(enabledGate.status,503);assert.equal((await enabledGate.json()).error.code,'photoUnavailable');
    const before = calls.length;
    assert.equal(await (await cv()).json(), null);
    assert.deepEqual(calls.slice(before), ['/auth/v1/user', '/rest/v1/rpc/load_base_state']);
    const save = { requestId: crypto.randomUUID(), expectedRevision: 0, mode: 'autosave', draft: blankDraft() };
    const rpcCount = () => calls.filter(path => path.startsWith('/rest/')).length;
    const priorRpcs = rpcCount();
    for(const path of ['/remove','/removal-cleanup'])for(const headers of [{},{'X-CSRF-Token':signed.csrfToken,Origin:'https://evil.invalid'},{'X-CSRF-Token':signed.csrfToken,'X-Resumora-Account':jobId}])
      assert.equal((await cv(path,{requestId:crypto.randomUUID(),expectedRevision:1,expectedGeneration:0},headers)).status,headers['X-Resumora-Account']?401:403);
    for (const headers of [{}, { 'X-CSRF-Token': signed.csrfToken, Origin: 'https://evil.invalid' }]) assert.equal((await cv('/save', save, headers)).status, 403);
    for (const path of ['/save','/restore','/delete']) {
      for (const headers of [{}, { 'X-CSRF-Token': signed.csrfToken, Origin: 'https://evil.invalid' }])
        assert.equal((await jobCv(path, { requestId: crypto.randomUUID() }, headers)).status, 403);
    }
    assert.equal(rpcCount(), priorRpcs);
    assert.equal((await jobCv('/save', { requestId: crypto.randomUUID() }, { 'X-CSRF-Token': signed.csrfToken })).status, 400);
    assert.equal(rpcCount(), priorRpcs);
    authFailure = true;
    const pausedJar = [...jar];
    assert.equal((await call('/session')).status, 503);
    for (const path of ['', '/history', '/save', '/restore']) {
      const response = await cv(path, path === '/save' || path === '/restore' ? save : undefined, { 'X-CSRF-Token': signed.csrfToken });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'AUTH_UNAVAILABLE');
      assert.equal(response.headers.getSetCookie().length, 0);
    }
    for (const path of ['', '/context', '/history', '/save', '/restore', '/delete']) {
      assert.equal((await jobCv(path, path === '/save' || path === '/restore' || path === '/delete' ? save : undefined, { 'X-CSRF-Token': signed.csrfToken })).status, 503);
    }
    assert.deepEqual([...jar], pausedJar);
    assert.equal(rpcCount(), priorRpcs);
    authFailure = false;
    assert.equal((await (await call('/session')).json()).user.id, user.id);
    const method = await cv('/save'); assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'POST');
    const originalJar = new Map(jar);
    const cookieRequest = () => new Request(env.APP_ORIGIN, { headers: { Cookie: [...jar].map(([k,v]) => k + '=' + v).join('; ') } });
    const sessionCookie = await readCookie(cookieRequest(), env, 'session');
    let headers = authHeaders(); await writeCookie(headers, env, 'session', { ...sessionCookie, recovery: true }, 600); accept(new Response(null, { headers }));
    for (const path of ['', '/history', '/save', '/restore']) assert.equal((await cv(path)).status, 401);
    assert.equal(rpcCount(), priorRpcs);
    for (const path of ['', '/context', '/history', '/save', '/restore', '/delete']) assert.equal((await jobCv(path)).status, 401);
    jar.clear(); for (const [k,v] of originalJar) jar.set(k,v);
    for (const result of ['success', 'validation', 'database']) {
      headers = authHeaders();
      await saveSession(headers, env, { access_token: token, refresh_token: 'expired-runtime-' + result, expires_at: 1, user }, false, signed.csrfToken);
      accept(new Response(null, { headers }));
      const expired = await cv(); assert.equal(expired.status, 409); assert.equal((await expired.json()).error.code, "SESSION_REFRESH_REQUIRED"); assert.equal(expired.headers.getSetCookie().length, 0);
      const refreshed = await call('/session'); assert.equal(refreshed.status, 200); assert.match(refreshed.headers.get('set-cookie'), /resumora-local-session/);
      databaseFailure = result === 'database';
      const response = await cv('/save', { ...save, mode: result === 'validation' ? 'checkpoint' : 'autosave' }, { 'X-CSRF-Token': signed.csrfToken });
      assert.equal(response.status, result === 'success' ? 200 : result === 'validation' ? 422 : 503);
      assert.equal(response.headers.getSetCookie().length, 0);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const body = await response.json(); assert.equal(JSON.stringify(body).includes('runtime-refresh'), false); assert.equal(JSON.stringify(body).includes('private synthetic diagnostic'), false);
    }
    databaseFailure = false;
    const context = await jobCv('/context'); assert.equal(context.status, 200);
    assert.deepEqual((await context.json()).job, jobPin);
    const beforeJobSave = calls.length;
    const document=selfContainedJobDraft({...sourcePayload.content,answers:sourcePayload.answers});
    const jobSaved = await jobCv('/save', {requestId:crypto.randomUUID(),documentId:null,expectedRevision:0,
      locale:document.language,baseSnapshotId:sourceId,draft:document},{'X-CSRF-Token':signed.csrfToken});
    assert.equal(jobSaved.status,200);
    assert.deepEqual((await jobSaved.json()).draft,document);
    assert.deepEqual(calls.slice(beforeJobSave),['/auth/v1/user','/rest/v1/rpc/save_current_job_document']);
    const exportBody={kind:'base',versionId:sourceId,revision:1};
    for(const headers of [{},{'X-CSRF-Token':signed.csrfToken,Origin:'https://evil.invalid'},{'X-CSRF-Token':signed.csrfToken,'X-Resumora-Account':jobId}])
      assert.equal((await resource('/v1/exports/pdf','',exportBody,headers)).status,headers['X-Resumora-Account']?401:403);
    const removalBody={requestId:crypto.randomUUID(),expectedRevision:1,expectedGeneration:0};
    const removed=await cv('/remove',removalBody,{'X-CSRF-Token':signed.csrfToken});assert.equal(removed.status,200);
    assert.equal((await removed.json()).cleanupPending,true);assert.equal(removeCalls,1);assert.equal(storageCalls.length,2);
    assert.equal(cleanupRows.length,2);assert.match(removed.headers.get('cache-control'),/no-store/);
    const pending=await cv('/removal-cleanup',{}, {'X-CSRF-Token':signed.csrfToken});assert.equal(pending.status,200);assert.equal((await pending.json()).cleanupPending,true);
    storageFailure=false;storageMissing=true;
    const cleaned=await cv('/removal-cleanup',{}, {'X-CSRF-Token':signed.csrfToken});assert.equal(cleaned.status,200);assert.equal((await cleaned.json()).cleanupPending,false);
    assert.equal(cleanupRows.length,0);assert.equal(removeCalls,1);
    const beforeSwitch=rpcCount(),switchJar=new Map(jar);
    runtimeUser={...user,id:jobId};runtimeToken='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:jobId,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
    headers=authHeaders();await saveSession(headers,env,{access_token:runtimeToken,refresh_token:'synthetic-switch',expires_at:Math.floor(Date.now()/1000)+3600,user:runtimeUser},false,signed.csrfToken);accept(new Response(null,{headers}));
    for(const path of ['/remove','/removal-cleanup'])assert.equal((await cv(path,path==='/remove'?removalBody:{},{'X-CSRF-Token':signed.csrfToken})).status,401);
    assert.equal(rpcCount(),beforeSwitch);
    runtimeUser=user;runtimeToken=token;jar.clear();for(const [k,v] of switchJar)jar.set(k,v);
    jar.set('resumora-local-session.0', 'tampered');
    const rejected = await cv(); assert.equal(rejected.status, 401); assert.equal(rejected.headers.getSetCookie().length, 0);
    jar.clear(); for (const [k,v] of originalJar) jar.set(k,v);
    assert.equal((await call('/logout', {}, { 'X-CSRF-Token': signed.csrfToken })).status, 200); assert.equal(jar.size, 0);
    assert.equal((await (await call('/session')).json()).user, null);
  } finally { await runtime.dispose(); }
});

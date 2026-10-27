import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { blankDraft } from '@resumora/contracts/editor/model';
import { saveSession, authHeaders } from '../src/auth/session.ts';
import { readCookie, writeCookie } from '../src/auth/cookies.ts';
import { Miniflare, Response as RuntimeResponse, convertV4MiniflareOptions } from 'miniflare';

test('native composed Worker enforces identity/CSRF/recovery and forwards refreshed cookies across CV success and failures', async () => {
  const env = { APP_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:5173', API_ORIGIN: 'http://127.0.0.1:5173', SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', AUTH_COOKIE_KEY: Buffer.alloc(32, 9).toString('base64') };
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'runtime@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' };
  const token = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.synthetic';
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser' });
  const calls = [];
  let databaseFailure = false;
  const runtime = new Miniflare(convertV4MiniflareOptions({
    script: bundle.outputFiles[0].text, modules: true, compatibilityDate: '2026-10-25', host: '127.0.0.1', port: 0, unsafeRegisterWorker: false, bindings: env,
    outboundService: async request => {
      const url = new URL(request.url); assert.equal(url.origin, env.SUPABASE_URL); calls.push(url.pathname);
      if (url.pathname === '/auth/v1/token') return RuntimeResponse.json({ access_token: token, refresh_token: 'runtime-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user });
      if (url.pathname === '/auth/v1/user') { assert.equal(request.headers.get('authorization'), 'Bearer ' + token); return RuntimeResponse.json(user); }
      if (url.pathname === '/auth/v1/logout') return RuntimeResponse.json({});
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        assert.equal(request.headers.get('authorization'), 'Bearer ' + token);
        assert.equal(request.headers.get('content-profile'), 'app');
        assert.equal(request.headers.get('accept-profile'), 'app');
        assert.equal(request.method, 'POST');
        if (databaseFailure) return RuntimeResponse.json({ message: 'private synthetic diagnostic' }, { status: 500 });
        if (url.pathname.endsWith('/load_base_draft')) return RuntimeResponse.json(null);
        if (url.pathname.endsWith('/save_base_draft')) {
          const input = await request.json();
          return RuntimeResponse.json({ id: crypto.randomUUID(), parentId: null, revision: 1, createdAt: new Date().toISOString(), reason: 'autosave', payload: input.p_payload });
        }
        assert.fail('Unexpected RPC');
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
    const cv = async (path = '', body, headers = {}) => {
      const response = await fetch(origin + '/v1/base-cv' + path, { method: body ? 'POST' : 'GET', headers: { Cookie: [...jar].map(([k,v]) => k + '=' + v).join('; '), ...(body ? { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }); accept(response); return response;
    };
    assert.equal((await cv()).status, 401); assert.equal(calls.length, 0);
    const initial = await (await call('/session')).json(); assert.equal(initial.user, null);
    const credentials = { email: user.email, password: 'synthetic-password' };
    assert.equal((await call('/login', credentials)).status, 403); assert.equal(calls.length, 0);
    const login = await call('/login', credentials, { 'X-CSRF-Token': initial.csrfToken }); assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/); assert.equal(login.headers.get('set-cookie').includes(token), false);
    const signed = await (await call('/session')).json(); assert.equal(signed.user.id, user.id); assert.equal(signed.recovery, false);
    const before = calls.length;
    assert.equal(await (await cv()).json(), null);
    assert.deepEqual(calls.slice(before), ['/auth/v1/user', '/rest/v1/rpc/load_base_draft']);
    const save = { requestId: crypto.randomUUID(), expectedRevision: 0, mode: 'autosave', draft: blankDraft() };
    const rpcCount = () => calls.filter(path => path.startsWith('/rest/')).length;
    const priorRpcs = rpcCount();
    for (const headers of [{}, { 'X-CSRF-Token': signed.csrfToken, Origin: 'https://evil.invalid' }]) assert.equal((await cv('/save', save, headers)).status, 403);
    assert.equal(rpcCount(), priorRpcs);
    const method = await cv('/save'); assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'POST');
    const originalJar = new Map(jar);
    const cookieRequest = () => new Request(env.APP_ORIGIN, { headers: { Cookie: [...jar].map(([k,v]) => k + '=' + v).join('; ') } });
    const sessionCookie = await readCookie(cookieRequest(), env, 'session');
    let headers = authHeaders(); await writeCookie(headers, env, 'session', { ...sessionCookie, recovery: true }, 600); accept(new Response(null, { headers }));
    for (const path of ['', '/history', '/save', '/restore']) assert.equal((await cv(path)).status, 401);
    assert.equal(rpcCount(), priorRpcs);
    jar.clear(); for (const [k,v] of originalJar) jar.set(k,v);
    for (const result of ['success', 'validation', 'database']) {
      headers = authHeaders();
      await saveSession(headers, env, { access_token: token, refresh_token: 'expired-runtime-' + result, expires_at: 1, user }, false, signed.csrfToken);
      accept(new Response(null, { headers }));
      databaseFailure = result === 'database';
      const response = await cv('/save', { ...save, mode: result === 'validation' ? 'checkpoint' : 'autosave' }, { 'X-CSRF-Token': signed.csrfToken });
      assert.equal(response.status, result === 'success' ? 200 : result === 'validation' ? 422 : 503);
      assert.match(response.headers.get('set-cookie'), /resumora-local-session/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const body = await response.json(); assert.equal(JSON.stringify(body).includes('runtime-refresh'), false); assert.equal(JSON.stringify(body).includes('private synthetic diagnostic'), false);
    }
    databaseFailure = false;
    jar.set('resumora-local-session.0', 'tampered');
    const rejected = await cv(); assert.equal(rejected.status, 401); assert.match(rejected.headers.get('set-cookie'), /Max-Age=0/);
    jar.clear(); for (const [k,v] of originalJar) jar.set(k,v);
    assert.equal((await call('/logout', {}, { 'X-CSRF-Token': signed.csrfToken })).status, 200); assert.equal(jar.size, 0);
    assert.equal((await (await call('/session')).json()).user, null);
  } finally { await runtime.dispose(); }
});

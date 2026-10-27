import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, Response as RuntimeResponse, convertV4MiniflareOptions } from 'miniflare';

test('native Worker runs encrypted-cookie Supabase login/session/logout behind exact-origin CSRF boundary', async () => {
  const env = { APP_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:5173', API_ORIGIN: 'http://127.0.0.1:5173', SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', AUTH_COOKIE_KEY: Buffer.alloc(32, 9).toString('base64') };
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'runtime@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' };
  const token = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.synthetic';
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser' });
  const calls = [];
  const runtime = new Miniflare(convertV4MiniflareOptions({
    script: bundle.outputFiles[0].text, modules: true, compatibilityDate: '2026-10-25', host: '127.0.0.1', port: 0, unsafeRegisterWorker: false, bindings: env,
    outboundService: async request => {
      const url = new URL(request.url); assert.equal(url.origin, env.SUPABASE_URL); calls.push(url.pathname);
      if (url.pathname === '/auth/v1/token') return RuntimeResponse.json({ access_token: token, refresh_token: 'runtime-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user });
      if (url.pathname === '/auth/v1/user') { assert.equal(request.headers.get('authorization'), 'Bearer ' + token); return RuntimeResponse.json(user); }
      if (url.pathname === '/auth/v1/logout') return RuntimeResponse.json({});
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
    const initial = await (await call('/session')).json(); assert.equal(initial.user, null);
    const credentials = { email: user.email, password: 'synthetic-password' };
    assert.equal((await call('/login', credentials)).status, 403); assert.equal(calls.length, 0);
    const login = await call('/login', credentials, { 'X-CSRF-Token': initial.csrfToken }); assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/); assert.equal(login.headers.get('set-cookie').includes(token), false);
    const signed = await (await call('/session')).json(); assert.equal(signed.user.id, user.id); assert.equal(signed.recovery, false);
    assert.equal((await call('/logout', {}, { 'X-CSRF-Token': signed.csrfToken })).status, 200); assert.equal(jar.size, 0);
    assert.equal((await (await call('/session')).json()).user, null);
  } finally { await runtime.dispose(); }
});

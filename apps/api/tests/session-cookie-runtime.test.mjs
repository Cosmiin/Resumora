import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { bundleWorker as build } from './bundle-worker.mjs';
import { Miniflare, Response as RuntimeResponse, convertV4MiniflareOptions } from 'miniflare';
import { authHeaders, saveSession } from '../src/auth/session.ts';
import { readCookie } from '../src/auth/cookies.ts';

class CookieJar {
  values = new Map();
  accept(response) {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const at = pair.indexOf('=');
      const name = pair.slice(0, at), value = pair.slice(at + 1);
      if (value) this.values.set(name, value);
      else this.values.delete(name);
    }
    return response;
  }
  header() { return [...this.values].map(([k, v]) => `${k}=${v}`).join('; '); }
}

test('mounted Worker private responses cannot replace newer cookies after refresh-threshold and delayed-response interleavings', { timeout: 30000 }, async () => {
  const env = {
    APP_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:5173', API_ORIGIN: 'http://127.0.0.1:5173',
    SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
    AUTH_COOKIE_KEY: Buffer.alloc(32, 17).toString('base64'), AI_PAID_INFERENCE: 'off',
  };
  const users = ['a', 'b'].map(label => ({ id: crypto.randomUUID(), email: `${label}@synthetic.invalid`, email_confirmed_at: '2026-01-01T00:00:00Z' }));
  const sessions = new Map();
  let sequence = 0, refreshCount = 0;
  function session(user, expires = Math.floor(Date.now() / 1000) + 3600) {
    const access = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: user.id, exp: expires, sequence: ++sequence })).toString('base64url') + '.synthetic';
    const value = { access_token: access, refresh_token: `synthetic-refresh-${sequence}`, expires_at: expires, expires_in: expires - Math.floor(Date.now() / 1000), token_type: 'bearer', user };
    sessions.set(access, value);
    return value;
  }
  const waiting = [];
  let holdReads = false;
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser' });
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{ type: 'ESModule', path: 'entry.mjs', contents: bundle.outputFiles[0].text }, ...bundle.wasm], compatibilityDate: '2026-10-25', host: '127.0.0.1', port: 0, unsafeRegisterWorker: false, bindings: env,
    outboundService: async request => {
      const url = new URL(request.url);
      assert.equal(url.origin, env.SUPABASE_URL, 'Only synthetic Auth/database requests permitted');
      if (url.pathname === '/auth/v1/token') {
        const body = await request.json();
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          refreshCount++;
          const prior = [...sessions.values()].find(s => s.refresh_token === body.refresh_token);
          assert.ok(prior);
          return RuntimeResponse.json(session(prior.user));
        }
        assert.equal(url.searchParams.get('grant_type'), 'password');
        return RuntimeResponse.json(session(users.find(u => u.email === body.email)));
      }
      const current = sessions.get(request.headers.get('authorization')?.replace('Bearer ', ''));
      assert.ok(current, 'Verified synthetic access token required');
      if (url.pathname === '/auth/v1/user') return RuntimeResponse.json(current.user);
      assert.equal(url.pathname, '/rest/v1/rpc/load_base_draft');
      if (holdReads) await new Promise(resolve => waiting.push(resolve));
      return RuntimeResponse.json(null);
    },
  }));
  const same = new CookieJar(), switched = new CookieJar();
  async function seed(jar, expires) {
    const headers = authHeaders();
    await saveSession(headers, env, session(users[0], expires), false, 'synthetic-csrf-a');
    jar.accept(new Response(null, { headers }));
  }
  const decode = jar => readCookie(new Request(env.APP_ORIGIN, { headers: { Cookie: jar.header() } }), env, 'session');
  try {
    const origin = (await runtime.ready).origin;
    const call = (jar, path, init = {}) => fetch(origin + path, { ...init, headers: { Cookie: jar.header(), ...init.headers } });
    const privateCall = async (jar, path = '/v1/base-cv') => {
      const cookie = await decode(jar);
      return call(jar, path, { headers: { 'X-Resumora-Account': users[0].id, 'X-CSRF-Token': cookie.csrf } });
    };
    const expiry = Math.floor(Date.now() / 1000) + 92;
    await seed(same, expiry);
    const precheck = await call(same, '/v1/auth/session');
    same.accept(precheck);
    assert.equal((await precheck.json()).user.id, users[0].id);
    assert.equal(precheck.headers.getSetCookie().length, 0);
    await delay(Math.max(0, (expiry - 90) * 1000 - Date.now() + 100));
    const oldCookie = same.header();
    const insufficient = await privateCall(same);
    assert.equal(insufficient.status, 409);
    assert.equal((await insufficient.clone().json()).error.code, "SESSION_REFRESH_REQUIRED");
    assert.equal(insufficient.headers.getSetCookie().length, 0);
    assert.equal(refreshCount, 0, 'Private requests cannot rotate a refresh token');
    assert.equal(same.header(), oldCookie);
    const refreshed = await call(same, '/v1/auth/session');
    same.accept(refreshed);
    assert.equal((await refreshed.json()).user.id, users[0].id);
    assert.ok(refreshed.headers.getSetCookie().length);
    assert.equal(refreshCount, 1);
    assert.notEqual((await decode(same)).access, sessions.values().next().value.access_token);
    assert.equal((await privateCall(same)).status, 200);

    const longExpiry = Math.floor(Date.now() / 1000) + 100;
    await seed(same, longExpiry);
    await seed(switched, longExpiry);
    holdReads = true;
    const started = Date.now();
    const aResponse = privateCall(same), switchedResponse = privateCall(switched);
    while (waiting.length < 2) await delay(5);
    await delay(Math.max(0, 10500 - (Date.now() - started)));
    const sameRefresh = await call(same, '/v1/auth/session');
    same.accept(sameRefresh);
    assert.equal((await sameRefresh.json()).user.id, users[0].id);
    assert.ok(sameRefresh.headers.getSetCookie().length);
    assert.equal(refreshCount, 2);
    const loginB = await call(switched, '/v1/auth/login', {
      method: 'POST', headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': 'synthetic-csrf-a' },
      body: JSON.stringify({ email: users[1].email, password: 'synthetic-password' }),
    });
    switched.accept(loginB);
    assert.equal((await loginB.json()).user.id, users[1].id);
    const newerSame = same.header(), newerB = switched.header();
    assert.equal((await decode(switched)).access, [...sessions.values()].at(-1).access_token);
    holdReads = false;
    for (const release of waiting.splice(0)) release();
    for (const [jar, response, expected] of [[same, await aResponse, newerSame], [switched, await switchedResponse, newerB]]) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.getSetCookie().length, 0);
      jar.accept(response);
      assert.equal(jar.header(), expected, 'Applying actual delayed Worker cookies must preserve newer session');
    }
    same.accept(insufficient);
    switched.accept(insufficient);
    assert.equal(same.header(), newerSame);
    assert.equal(switched.header(), newerB);
    const bStatus = await call(switched, '/v1/auth/session');
    switched.accept(bStatus);
    assert.equal((await bStatus.json()).user.id, users[1].id);
    const denied = await privateCall(switched);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.getSetCookie().length, 0);
    assert.equal(switched.header(), newerB);
    const stale = new CookieJar();
    await seed(stale, 1);
    for (const path of ['/v1/base-cv/history', '/v1/intelligence/imports', '/v1/intelligence/imports/11111111-1111-4111-8111-111111111111']) {
      const response = await privateCall(stale, path);
      assert.equal(response.status, 409);
      assert.equal(response.headers.getSetCookie().length, 0);
    }
    assert.equal(refreshCount, 2);
  } finally {
    for (const release of waiting.splice(0)) release();
    await runtime.dispose();
  }
});

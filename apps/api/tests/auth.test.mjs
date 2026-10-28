import assert from 'node:assert/strict';
import test from 'node:test';
import { authRoute } from '../src/auth/routes.ts';
import { authenticateRequest, saveSession, authHeaders } from '../src/auth/session.ts';
import { readCookie, writeCookie } from '../src/auth/cookies.ts';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', aud: 'authenticated' };
const env = { APP_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:5173', API_ORIGIN: 'http://127.0.0.1:5173', SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', AUTH_COOKIE_KEY: Buffer.alloc(32, 7).toString('base64') };
const jwt = (exp = Math.floor(Date.now() / 1000) + 3600) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp, session_id: 'synthetic-session' })).toString('base64url'), 'synthetic'].join('.');
function provider() {
  const calls = [];
  let failure = null;
  let revoked = false, failUser = false, refreshCount = 0, rejectRefresh = false, accountError = false, redirect = false, exchangeError = false, limited = false;
  const session = () => ({ access_token: jwt(), refresh_token: 'synthetic-refresh-' + refreshCount, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user });
  const transport = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, env.SUPABASE_URL);
    assert.equal(init.redirect, 'manual');
    calls.push({ path: url.pathname, search: url.search, method: init.method, body: init.body ? JSON.parse(init.body) : null, authorization: new Headers(init.headers).get('authorization') });
    if (failure && url.pathname.endsWith(failure.path) && init.method === failure.method) return Response.json({ message: 'synthetic unavailable', code: failure.code }, { status: failure.status, headers: { 'X-Supabase-Api-Version': '2024-01-01' } });
    if (limited) return Response.json({ msg: 'rate limited' }, { status: 429 });
    if (redirect) return new Response(null, { status: 302, headers: { Location: 'https://untrusted.invalid/' } });
    if (url.pathname.endsWith('/user') && init.method === 'GET') return failUser || revoked ? Response.json({ message: 'invalid token' }, { status: 401 }) : Response.json(user);
    if (url.pathname.endsWith('/user') && init.method === 'PUT') return Response.json(user);
    if (url.pathname.endsWith('/logout')) { revoked = true; return new Response('{}'); }
    if (url.pathname.endsWith('/signup') || url.pathname.endsWith('/recover')) return accountError ? Response.json({ msg: 'account exists', code: 'user_already_exists' }, { status: 422 }) : Response.json(url.pathname.endsWith('/signup') ? { user, session: null } : {});
    if (url.pathname.endsWith('/token')) {
      if (exchangeError && url.searchParams.get('grant_type') === 'pkce') return Response.json({ error: 'invalid_grant' }, { status: 400 });
      if (url.searchParams.get('grant_type') === 'refresh_token') { refreshCount++; if (revoked || rejectRefresh) return Response.json({ error: 'invalid_grant' }, { status: 400 }); }
      if (calls.at(-1).body?.password === 'wrong-password') return Response.json({ msg: 'invalid credentials' }, { status: 400 });
      return Response.json(session());
    }
    throw Error('Unexpected provider request');
  };
  return { transport, calls, session, set failure(v) { failure = v; }, get refreshCount() { return refreshCount; }, set failUser(v) { failUser = v; }, set rejectRefresh(v) { rejectRefresh = v; }, set accountError(v) { accountError = v; }, set redirect(v) { redirect = v; }, set exchangeError(v) { exchangeError = v; }, set limited(v) { limited = v; } };
}
class Browser {
  jar = new Map(); csrf = '';
  constructor(p) { this.p = p; }
  cookie() { return [...this.jar].map(([k, v]) => k + '=' + v).join('; '); }
  accept(response) { for (const value of response.headers.getSetCookie()) { const [part] = value.split(';'); const at = part.indexOf('='); const k = part.slice(0, at), v = part.slice(at + 1); if (v) this.jar.set(k, v); else this.jar.delete(k); } }
  request(path, init = {}) { return new Request(env.APP_ORIGIN + path, { ...init, headers: { Cookie: this.cookie(), 'X-Resumora-Account': user.id, 'X-CSRF-Token': this.csrf, ...(init.method === 'POST' ? { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf } : {}), ...init.headers } }); }
  async call(path, body, overrides = {}) {
    const response = await authRoute(this.request('/v1/auth' + path, body === undefined ? overrides : { method: 'POST', body: JSON.stringify(body), ...overrides }), env, this.p.transport);
    this.accept(response);
    return response;
  }
  async status() { const response = await this.call('/session'); const value = await response.json(); this.csrf = value.csrfToken; return value; }
  async login() { await this.status(); assert.equal((await this.call('/login', { email: user.email, password: 'synthetic-password' })).status, 200); return this.status(); }
}

test('configuration fails closed; methods and privileged configuration rejected before provider egress', async () => {
  const p = provider(), b = new Browser(p);
  assert.equal((await authRoute(b.request('/v1/auth/session'), {}, p.transport)).status, 503);
  const legacyAnon = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.synthetic';
  for (const key of ['sb_secret_forbidden', legacyAnon, '', 'sb_publishable_', 'sb_publishable_invalid key']) {
    assert.equal((await authRoute(b.request('/v1/auth/session'), { ...env, SUPABASE_PUBLISHABLE_KEY: key }, p.transport)).status, 503);
  }
  assert.equal((await authRoute(b.request('/v1/auth/session'), env, p.transport)).status, 200);
  assert.equal((await authRoute(b.request('/v1/auth/session'), { ...env, APP_ORIGIN: 'http://evil.invalid' }, p.transport)).status, 503);
  assert.equal((await b.call('/login')).status, 405);
  assert.equal(p.calls.length, 0);
});
test('login uses verified provider identity; HttpOnly encrypted token pair stays outside JSON; logout clears all cookies and revokes local session', async () => {
  const p = provider(), b = new Browser(p);
  const status = await b.login(); assert.deepEqual(status.user, { id: user.id, email: user.email }); assert.equal(status.recovery, false);
  assert.equal(JSON.stringify(status).includes('synthetic-refresh'), false);
  assert.equal(b.cookie().includes(jwt()), false);
  const verified = await authenticateRequest(b.request('/v1/base-cv'), env, p.transport);
  assert.equal(verified.user.id, user.id); assert.equal(verified.accessToken, jwt());
  const response = await b.call('/logout', {}); assert.equal(response.status, 200); assert.equal(b.jar.size, 0);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=0/);
  assert.equal(p.calls.find(c => c.path.endsWith('/logout')).search, '?scope=local');
  assert.equal((await authenticateRequest(b.request('/v1/base-cv'), env, p.transport)).response.status, 401);
});
test('wrong/unknown credentials share safe error; provider diagnostics never returned', async () => {
  const b = new Browser(provider()); await b.status();
  const first = await (await b.call('/login', { email: user.email, password: 'wrong-password' })).json();
  const second = await (await b.call('/login', { email: 'unknown@example.invalid', password: 'wrong-password' })).json();
  assert.deepEqual(first.error, second.error); assert.equal(first.error.code, 'INVALID_CREDENTIALS');
});
test('writes reject absent/foreign origin, absent/wrong csrf, non-json and oversized bodies without egress', async () => {
  const p = provider(), b = new Browser(p); await b.status();
  for (const headers of [{ Origin: '' }, { Origin: 'https://evil.invalid' }, { 'X-CSRF-Token': '' }, { 'X-CSRF-Token': 'wrong' }, { 'Content-Type': 'text/plain' }]) {
    assert.equal((await b.call('/login', { email: user.email, password: 'synthetic-password' }, { headers })).status, 403);
  }
  assert.equal((await b.call('/login', { email: user.email, password: 'x'.repeat(9000) })).status, 400);
  assert.equal(p.calls.length, 0);
});
test('signup and recovery are enumeration-resistant, preserve PKCE, refuse overlapping flow, and never establish sessions', async () => {
  for (const path of ['/signup', '/recovery']) {
    const values = [], cookieSizes = [];
    for (const existing of [false, true]) {
      const p = provider(), b = new Browser(p); p.accountError = existing; await b.status();
      const response = await b.call(path, { email: user.email, password: 'synthetic-password' });
      assert.equal(response.status, 200); values.push(await response.json());
      cookieSizes.push(response.headers.getSetCookie().map(value => value.length));
      assert.equal((await b.status()).user, null);
      assert.equal((await b.call(path, { email: user.email, password: 'synthetic-password' })).status, 409);
      assert.equal(p.calls.length, 1);
      if (!existing) {
        const call = p.calls[0]; assert.equal(call.body.code_challenge_method, 's256'); assert.ok(call.body.code_challenge);
        assert.equal(new URL(new URL(env.SUPABASE_URL + call.path + call.search).searchParams.get('redirect_to')).origin, env.APP_ORIGIN);
      }
    }
    assert.deepEqual(values[0], values[1]); assert.deepEqual(cookieSizes[0], cookieSizes[1]);
  }
});
test('tampered, expired and provider-rejected sessions fail closed; rotated cookies forward on successful concurrent refresh', async () => {
  const p = provider(), b = new Browser(p); await b.login();
  const sessionCookie = await readCookie(b.request('/'), env, 'session');
  b.jar.set('resumora-local-session.0', 'tampered');
  assert.equal((await authenticateRequest(b.request('/'), env, p.transport)).response.status, 401);
  let headers = authHeaders(); await writeCookie(headers, env, 'session', sessionCookie, -1); b.accept(new Response(null, { headers }));
  assert.equal((await authenticateRequest(b.request('/'), env, p.transport)).response.status, 401);
  headers = authHeaders(); await saveSession(headers, env, { ...p.session(), expires_at: Math.floor(Date.now() / 1000) - 1 }, false, b.csrf); b.accept(new Response(null, { headers }));
  const results = await Promise.all([authenticateRequest(b.request('/'), env, p.transport), authenticateRequest(b.request('/'), env, p.transport)]);
  assert.equal(p.refreshCount, 1);
  for (const result of results) { assert.equal(result.user.id, user.id); assert.ok(result.headers.getSetCookie().length); }
  b.accept(new Response(null, { headers: results[0].headers })); p.failUser = true;
  const rejected = await authenticateRequest(b.request('/'), env, p.transport); assert.equal(rejected.response.status, 401); assert.match(rejected.response.headers.get('set-cookie'), /Max-Age=0/);
});
test('revoked refresh fails closed; provider redirects are not followed', async () => {
  const p = provider(), b = new Browser(p); p.rejectRefresh = true;
  const headers = authHeaders(); await saveSession(headers, env, { ...p.session(), refresh_token: 'different-revoked-refresh', expires_at: 1 }, false); b.accept(new Response(null, { headers }));
  assert.equal((await authenticateRequest(b.request('/'), env, p.transport)).response.status, 401);
  await b.status(); p.redirect = true;
  assert.equal((await b.call('/login', { email: user.email, password: 'synthetic-password' })).status, 401);
  assert.equal(p.calls.at(-1).path, '/auth/v1/token');
});
test('recovery requires browser-bound recovery PKCE; fixed clean redirects defeat return URL/token leakage; successful update consumes session', async () => {
  const p = provider(), b = new Browser(p); await b.status();
  assert.equal((await b.call('/password', { password: 'new-synthetic-password' })).status, 401);
  const missing = await b.call('/callback/recovery?code=missing&next=https://evil.invalid'); assert.equal(missing.headers.get('location'), env.APP_ORIGIN + '/?auth=link-invalid');
  await b.call('/recovery', { email: user.email });
  const callback = await b.call('/callback/recovery?code=synthetic-code&next=https://evil.invalid&access_token=leak');
  assert.equal(callback.status, 303); assert.equal(callback.headers.get('location'), env.APP_ORIGIN + '/reset-password'); assert.equal(callback.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await b.status()).recovery, true);
  assert.equal((await authenticateRequest(b.request('/v1/base-cv'), env, p.transport)).response.status, 401);
  const replayCookies = new Map(b.jar), replayCsrf = b.csrf;
  const updated = await b.call('/password', { password: 'new-synthetic-password' }); assert.equal(updated.status, 200); assert.equal(b.jar.size, 0);
  b.jar = replayCookies; b.csrf = replayCsrf;
  assert.equal((await b.call('/password', { password: 'another-password' })).status, 401);
  const replay = await b.call('/callback/recovery?code=synthetic-code'); assert.equal(replay.headers.get('location'), env.APP_ORIGIN + '/?auth=link-invalid');
});
test('confirmation flow cannot grant recovery rights; direct recovery route cannot promote ordinary login', async () => {
  const p = provider(), b = new Browser(p); await b.status(); await b.call('/signup', { email: user.email, password: 'synthetic-password' });
  const swapped = await b.call('/callback/recovery?code=confirmation-code'); assert.match(swapped.headers.get('location'), /link-invalid/); assert.equal(p.calls.length, 1);
  await b.login(); assert.equal((await b.call('/password', { password: 'new-password' })).status, 401);
});
test('secure cookie policy and chunked large sessions roundtrip; cookie purposes cannot be swapped', async () => {
  const secure = { ...env, APP_ENV: 'production', APP_ORIGIN: 'https://app.example.invalid', API_ORIGIN: 'https://app.example.invalid' };
  const headers = authHeaders(); await writeCookie(headers, secure, 'session', { access: 'x'.repeat(5000) }, 600);
  assert.match(headers.get('set-cookie'), /__Host-resumora-session/); assert.match(headers.get('set-cookie'), /; Secure/);
  const jar = headers.getSetCookie().map(v => v.split(';')[0]).join('; '), request = new Request(secure.APP_ORIGIN, { headers: { Cookie: jar } });
  assert.equal((await readCookie(request, secure, 'session')).access.length, 5000);
  assert.equal(await readCookie(request, secure, 'flow'), null);
});

test('invalid/expired exchange and expired flow cannot establish a session; confirmation success has clean redirect', async () => {
  for (const failure of ['provider', 'expired', 'wrong-signal', 'none']) {
    const p = provider(), b = new Browser(p); await b.status();
    const recovery = failure === 'wrong-signal';
    await b.call(recovery ? '/recovery' : '/signup', { email: user.email, password: 'synthetic-password' });
    if (failure === 'provider') p.exchangeError = true;
    if (failure === 'expired' || failure === 'wrong-signal') {
      const flow = await readCookie(b.request('/'), env, 'flow');
      if (failure === 'wrong-signal') for (const key of Object.keys(flow.storage)) flow.storage[key] = flow.storage[key].replace('/recovery', '');
      const headers = authHeaders(); await writeCookie(headers, env, 'flow', flow, failure === 'expired' ? -1 : 600); b.accept(new Response(null, { headers }));
    }
    const response = await b.call('/callback/' + (recovery ? 'recovery' : 'confirm') + '?code=synthetic-code&next=https://evil.invalid&sb_flow_id=unused');
    assert.equal(response.headers.get('location'), env.APP_ORIGIN + (failure === 'none' ? '/' : '/?auth=link-invalid'));
    assert.equal((await b.status()).user?.id ?? null, failure === 'none' ? user.id : null);
  }
});
test('rate limits yield bounded safe retry guidance for either email-flow account state', async () => {
  const p = provider(), b = new Browser(p); await b.status(); p.limited = true;
  const response = await b.call('/recovery', { email: user.email }); assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60'); assert.equal((await response.json()).error.code, 'RATE_LIMITED');
});
test('callback internal failure still removes the code with a clean fixed redirect', async () => {
  const p = provider(), b = new Browser(p); await b.status(); await b.call('/signup', { email: user.email, password: 'synthetic-password' });
  const original = p.transport;
  p.transport = async (input, init) => {
    const response = await original(input, init);
    if (new URL(String(input)).pathname.endsWith('/token')) { const body = await response.json(); body.access_token = 'x'.repeat(14000); return Response.json(body); }
    return response;
  };
  const response = await b.call('/callback/confirm?code=synthetic-private-code');
  assert.equal(response.status, 303); assert.equal(response.headers.get('location'), env.APP_ORIGIN + '/?auth=link-invalid');
  assert.equal((await b.status()).user, null);
});


test('temporary identity and refresh failures preserve cookies and deny protected requests until verification recovers', async () => {
  for (const path of ['/user', '/token']) {
    for (const status of [429, 503]) {
      const p = provider(), b = new Browser(p);
      await b.login();
      if (path === '/token') {
        const headers = authHeaders();
        await saveSession(headers, env, { ...p.session(), refresh_token: crypto.randomUUID(), expires_at: 1 }, false);
        b.accept(new Response(null, { headers }));
      }
      const originalCookie = b.cookie();
      p.failure = { path, method: path === '/user' ? 'GET' : 'POST', status };
      const response = await b.call('/session');
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'AUTH_UNAVAILABLE');
      assert.equal(response.headers.getSetCookie().length, 0);
      assert.equal(b.cookie(), originalCookie);
      const denied = await authenticateRequest(b.request('/v1/base-cv'), env, p.transport);
      assert.equal(denied.response.status, 503);
      assert.equal(denied.response.headers.getSetCookie().length, 0);
      p.failure = null;
      assert.equal((await b.status()).user.id, user.id);
      assert.equal((await authenticateRequest(b.request('/v1/base-cv'), env, p.transport)).user.id, user.id);
      p.failUser = true;
      assert.equal((await b.status()).user, null);
    }
  }
});

test('rotated refresh cookies survive a temporary identity check failure', async () => {
  const p = provider(), b = new Browser(p);
  const headers = authHeaders();
  await saveSession(headers, env, { ...p.session(), refresh_token: crypto.randomUUID(), expires_at: 1 }, false);
  b.accept(new Response(null, { headers }));
  p.failure = { path: '/user', method: 'GET', status: 429 };
  assert.equal((await b.call('/session')).status, 503);
  const rotated = await readCookie(b.request('/'), env, 'session');
  assert.equal(rotated.refresh, 'synthetic-refresh-1');
  p.failure = null;
  assert.equal((await b.status()).user.id, user.id);
  assert.equal(p.refreshCount, 1);
});

test('logout and password failures that clear cookies can recover anonymous CSRF for the next action', async () => {
  for (const action of ['logout', 'refresh', 'update', 'signout']) {
    const p = provider(), b = new Browser(p);
    if (action === 'logout') await b.login();
    else {
      await b.status(); await b.call('/recovery', { email: user.email });
      await b.call('/callback/recovery?code=synthetic-code'); await b.status();
    }
    const oldCsrf = b.csrf;
    p.failure = action === 'refresh' ? { path: '/token', method: 'POST', status: 400 }
      : action === 'update' ? { path: '/user', method: 'PUT', status: 400 }
      : { path: '/logout', method: 'POST', status: 503 };
    const response = await b.call(action === 'logout' ? '/logout' : '/password', { password: 'new-password' });
    assert.equal(response.ok, false);
    assert.equal(b.jar.size, 0);
    assert.equal((await b.call('/logout', {})).status, 403);
    const recovered = await b.status();
    assert.equal(recovered.user, null); assert.notEqual(recovered.csrfToken, oldCsrf);
    assert.equal((await b.call('/logout', {})).status, 200);
  }
});


test('SDK session_not_found definitively clears status, password, and protected CV sessions', async () => {
  for (const consumer of ['session', 'password', 'cv']) {
    for (const path of consumer === 'password' ? ['/user'] : ['/user', '/token']) {
      const p = provider(), b = new Browser(p), headers = authHeaders();
      const session = await saveSession(headers, env, {
        ...p.session(), refresh_token: crypto.randomUUID(), expires_at: path === '/token' ? 1 : Math.floor(Date.now() / 1000) + 3600,
      }, consumer === 'password');
      b.accept(new Response(null, { headers })); b.csrf = session.csrf;
      p.failure = { path, method: path === '/token' ? 'POST' : 'GET', status: 403, code: 'session_not_found' };
      let response;
      if (consumer === 'cv') {
        response = (await authenticateRequest(b.request('/v1/base-cv'), env, p.transport)).response;
        b.accept(response);
      } else response = await b.call('/' + consumer, consumer === 'password' ? { password: 'new-password' } : undefined);
      assert.equal(response.status, consumer === 'session' ? 200 : 401);
      const body = await response.json();
      if (consumer === 'session') assert.equal(body.user, null);
      else assert.equal(body.error.code, 'UNAUTHORIZED');
      assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
      assert.equal(await readCookie(b.request('/'), env, 'session'), null);
      assert.ok(p.calls.some(call => call.path.endsWith(path)));
    }
  }
});

test('private reads reject a captured foreign account or session even with a valid replacement cookie', async () => {
  const p = provider(), b = new Browser(p); await b.login();
  for (const path of ['/v1/base-cv/history', '/v1/jobs', '/v1/intelligence/imports', '/v1/intelligence/imports/11111111-1111-4111-8111-111111111111']) {
    for (const headers of [
      { 'X-Resumora-Account': '' },
      { 'X-Resumora-Account': '22222222-2222-4222-8222-222222222222' },
      { 'X-CSRF-Token': '' },
      { 'X-CSRF-Token': 'retired-session-csrf' },
    ]) {
      const result = await authenticateRequest(b.request(path, { headers }), env, p.transport);
      assert.equal(result.response.status, 401);
      assert.equal(result.accessToken, undefined);
      assert.deepEqual((await result.response.json()).error.code, 'UNAUTHORIZED');
    }
    assert.equal((await authenticateRequest(b.request(path), env, p.transport)).user.id, user.id);
  }
});

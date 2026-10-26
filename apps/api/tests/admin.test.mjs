import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import http from 'node:http';
import { authorizeOwner } from '../src/admin/auth.ts';
import { adminRoute } from '../src/admin/routes.ts';
import { dashboardResponse } from '../src/admin/dashboard.ts';
import worker from '../src/index.ts';
import { demoLedger, SyntheticLedger } from '../fixtures/synthetic-ledger.ts';
import { startDemo } from '../scripts/admin-demo.mjs';
import { authConfig, signingFixture, otherId, request, durableDouble, ownerId } from './helpers.mjs';

test('owner verification supports ES256 and RS256, requires pinned issuer/JWKS/allowlist', async () => {
  for (const alg of ['ES256', 'RS256']) {
    const fixture = await signingFixture(alg);
    const result = await authorizeOwner(request('/', await fixture.token()), authConfig, fixture.transport);
    assert.equal(result.owner.subject, ownerId);
  }
  const fixture = await signingFixture();
  let calls = 0;
  for (const env of [{}, { ...authConfig, ADMIN_USER_IDS: '' }, { ...authConfig, ADMIN_USER_IDS: 'owner@example.com' },
    { ...authConfig, SUPABASE_JWT_ISSUER: undefined }, { ...authConfig, SUPABASE_JWKS_URL: 'https://attacker.invalid/jwks' }]) {
    assert.equal((await authorizeOwner(request('/', await fixture.token()), env, async () => { calls++; })).status, 503);
  }
  assert.equal(calls, 0);
});

test('reject anonymous, nonowner, forged, expired, future and malformed tokens; email/role cannot grant owner', async () => {
  const fixture = await signingFixture();
  const good = await fixture.token();
  const forged = good.split('.');
  forged[1] = Buffer.from(JSON.stringify({ iss: authConfig.SUPABASE_JWT_ISSUER, aud: 'authenticated', sub: ownerId, exp: 9999999999 })).toString('base64url');
  for (const token of [undefined, 'bad', 'a.b.c', 'x'.repeat(8193), forged.join('.'),
    await fixture.token({ exp: Math.floor(Date.now() / 1000) - 1 }), await fixture.token({ exp: '9999999999' }),
    await fixture.token({ nbf: 9999999999 }), await fixture.token({ iat: 9999999999 }),
    await fixture.token({ aud: 'wrong' }), await fixture.token({ iss: 'https://other.supabase.co/auth/v1' }),
    await fixture.token({}, { alg: 'HS256' }), await fixture.token({}, { alg: 'none' }),
    await fixture.token({}, { kid: 'missing' }), await fixture.token({}, { jku: 'https://attacker.invalid' })]) {
    assert.equal((await authorizeOwner(request('/', token), authConfig, fixture.transport)).status, 401);
  }
  assert.equal((await authorizeOwner(request('/', await fixture.token({ sub: otherId, email: 'owner@example.com', role: 'admin', app_metadata: { admin: true } })), authConfig, fixture.transport)).status, 403);
  for (const keys of [[], [fixture.jwk, fixture.jwk], [{ ...fixture.jwk, use: 'enc' }]]) {
    assert.equal((await authorizeOwner(request('/', good), authConfig, async () => Response.json({ keys }))).status, 401);
  }
  assert.equal((await authorizeOwner(request('/', good), authConfig, async () => { throw new Error('JWKS offline'); })).status, 401);
});

test('every admin route verifies owner before ledger reads, validates period and denies synthetic persistence', async () => {
  const fixture = await signingFixture();
  const owner = await fixture.token();
  let reads = 0;
  const ledger = { durability: 'durable', report: async () => { reads++; throw new Error('private database error'); } };
  for (const path of ['/admin/ai', '/v1/admin/ai/usage']) {
    for (const [token, code] of [[undefined, 401], ['invalid', 401], [await fixture.token({ sub: otherId }), 403]]) {
      const response = await adminRoute(request(path, token), authConfig, { authTransport: fixture.transport, ledger });
      assert.equal(response.status, code);
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
    for (const unconnected of [undefined, new SyntheticLedger()]) {
      const response = await adminRoute(request(path, owner), authConfig, { authTransport: fixture.transport, ledger: unconnected });
      assert.equal(response.status, 503);
      assert.match(await response.text(), /Registrul persistent de utilizare nu este conectat/);
    }
    assert.equal((await adminRoute(request(path + '?from=bad', owner), authConfig, { authTransport: fixture.transport, ledger })).status, 400);
    const wrongMethod = await adminRoute(request(path, owner, { method: 'POST' }), authConfig, { authTransport: fixture.transport, ledger });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'GET');
  }
  assert.equal(reads, 0);
  const unavailable = await adminRoute(request('/v1/admin/ai/usage', owner), authConfig, { authTransport: fixture.transport, ledger });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.text()).includes('private database error'), false);
  assert.equal(reads, 1);
});

test('authorized usage and generated dashboard expose accounting only, with safe headers and honest empty/unknown states', async () => {
  const fixture = await signingFixture();
  const owner = await fixture.token();
  const ledger = durableDouble(await demoLedger());
  const env = { ...authConfig, OPENAI_API_KEY: 'sentinel-provider-key', SUPABASE_SERVICE_ROLE_KEY: 'sentinel-service-key', ADMIN_ORG_KEY: 'sentinel-admin-key' };
  const dependencies = { authTransport: fixture.transport, ledger };
  const report = await adminRoute(request('/v1/admin/ai/usage?from=2026-10-26&to=2026-10-26', owner), env, dependencies);
  const data = await report.json();
  assert.equal(data.connection, 'unverified');
  assert.equal(data.report.totals.attempts, 6);
  assert.equal(data.report.totals.unknownCost, 3);
  const response = await adminRoute(request('/admin/ai?from=2026-10-26&to=2026-10-26', owner), env, dependencies);
  const html = await response.text();
  assert.match(html, /Tokenuri și costuri/);
  assert.match(html, /Necunoscut/);
  assert.match(html, /TIMEOUT/);
  assert.match(html, /data exclusiv sintetice|Estimări de utilizare/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('set-cookie'), null);
  for (const secret of ['sentinel-provider-key', 'sentinel-service-key', 'sentinel-admin-key', owner]) assert.equal(html.includes(secret), false);
  const empty = await adminRoute(request('/admin/ai?from=2026-10-27&to=2026-10-28', owner), env, dependencies);
  assert.match(await empty.text(), /Nicio utilizare înregistrată/);
  const escaped = await dashboardResponse({ kind: 'error', message: '<script>alert(1)</script>' }).text();
  assert.equal(escaped.includes('<script>'), false);
  assert.match(escaped, /&lt;script&gt;/);
});

test('dashboard output labels preparation and missing integrations in every state', async () => {
  const ledger = await demoLedger();
  const populated = await ledger.report({ from: '2026-10-26', to: '2026-10-26' });
  const empty = await ledger.report({ from: '2026-10-27', to: '2026-10-28' });
  for (const state of [
    ...[populated, empty].flatMap(report => [true, false].map(synthetic => ({ kind: 'ready', report, synthetic }))),
    ...['locked', 'unavailable', 'error'].map(kind => ({ kind, message: 'Test state' })),
  ]) {
    const html = await dashboardResponse(state).text();
    assert.match(html, /Etapă de pregătire · integrarea urmează/);
    assert.match(html, /Autentificarea în browser și registrul persistent de utilizare nu sunt conectate/);
    assert.match(html, /Apelurile OpenAI sunt dezactivate în aplicație/);
    assert.match(html, /Costurile reale acumulate nu sunt disponibile/);
    if (state.synthetic) assert.match(html, /costurile de mai jos sunt exemple, nu cheltuieli acumulate/);
  }
});

test('Worker unconfigured routes fail closed and never expose a provider proxy, demo, or credential files', async () => {
  for (const path of ['/admin/ai', '/v1/admin/ai/usage']) {
    const response = await worker.fetch(request(path), { APP_ENV: 'development', OPENAI_API_KEY: 'sentinel' });
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.equal(body.includes('sentinel'), false);
    assert.equal(body.includes('synthetic-attempt'), false);
  }
  for (const path of ['/v1/ai/generate', '/v1/admin/ai/check', '/admin/ai/demo', '/.dev.vars', '/src/ai/openai.ts']) {
    assert.equal((await worker.fetch(request(path), { APP_ENV: 'development' })).status, 404);
  }
});

test('actual loopback HTTP preview serves synthetic/filtered/empty/error states, denies remote host and files', async () => {
  const server = await startDemo(0);
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(origin + '/admin/ai?from=2026-10-26&to=2026-10-26');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Demonstrație · date exclusiv sintetice/);
    const empty = await fetch(origin + '/admin/ai?from=2026-10-27&to=2026-10-28');
    assert.match(await empty.text(), /Nicio utilizare înregistrată/);
    assert.equal((await fetch(origin + '/admin/ai?from=invalid')).status, 400);
    assert.equal((await fetch(origin + '/admin/ai', { method: 'POST' })).status, 405);
    assert.equal((await fetch(origin + '/.dev.vars')).status, 404);
    assert.equal((await fetch(origin + '/v1/admin/ai/usage')).status, 404);
    const remoteHost = await new Promise((resolve, reject) => {
      const req = http.get(origin + '/admin/ai', { headers: { Host: 'attacker.invalid' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
    });
    assert.equal(remoteHost, 403);
  } finally { server.close(); server.closeAllConnections(); await once(server, 'close'); }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bundleWorker as build } from './bundle-worker.mjs';
import { Miniflare, Response as RuntimeResponse, convertV4MiniflareOptions } from 'miniflare';
import { authConfig, ownerId, otherId, signingFixture, providerUsage } from './helpers.mjs';

test('native workerd verifies signed owners/nonowners and rejects JWKS/provider redirects without following them', async () => {
  const fixtures = await Promise.all(['ES256', 'RS256'].map(async alg => {
    const signer = await signingFixture(alg);
    return { alg, signer, kid: `runtime-${alg}` };
  }));
  const keys = fixtures.map(f => ({ ...f.signer.jwk, kid: f.kid }));
  const signed = (fixture, claims = {}) => fixture.signer.token(claims, { kid: fixture.kid });
  // Bundle the actual entrypoint and adapter in memory with the already locked Wrangler tools.
  // The additional fixed-check route exists only in this test harness, never in the app.
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('../', import.meta.url)), contents: `
    import api from './src/index.ts';
    import { authorizeOwner } from './src/admin/auth.ts';
    import { prepareConnection } from './src/ai/openai.ts';
    import { SyntheticLedger } from './fixtures/synthetic-ledger.ts';
    export default { async fetch(request, env) {
      if (new URL(request.url).pathname !== '/test-only/connection') return api.fetch(request, env);
      const authorization = await authorizeOwner(request, env);
      if (!authorization.owner) return Response.json({ denied: true }, { status: authorization.status });
      const adapter = prepareConnection({ OPENAI_MODEL: 'gpt-5.4-nano', OPENAI_PROVIDER_SCOPE: 'synthetic-runtime' }, {
        ledger: new SyntheticLedger(), execution: 'synthetic', transport: (...args) => fetch(...args),
      });
      return Response.json(await adapter.check({ owner: authorization.owner, operationId: 'runtime-check', attemptId: crypto.randomUUID() }));
    } };` }, bundle: true, write: false, format: 'esm', platform: 'browser' });
  let jwksRedirect = 0;
  let providerRedirect = 0;
  const destinations = [];
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{type:'ESModule',path:'entry.mjs',contents:bundle.outputFiles[0].text},...bundle.wasm], compatibilityDate: '2026-10-25',
    host: '127.0.0.1', port: 0, unsafeRegisterWorker: false,
    bindings: { APP_ENV: 'development', ...authConfig },
    // Every native Worker subrequest is intercepted. There is no real provider/JWKS egress.
    outboundService: async request => {
      destinations.push(request.url);
      if (request.url === authConfig.SUPABASE_JWKS_URL) {
        return jwksRedirect ? new RuntimeResponse(JSON.stringify({ keys }), { status: jwksRedirect, headers: { Location: 'https://redirect.invalid/collect' } })
          : RuntimeResponse.json({ keys });
      }
      if (request.url === 'https://api.openai.com/v1/responses') {
        assert.equal(request.method, 'POST');
        assert.equal(request.headers.get('authorization'), 'Bearer synthetic-only');
        return new RuntimeResponse(JSON.stringify({ id: 'resp_runtime', model: 'gpt-5.4-nano', status: 'completed', service_tier: 'default', usage: providerUsage }), {
          status: providerRedirect || 200,
          headers: { 'Content-Type': 'application/json', ...(providerRedirect ? { Location: 'https://redirect.invalid/collect' } : {}) },
        });
      }
      assert.fail('Unexpected outbound destination; no external network is permitted');
    },
  }));
  try {
    const origin = (await runtime.ready).origin;
    const call = (path, token) => fetch(origin + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    for (const fixture of fixtures) {
      for (const path of ['/admin/ai', '/v1/admin/ai/usage']) {
        const owner = await call(path, await signed(fixture));
        assert.equal(owner.status, 503, `${fixture.alg} verified owner must reach the missing-ledger guard`);
        if (path.startsWith('/v1')) assert.equal((await owner.json()).error.code, 'LEDGER_UNCONNECTED');
        else assert.match(await owner.text(), /Registrul persistent de utilizare nu este conectat/);
        const nonowner = await call(path, await signed(fixture, { sub: otherId, email: 'owner@example.invalid', role: 'admin' }));
        assert.equal(nonowner.status, 403, `${fixture.alg} nonowner must reach the verified allowlist denial`);
        await nonowner.arrayBuffer();
      }
    }
    assert.equal((await call('/v1/admin/ai/usage')).status, 401);
    const ownerToken = await signed(fixtures[0]);
    for (const code of [301, 302, 303, 307, 308]) {
      jwksRedirect = code;
      const before = destinations.length;
      const response = await call('/v1/admin/ai/usage', ownerToken);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
      assert.deepEqual(destinations.slice(before), [authConfig.SUPABASE_JWKS_URL]);
    }
    jwksRedirect = 0;
    const completed = await (await call('/test-only/connection', ownerToken)).json();
    assert.equal(completed.userId, ownerId);
    assert.equal(completed.result.status, 'completed');
    assert.equal(completed.result.estimatedNanoUsd, '378000');
    for (const code of [301, 302, 303, 307, 308]) {
      providerRedirect = code;
      const before = destinations.length;
      const attempt = await (await call('/test-only/connection', ownerToken)).json();
      assert.equal(attempt.result.httpStatus, code);
      assert.equal(attempt.result.status, 'failed');
      assert.equal(attempt.result.errorCode, 'PROVIDER_REJECTED');
      assert.equal(attempt.result.usage.state, 'missing');
      assert.equal(attempt.result.estimatedNanoUsd, null);
      assert.deepEqual(destinations.slice(before), [authConfig.SUPABASE_JWKS_URL, 'https://api.openai.com/v1/responses']);
    }
  } finally { await runtime.dispose(); }
});

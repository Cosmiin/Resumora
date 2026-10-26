import { authorizeOwner } from '../src/admin/auth.ts';

export const ownerId = '11111111-1111-4111-8111-111111111111';
export const otherId = '22222222-2222-4222-8222-222222222222';
export const authConfig = { SUPABASE_JWT_ISSUER: 'https://synthetic.supabase.co/auth/v1',
  SUPABASE_JWKS_URL: 'https://synthetic.supabase.co/auth/v1/.well-known/jwks.json', ADMIN_USER_IDS: ownerId };

export async function signingFixture(alg = 'ES256') {
  const algorithm = alg === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }
    : { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const pair = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'synthetic-key', alg, use: 'sig' };
  const encode = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  return {
    jwk,
    async token(claims = {}, headers = {}) {
      const input = encode({ alg, kid: jwk.kid, typ: 'JWT', ...headers }) + '.' + encode({
        iss: authConfig.SUPABASE_JWT_ISSUER, aud: 'authenticated', sub: ownerId,
        exp: Math.floor(Date.now() / 1000) + 3600, ...claims,
      });
      const signature = await crypto.subtle.sign(algorithm, pair.privateKey, new TextEncoder().encode(input));
      return input + '.' + Buffer.from(signature).toString('base64url');
    },
    async transport(url, init) {
      if (url !== authConfig.SUPABASE_JWKS_URL || init.redirect !== 'manual') throw new Error('Unexpected JWKS request');
      return Response.json({ keys: [jwk] });
    },
  };
}

export function request(path, token, init = {}) {
  return new Request('https://resumora.invalid' + path, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
}
export async function verifiedOwner(fixture) {
  return (await authorizeOwner(request('/', await fixture.token()), authConfig, fixture.transport)).owner;
}
export const providerUsage = { input_tokens: 1000, output_tokens: 200, total_tokens: 1200,
  input_tokens_details: { cached_tokens: 400 }, output_tokens_details: { reasoning_tokens: 80 } };
export function providerResponse(overrides = {}, status = 200) {
  return Response.json({ id: 'resp_synthetic', model: 'gpt-5.4-nano', status: 'completed', service_tier: 'default', usage: providerUsage,
    output: [{ content: [{ text: 'synthetic-private-model-output' }] }], ...overrides }, { status, headers: { 'x-request-id': 'req_synthetic' } });
}

// Test double only, exercising the real route's durable-port requirement without a hosted DB.
export const durableDouble = ledger => ({ durability: 'durable', begin: ledger.begin.bind(ledger), finish: ledger.finish.bind(ledger), report: ledger.report.bind(ledger) });

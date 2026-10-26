import { object } from '../ai/accounting.ts';
import { boundedJson } from '../ai/http.ts';

export interface AdminAuthConfig {
  SUPABASE_JWT_ISSUER?: string;
  SUPABASE_JWKS_URL?: string;
  ADMIN_USER_IDS?: string;
}
declare const verified: unique symbol;
export type VerifiedOwner = { readonly subject: string; readonly [verified]: true };
export type Authorization = { owner: VerifiedOwner; status?: never; code?: never }
  | { owner?: never; status: 401 | 403 | 503; code: 'AUTH_UNCONFIGURED' | 'UNAUTHORIZED' | 'FORBIDDEN' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const safeId = /^[A-Za-z0-9_-]{1,128}$/;

function decode(segment: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw new Error('INVALID_JWT');
  const decoded = atob(segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - segment.length % 4) % 4));
  return Uint8Array.from(decoded, c => c.charCodeAt(0));
}
function decodeObject(segment: string) { return object(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(decode(segment)))); }

export async function authorizeOwner(request: Request, env: AdminAuthConfig, transport: typeof fetch = fetch, now = Date.now()): Promise<Authorization> {
  const ids = env.ADMIN_USER_IDS?.split(',').map(s => s.trim());
  let jwksUrl: URL;
  try {
    const issuer = new URL(env.SUPABASE_JWT_ISSUER ?? '');
    jwksUrl = new URL(env.SUPABASE_JWKS_URL ?? '');
    if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash
      || issuer.pathname !== '/auth/v1' || issuer.href !== env.SUPABASE_JWT_ISSUER
      || jwksUrl.href !== issuer.href + '/.well-known/jwks.json'
      || !ids?.length || ids.length > 20 || ids.some(id => !uuid.test(id))) throw new Error('UNCONFIGURED');
  } catch { return { status: 503, code: 'AUTH_UNCONFIGURED' }; }
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.length > 8192 || !authorization.startsWith('Bearer ')) return { status: 401, code: 'UNAUTHORIZED' };
  try {
    const parts = authorization.slice(7).split('.');
    if (parts.length !== 3) throw new Error('INVALID_JWT');
    const [encodedHeader, encodedClaims, signature] = parts;
    const header = decodeObject(encodedHeader);
    const claims = decodeObject(encodedClaims);
    if ((header.alg !== 'ES256' && header.alg !== 'RS256') || typeof header.kid !== 'string' || !safeId.test(header.kid)
      || header.crit !== undefined || header.jku !== undefined || header.x5u !== undefined
      || (header.typ !== undefined && header.typ !== 'JWT')) throw new Error('INVALID_JWT');
    const seconds = Math.floor(now / 1000);
    const audience = claims.aud === 'authenticated' || (Array.isArray(claims.aud) && claims.aud.includes('authenticated'));
    if (!audience || claims.iss !== env.SUPABASE_JWT_ISSUER || typeof claims.sub !== 'string' || !uuid.test(claims.sub)
      || !Number.isSafeInteger(claims.exp) || (claims.exp as number) <= seconds
      || (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || (claims.nbf as number) > seconds))
      || (claims.iat !== undefined && (!Number.isSafeInteger(claims.iat) || (claims.iat as number) > seconds))) throw new Error('INVALID_JWT');
    // The URL is pinned to server configuration; never follow token URLs or redirects.
    const response = await transport(jwksUrl.href, { signal: AbortSignal.timeout(3000), redirect: 'manual', headers: { Accept: 'application/json' } });
    // Workers supports manual/follow only. Reject returned redirects before reading keys.
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error('JWKS_REDIRECT_REJECTED');
    }
    if (!response.ok) throw new Error('JWKS_UNAVAILABLE');
    const keys = object(await boundedJson(response, 32_768)).keys;
    if (!Array.isArray(keys) || keys.length > 20) throw new Error('INVALID_JWKS');
    const matches = keys.map(object).filter(key => key.kid === header.kid);
    if (matches.length !== 1) throw new Error('INVALID_KEY');
    const key = matches[0];
    if ((key.alg !== undefined && key.alg !== header.alg) || (key.use !== undefined && key.use !== 'sig')
      || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'].some(field => field in key)
      || (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify')))) throw new Error('INVALID_KEY');
    const ec = header.alg === 'ES256';
    if (ec ? key.kty !== 'EC' || key.crv !== 'P-256' : key.kty !== 'RSA') throw new Error('INVALID_KEY');
    const algorithm = ec ? { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const publicKey = await crypto.subtle.importKey('jwk', key as unknown as JsonWebKey, algorithm, false, ['verify']);
    if (!await crypto.subtle.verify(algorithm, publicKey, decode(signature), new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`))) {
      throw new Error('INVALID_SIGNATURE');
    }
    if (!ids!.includes(claims.sub)) return { status: 403, code: 'FORBIDDEN' };
    return { owner: { subject: claims.sub } as VerifiedOwner };
  } catch { return { status: 401, code: 'UNAUTHORIZED' }; }
}

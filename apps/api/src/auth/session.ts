import { AuthClient, isAuthApiError, isAuthSessionMissingError } from '@supabase/auth-js';
import type { Session } from '@supabase/auth-js';
import { config, readCookie, writeCookie, clearCookie } from './cookies.ts';
import type { AuthConfig } from './cookies.ts';
export type { AuthConfig } from './cookies.ts';
export type SessionCookie = { access: string; refresh: string; expires: number; csrf: string; recovery: boolean; until: number };
export type BrowserCookie = { csrf: string; until: number };
export type FlowCookie = { purpose: 'confirm' | 'recovery'; storage: Record<string, string>; until: number };
export const sessionSeconds = 7 * 24 * 3600;
export function authHeaders() { return new Headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }); }
export function authJson(body: unknown, status = 200, headers = authHeaders()) { return Response.json(body, { status, headers }); }
export function authError(code: string, status: number, headers = authHeaders()) {
  const message = code === 'AUTH_UNCONFIGURED'
    ? 'Configure Worker SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, APP_ORIGIN, API_ORIGIN and private AUTH_COOKIE_KEY. See docs/setup/authentication.md.'
    : code === 'UNAUTHORIZED' ? 'Sign in again to continue.' : code === 'INVALID_CREDENTIALS' ? 'Email or password is incorrect.'
    : code === 'RATE_LIMITED' ? 'Please wait before trying again.' : 'Unable to complete this request. Please try again.';
  return authJson({ error: { code, message }, requestId: crypto.randomUUID() }, status, headers);
}
export function createAuth(env: AuthConfig, storage: Record<string, string> = {}, transport: typeof fetch = fetch) {
  const cfg = config(env);
  return new AuthClient({ url: cfg.provider + '/auth/v1', headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY! },
    storageKey: 'resumora-auth', flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false, persistSession: true,
    storage: { getItem: (key: string) => storage[key] ?? null, setItem: (key: string, value: string) => { storage[key] = value; }, removeItem: (key: string) => { delete storage[key]; } },
    fetch: async (input, init) => {
      const response = await transport(input, { ...init, redirect: 'manual', signal: AbortSignal.timeout(8000) });
      if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw Error('AUTH_REDIRECT_REJECTED'); }
      return response;
    },
  });
}
export async function saveSession(headers: Headers, env: AuthConfig, session: Session, recovery: boolean, csrf = crypto.randomUUID()) {
  if (!session.access_token || !session.refresh_token || !session.expires_at || !session.user?.email_confirmed_at) throw Error('UNVERIFIED_SESSION');
  const data = { access: session.access_token, refresh: session.refresh_token, expires: session.expires_at, csrf, recovery };
  await writeCookie(headers, env, 'session', data, recovery ? 600 : sessionSeconds);
  return data;
}
// One local Worker isolate shares a short-lived result to persist the same rotated pair on concurrent requests.
// No cross-isolate lock guarantee: hosted/multi-isolate deployment needs a separately reviewed coordination design.
const refreshes = new Map<string, { until: number; result: Promise<Session | null> }>();
async function refreshed(cookie: SessionCookie, env: AuthConfig, transport: typeof fetch) {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cookie.refresh))), v => v.toString(16).padStart(2, '0')).join('');
  for (const [key, entry] of refreshes) if (entry.until < Date.now()) refreshes.delete(key);
  if (refreshes.has(digest)) return refreshes.get(digest)!.result;
  if (refreshes.size > 1000) throw Error('AUTH_UNAVAILABLE');
  const result = (async () => { const auth = createAuth(env, {}, transport); const { data, error } = await auth.refreshSession({ refresh_token: cookie.refresh }); if (error) throw error; return data.session; })().catch(error => { refreshes.delete(digest); throw error; });
  refreshes.set(digest, { until: Date.now() + 10_000, result });
  return result;
}
export async function verifySession(request: Request, env: AuthConfig, headers: Headers, transport: typeof fetch = fetch) {
  let cookie = await readCookie<SessionCookie>(request, env, 'session');
  if (!cookie) { clearCookie(headers, env, 'session'); return null; }
  try {
    if (cookie.expires <= Date.now() / 1000 + 90) {
      const session = cookie.recovery ? null : await refreshed(cookie, env, transport);
      if (!session) { clearCookie(headers, env, 'session'); return null; }
      // Recovery lifetime never extends during refresh.
      cookie = { ...cookie, ...await saveSession(headers, env, session, false, cookie.csrf) };
    }
    const { data, error } = await createAuth(env, {}, transport).getUser(cookie.access);
    if (error) throw error;
    if (!data.user?.email_confirmed_at) { clearCookie(headers, env, 'session'); return null; }
    return { user: { id: data.user.id, email: data.user.email ?? '' }, accessToken: cookie.access, cookie };
  } catch (error) {
    if (!isAuthSessionMissingError(error) && (!isAuthApiError(error) || ![400, 401, 403].includes(error.status))) throw error;
    clearCookie(headers, env, 'session'); return null;
  }
}
export async function authenticateRequest(request: Request, env: AuthConfig, transport: typeof fetch = fetch) {
  const headers = authHeaders();
  try { config(env); } catch { return { response: authError('AUTH_UNCONFIGURED', 503, headers) }; }
  try {
    const verified = await verifySession(request, env, headers, transport);
    if (!verified || verified.cookie.recovery) return { response: authError('UNAUTHORIZED', 401, headers) };
    return { user: verified.user, accessToken: verified.accessToken, headers };
  } catch { return { response: authError('AUTH_UNAVAILABLE', 503, headers) }; }
}
export async function checkWrite(request: Request, env: AuthConfig, contentTypes: readonly string[] = ['application/json']) {
  if (request.headers.get('origin') !== config(env).app || !contentTypes.includes(request.headers.get('content-type')?.split(';')[0] ?? '')) return false;
  const browser = await readCookie<BrowserCookie>(request, env, 'browser');
  const session = await readCookie<SessionCookie>(request, env, 'session');
  const csrf = request.headers.get('x-csrf-token');
  return !!csrf && csrf === (session?.csrf ?? browser?.csrf);
}
export function clearAuth(headers: Headers, env: AuthConfig) { for (const kind of ['session', 'flow', 'browser']) clearCookie(headers, env, kind); }

import { boundedJson } from '../ai/http.ts';
import { config, readCookie, writeCookie, clearCookie } from './cookies.ts';
import { createAuth, authHeaders, authJson, authError, saveSession, verifySession, checkWrite, clearAuth } from './session.ts';
import type { AuthConfig, SessionCookie, BrowserCookie, FlowCookie } from './session.ts';

export const authMethods: Readonly<Record<string, string>> = {
  '/v1/auth/session': 'GET', '/v1/auth/signup': 'POST', '/v1/auth/login': 'POST', '/v1/auth/logout': 'POST',
  '/v1/auth/recovery': 'POST', '/v1/auth/password': 'POST', '/v1/auth/callback/confirm': 'GET', '/v1/auth/callback/recovery': 'GET',
};
const generic = { message: 'If an eligible account exists, check your email. Use this browser to open the link.' };
// Serializes password completion in the supported local Worker isolate, without retaining passwords.
const completions = new Set<string>();
export async function authRoute(request: Request, env: AuthConfig, transport: typeof fetch = fetch): Promise<Response> {
  const headers = authHeaders();
  const url = new URL(request.url), path = url.pathname;
  if (request.method !== authMethods[path]) { headers.set('Allow', authMethods[path]); return authError('METHOD_NOT_ALLOWED', 405, headers); }
  let cfg;
  try { cfg = config(env); } catch { return authError('AUTH_UNCONFIGURED', 503, headers); }
  try {
    if (path.includes('/callback/')) {
      const flow = await readCookie<FlowCookie>(request, env, 'flow');
      clearCookie(headers, env, 'flow');
      const purpose = path.endsWith('/recovery') ? 'recovery' : 'confirm';
      const code = url.searchParams.get('code'), flowId = url.searchParams.get('sb_flow_id');
      let success = false;
      if (flow?.purpose === purpose && code && code.length < 2048 && url.searchParams.getAll('code').length === 1 && !url.searchParams.has('error')) {
        const auth = createAuth(env, flow.storage, transport);
        let recoveryEvent = false;
        const subscription = auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') recoveryEvent = true; });
        const { data, error } = await auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
        subscription.data.subscription.unsubscribe();
        if (!error && data.session && (purpose !== 'recovery' || recoveryEvent)) {
          const verified = await auth.getUser(data.session.access_token);
          if (!verified.error && verified.data.user?.id === data.session.user.id && verified.data.user.email_confirmed_at) {
            await saveSession(headers, env, data.session, purpose === 'recovery');
            success = true;
          }
        }
      }
      headers.set('Location', cfg.app + (success ? purpose === 'recovery' ? '/reset-password' : '/' : '/?auth=link-invalid'));
      return new Response(null, { status: 303, headers });
    }
    if (path === '/v1/auth/session') {
      const verified = await verifySession(request, env, headers, transport);
      let csrf = verified?.cookie.csrf;
      if (!csrf) {
        const browser = await readCookie<BrowserCookie>(request, env, 'browser');
        csrf = browser?.csrf ?? crypto.randomUUID();
        if (!browser) await writeCookie(headers, env, 'browser', { csrf }, 3600);
      }
      return authJson({ user: verified?.user ?? null, csrfToken: csrf, recovery: verified?.cookie.recovery ?? false }, 200, headers);
    }
    if (!await checkWrite(request, env)) return authError('FORBIDDEN', 403, headers);
    let body: Record<string, unknown>;
    try {
      const value = await boundedJson(new Response(request.body), 8192);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
      body = value as Record<string, unknown>;
    } catch { return authError('INVALID_INPUT', 400, headers); }
    if (path === '/v1/auth/logout') {
      const cookie = await readCookie<SessionCookie>(request, env, 'session');
      clearAuth(headers, env);
      if (cookie) {
        // Supported Auth admin signOut calls /logout with the user's JWT, never a service role key.
        const { error } = await createAuth(env, {}, transport).admin.signOut(cookie.access, 'local');
        if (error && ![401, 403, 404].includes(error.status ?? 0)) return authError('LOGOUT_INCOMPLETE', 503, headers);
      }
      return authJson({ message: 'Signed out.' }, 200, headers);
    }
    if (path === '/v1/auth/password') {
      const verified = await verifySession(request, env, headers, transport);
      if (!verified?.cookie.recovery) return authError('UNAUTHORIZED', 401, headers);
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return authError('INVALID_INPUT', 400, headers);
      // A fresh refresh validates revocation before update, rather than trusting an issued JWT after logout.
      const lock = verified.cookie.refresh;
      if (completions.has(lock)) return authError('RECOVERY_IN_PROGRESS', 409, headers);
      completions.add(lock);
      try {
        const auth = createAuth(env, {}, transport);
        const refreshed = await auth.refreshSession({ refresh_token: lock });
        if (refreshed.error || !refreshed.data.session || refreshed.data.user?.id !== verified.user.id) {
          clearAuth(headers, env); return authError('UNAUTHORIZED', 401, headers);
        }
        const result = await auth.updateUser({ password: body.password });
        const ended = await auth.signOut({ scope: 'local' });
        clearAuth(headers, env);
        if (result.error) return authError('PASSWORD_UPDATE_FAILED', 400, headers);
        if (ended.error) return authError('LOGOUT_INCOMPLETE', 503, headers);
        return authJson({ message: 'Password updated. Sign in with your new password.' }, 200, headers);
      } finally { completions.delete(lock); }
    }
    const email = body.email;
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return authError('INVALID_INPUT', 400, headers);
    if (path !== '/v1/auth/recovery' && (typeof body.password !== 'string' || body.password.length < (path === '/v1/auth/login' ? 1 : 8) || body.password.length > 128)) return authError('INVALID_INPUT', 400, headers);
    if (path === '/v1/auth/login') {
      const auth = createAuth(env, {}, transport);
      const { data, error } = await auth.signInWithPassword({ email, password: body.password as string });
      if (error || !data.session) return authError(error?.status === 429 ? 'RATE_LIMITED' : 'INVALID_CREDENTIALS', error?.status === 429 ? 429 : 401, headers);
      const verified = await auth.getUser(data.session.access_token);
      if (verified.error || verified.data.user?.id !== data.user?.id) return authError('INVALID_CREDENTIALS', 401, headers);
      await saveSession(headers, env, data.session, false);
      clearCookie(headers, env, 'flow');
      return authJson({ user: { id: data.user!.id, email: data.user!.email } }, 200, headers);
    }
    if (await readCookie<FlowCookie>(request, env, 'flow')) return authError('FLOW_PENDING', 409, headers);
    const purpose = path === '/v1/auth/signup' ? 'confirm' : 'recovery';
    const storage: Record<string, string> = {};
    const auth = createAuth(env, storage, transport);
    const result = purpose === 'confirm'
      ? await auth.signUp({ email, password: body.password as string, options: { emailRedirectTo: cfg.api + '/v1/auth/callback/confirm' } })
      : await auth.resetPasswordForEmail(email, { redirectTo: cfg.api + '/v1/auth/callback/recovery' });
    if (result.error?.status === 429) { headers.set('Retry-After', '60'); return authError('RATE_LIMITED', 429, headers); }
    // Provider account-existence errors share the same response. Do not return provider diagnostics.
    if (result.error && (result.error.status ?? 500) >= 500) return authError('AUTH_UNAVAILABLE', 503, headers);
    // Store only SDK PKCE verifier entries; never persist an unexpected signup session.
    const flowStorage = Object.fromEntries(Object.entries(storage).filter(([key]) => key.includes('code-verifier')));
    // Match ciphertext/cookie sizes even when the SDK removes a verifier after an existing-account rejection.
    const flow = { purpose, storage: flowStorage };
    const padding = '0'.repeat(Math.max(0, 2048 - JSON.stringify(flow).length));
    await writeCookie(headers, env, 'flow', { ...flow, padding }, 3600);
    return authJson(generic, 200, headers);
  } catch {
    if (path.includes('/callback/')) {
      clearCookie(headers, env, 'flow');
      headers.set('Location', cfg.app + '/?auth=link-invalid');
      return new Response(null, { status: 303, headers });
    }
    return authError('AUTH_UNAVAILABLE', 503, headers);
  }
}

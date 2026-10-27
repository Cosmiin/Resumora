import type { ApiError, HealthResponse } from '@resumora/contracts';
import { adminRoute } from './admin/routes.ts';
import type { AdminAuthConfig } from './admin/auth.ts';
import { authRoute, authMethods } from './auth/routes.ts';
import { authenticateRequest, checkWrite, authError } from './auth/session.ts';
import type { AuthConfig } from './auth/session.ts';
import { createDatabaseGateway } from './db/supabase.ts';
import { cvRoute } from './cv/routes.ts';

// User-scoped Supabase RPCs only; no paid provider execution is mounted.
interface Env extends AdminAuthConfig, AuthConfig {
  APP_ENV: 'development';
}

const cvPaths = new Set(['/v1/base-cv', '/v1/base-cv/history', '/v1/base-cv/save', '/v1/base-cv/restore']);

function json(body: HealthResponse | ApiError, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/admin/ai' || path === '/v1/admin/ai/usage') return adminRoute(request, env);
    if (authMethods[path]) return authRoute(request, env);
    if (cvPaths.has(path)) {
      const identity = await authenticateRequest(request, env);
      if (identity.response) return identity.response;
      // The route owns method/body validation; POST is the only supported write.
      if (request.method === 'POST' && !await checkWrite(request, env))
        return authError('FORBIDDEN', 403, identity.headers);
      let response: Response;
      try {
        const gateway = createDatabaseGateway(env, identity);
        response = await cvRoute(request, gateway);
      } catch {
        response = Response.json({ error: { code: 'unavailable' } }, { status: 503 });
      }
      // Preserve refresh/clear cookies even when the route or database fails.
      const headers = new Headers(response.headers);
      for (const [name, value] of identity.headers) if (name !== 'set-cookie') headers.set(name, value);
      for (const cookie of identity.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    const requestId = crypto.randomUUID();
    const expectedMethod = path === '/v1/health' ? 'GET' : undefined;

    if (!expectedMethod) {
      return json({ error: { code: 'NOT_FOUND', message: 'Route not found.' }, requestId }, 404);
    }
    if (request.method !== expectedMethod) {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, requestId }, 405, {
        Allow: expectedMethod,
      });
    }
    if (path === '/v1/health') {
      return json({
        status: 'ok',
        service: 'resumora-api',
        environment: 'development',
        capabilities: { authentication: 'implemented_unverified', database: 'implemented_unverified' },
        requestId,
      });
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Route not found.' }, requestId }, 404);
  },
} satisfies ExportedHandler<Env>;

import type { ApiError, HealthResponse } from '@resumora/contracts';
import { adminRoute } from './admin/routes.ts';
import type { AdminAuthConfig } from './admin/auth.ts';
import { authRoute, authMethods } from './auth/routes.ts';
import type { AuthConfig } from './auth/session.ts';

// No paid provider execution or durable database binding is wired in this entrypoint.
interface Env extends AdminAuthConfig, AuthConfig {
  APP_ENV: 'development';
}


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
        capabilities: { authentication: 'implemented_unverified', database: 'not_connected' },
        requestId,
      });
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Route not found.' }, requestId }, 404);
  },
} satisfies ExportedHandler<Env>;

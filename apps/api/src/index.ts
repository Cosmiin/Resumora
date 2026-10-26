import type { ApiError, HealthResponse } from '@resumora/contracts';
import { adminRoute } from './admin/routes.ts';
import type { AdminAuthConfig } from './admin/auth.ts';

// No paid provider execution or durable database binding is wired in this entrypoint.
interface Env extends AdminAuthConfig {
  APP_ENV: 'development';
}

const authContracts: Readonly<Record<string, string>> = {
  '/v1/auth/signup': 'POST',
  '/v1/auth/login': 'POST',
  '/v1/auth/recovery': 'POST',
  '/v1/auth/callback/confirm': 'GET',
  '/v1/auth/callback/recovery': 'GET',
  '/v1/auth/password': 'POST',
  '/v1/auth/logout': 'POST',
};

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
    const requestId = crypto.randomUUID();
    const expectedMethod = path === '/v1/health' ? 'GET' : authContracts[path];

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
        capabilities: { authentication: 'not_implemented', database: 'not_connected' },
        requestId,
      });
    }
    // Deliberately do not read request bodies or callback query parameters.
    // No account is created, email sent, password changed, session set or logout performed.
    return json({
      error: { code: 'AUTH_NOT_IMPLEMENTED', message: 'Authentication is not implemented in this local foundation.' },
      requestId,
    }, 501);
  },
} satisfies ExportedHandler<Env>;

import { jobsRoute } from './jobs/routes.ts';
import { enhancementRoute, type EnhancementConfig } from './ai/routes.ts';
import { photoRoute } from './photos/routes.ts';
import type { ApiError, HealthResponse } from '@resumora/contracts';
import { adminRoute } from './admin/routes.ts';
import type { AdminAuthConfig } from './admin/auth.ts';
import { authRoute, authMethods } from './auth/routes.ts';
import { authenticateRequest, checkWrite, authError } from './auth/session.ts';
import type { AuthConfig } from './auth/session.ts';
import { createDatabaseGateway } from './db/supabase.ts';
import { cvRoute } from './cv/routes.ts';

// Supabase RPCs and Storage retain the verified user's scope; paid inference is OFF by default.
interface Env extends AdminAuthConfig, AuthConfig, EnhancementConfig {
  APP_ENV: 'development';
  PHOTO_WORKER_SECRET?: string;
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
    if (cvPaths.has(path) || path === '/v1/jobs' || path.startsWith('/v1/jobs/') || path === '/v1/enhancement' || path === '/v1/photos' || path.startsWith('/v1/photos/')) {
      const identity = await authenticateRequest(request, env);
      if (identity.response) return identity.response;
      // Route validation must not bypass the shared Origin/CSRF boundary.
      if (!['GET','HEAD','OPTIONS'].includes(request.method) && !await checkWrite(request, env, path === "/v1/photos" ? ["image/jpeg", "image/png", "image/webp"] : undefined))
        return authError('FORBIDDEN', 403, identity.headers);
      let response: Response;
      try {
        const gateway = createDatabaseGateway(env, identity);
        response = path === '/v1/enhancement' ? await enhancementRoute(request, env, gateway, identity.user.id)
          : path.startsWith('/v1/jobs') ? await jobsRoute(request, gateway) : path.startsWith('/v1/photos') ? await photoRoute(request, gateway, env.PHOTO_WORKER_SECRET, bytes => import('./photos/normalize.ts').then(module => module.normalizePhoto(bytes))) : await cvRoute(request, gateway);
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

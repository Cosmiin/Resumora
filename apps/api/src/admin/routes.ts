import { authorizeOwner } from './auth.ts';
import type { AdminAuthConfig } from './auth.ts';
import { dashboardResponse } from './dashboard.ts';
import { periodFrom } from '../ai/ledger.ts';
import type { UsageLedger } from '../ai/ledger.ts';

export async function adminRoute(request: Request, env: AdminAuthConfig, dependencies: {
  ledger?: UsageLedger;
  authTransport?: typeof fetch;
} = {}): Promise<Response> {
  const requestId = crypto.randomUUID();
  const html = new URL(request.url).pathname === '/admin/ai';
  const error = (code: string, status: number, message: string) => html
    ? dashboardResponse({ kind: status === 401 || status === 403 || code === 'AUTH_UNCONFIGURED' ? 'locked' : 'unavailable', message }, status)
    : Response.json({ error: { code, message }, requestId }, { status, headers: {
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    } });
  // Every admin entrypoint reauthorizes server-side, before filters or ledger reads.
  const authorization = await authorizeOwner(request, env, dependencies.authTransport);
  if (!authorization.owner) return error(authorization.code, authorization.status,
    authorization.code === 'AUTH_UNCONFIGURED' ? 'Autorizarea administratorului nu este configurată.' : 'Accesul necesită identitatea verificată a proprietarului.');
  if (request.method !== 'GET') {
    const response = error('METHOD_NOT_ALLOWED', 405, 'Este permisă doar citirea.');
    response.headers.set('Allow', 'GET');
    return response;
  }
  let period;
  try { period = periodFrom(new URL(request.url)); }
  catch { return error('INVALID_PERIOD', 400, 'Alege date UTC valide, în ordine, pentru cel mult 366 de zile.'); }
  if (dependencies.ledger?.durability !== 'durable') return error('LEDGER_UNCONNECTED', 503,
    'Registrul persistent de utilizare nu este conectat. Costurile reale rămân necunoscute.');
  try {
    const report = await dependencies.ledger.report(period);
    return html ? dashboardResponse({ kind: 'ready', report, synthetic: false })
      : Response.json({ requestId, connection: 'unverified', persistence: 'durable', estimateOnly: true, report }, { headers: {
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      } });
  } catch { return error('LEDGER_UNAVAILABLE', 503, 'Nu am putut citi utilizarea. Reîncearcă mai târziu.'); }
}

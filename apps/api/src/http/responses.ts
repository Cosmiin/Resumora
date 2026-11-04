export const privateJson = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
export function routeError(error: unknown) {
  const e = error as { status?: number; message?: string; code?: string };
  const status = e?.status === 403 || e?.status === 404 ? 404 : [400,409,410,413,422].includes(e?.status ?? 0) ? e.status! : e?.message === 'invalidRequest' ? 400 : 503;
  return privateJson({ error: { code: status === 404 ? 'missing' : status === 409 ? 'conflict' : status === 503 ? 'unavailable' : 'invalidRequest' } }, status);
}

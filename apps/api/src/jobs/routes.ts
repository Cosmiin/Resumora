import { parseJobSave, isUuid, type JobSave, type SavedJob, type JobSummary } from '@resumora/contracts/jobs/connected';
import { readBody } from '../cv/routes.ts';
export interface JobsGateway {
  saveJob(input: JobSave): Promise<SavedJob>;
  reviewJob(input: { requestId: string; jobId: string; title: string; company: string; requirements: unknown[] }): Promise<SavedJob>;
  listJobs(): Promise<JobSummary[]>;
  getJob(id: string): Promise<SavedJob | null>;
}
export const privateJson = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
export function routeError(error: unknown) {
  const e = error as { status?: number; message?: string; code?: string };
  const status = e?.status === 403 || e?.status === 404 ? 404 : [400,409,410,413,422].includes(e?.status ?? 0) ? e.status! : e?.message === 'invalidRequest' ? 400 : 503;
  return privateJson({ error: { code: status === 404 ? 'missing' : status === 409 ? 'conflict' : status === 503 ? 'unavailable' : 'invalidRequest' } }, status);
}
// Mounted only after session authentication and write Origin/CSRF validation.
export async function jobsRoute(request: Request, gateway: JobsGateway) {
  const path = new URL(request.url).pathname;
  const reviewing = path.endsWith('/review');
  const id = path.startsWith('/v1/jobs/') ? path.slice('/v1/jobs/'.length).replace(/\/review$/, '') : null;
  if (request.method !== 'GET' && !(request.method === 'POST' && (id === null || reviewing))) return privateJson({ error: { code: 'method' } }, 405);
  try {
    if (request.method === 'POST') {
      const body = await readBody(request); if (body instanceof Response) return body;
      if (!reviewing) return privateJson(await gateway.saveJob(parseJobSave(body)), 201);
      if (!isUuid(id) || Object.keys(body).sort().join(',') !== 'company,requestId,requirements,title') throw new Error('invalidRequest');
      const existing = await gateway.getJob(id);
      if (!existing) return privateJson({ error: { code: 'missing' } }, 404);
      const checked = parseJobSave({ requestId: body.requestId, intake: { ...existing.intake, title: body.title, company: body.company },
        snapshotId: existing.snapshotId, snapshotRevision: existing.snapshotRevision, requirements: body.requirements });
      if (!checked.intake.title || !checked.intake.company) throw new Error('invalidRequest');
      return privateJson(await gateway.reviewJob({ requestId: checked.requestId, jobId: id, title: checked.intake.title,
        company: checked.intake.company, requirements: checked.requirements }));
    }
    if (new URL(request.url).search) throw new Error('invalidRequest');
    if (id === null) return privateJson(await gateway.listJobs());
    if (!isUuid(id)) throw new Error('invalidRequest');
    const job = await gateway.getJob(id);
    return privateJson(job ?? { error: { code: 'missing' } }, job ? 200 : 404);
  } catch (error) { return routeError(error); }
}

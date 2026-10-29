import { decodeDraft } from '@resumora/contracts/editor/transport';
import { isUuid } from '@resumora/contracts/jobs/connected';
import { isJobEditorPayload, positiveRevision, projectJobEditor, type JobEditorGateway, type JobEditorVersion } from '@resumora/contracts/jobs/documents';
import { readBody } from '../cv/routes.ts';
import { privateJson, routeError } from './routes.ts';
const revision = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const exact = (r: Record<string, unknown>, expected: string[]) => Object.keys(r).sort().join(',') === expected.sort().join(',');
const projection = (row: JobEditorVersion) => {
  const { sourcePayload, ...version } = row;
  return { ...version, draft: projectJobEditor(sourcePayload, row.payload), sourceDraft: decodeDraft(sourcePayload) };
};
// The Worker mounts this route behind its existing verified-session/CSRF gate.
// Accept an immutable source reference, never a caller-supplied Base payload.
export async function jobDocumentsRoute(request: Request, gateway: JobEditorGateway & {
  loadSnapshot(id: string): Promise<import('@resumora/contracts/editor/transport').DraftSnapshot | null>;
}) {
  const url = new URL(request.url);
  const match = /^\/v1\/jobs\/([^/]+)\/cv(?:\/(context|history|save|restore|delete))?$/.exec(url.pathname);
  if (!match) return privateJson({ error: { code: 'missing' } }, 404);
  const [, jobId, action = 'load'] = match;
  if (!isUuid(jobId)) return privateJson({ error: { code: 'invalidRequest' } }, 400);
  const method = ['save','restore','delete'].includes(action) ? 'POST' : 'GET';
  if (request.method !== method) return new Response(JSON.stringify({ error: { code: 'method' } }), {
    status: 405, headers: { ...Object.fromEntries(privateJson(null).headers), Allow: method } });
  try {
    if (method === 'GET') {
      const q = url.searchParams;
      if ([...q.keys()].some(k => q.getAll(k).length !== 1)) throw new Error('invalidRequest');
      if (action === 'context') {
        if (url.search) throw new Error('invalidRequest');
        const context = await gateway.jobEditorContext(jobId);
        const source = await gateway.loadSnapshot(context.source.snapshotId);
        if (!source || source.revision !== context.source.revision) return privateJson({ error: { code: 'missing' } }, 404);
        return privateJson({ ...context, draft: decodeDraft(source.payload) });
      }
      if (action === 'history') {
        if ([...q.keys()].some(k => !['documentId','beforeRevision'].includes(k)) || !isUuid(q.get('documentId'))) throw new Error('invalidRequest');
        const cursor = q.get('beforeRevision');
        if (cursor !== null && (!/^[1-9][0-9]*$/.test(cursor) || !positiveRevision(Number(cursor)))) throw new Error('invalidRequest');
        return privateJson((await gateway.jobEditorHistory(jobId, q.get('documentId')!, {
          ...(cursor === null ? {} : { beforeRevision: Number(cursor) }), limit: 20 })).map(projection));
      }
      if ([...q.keys()].some(k => !['documentId','versionId'].includes(k)) ||
        (url.search && (!isUuid(q.get('documentId')) || !isUuid(q.get('versionId'))))) throw new Error('invalidRequest');
      const row = await gateway.loadJobEditor(jobId, q.get('documentId') ?? undefined, q.get('versionId') ?? undefined);
      return privateJson(row ? projection(row) : null);
    }
    if (url.search) throw new Error('invalidRequest');
    const body = await readBody(request); if (body instanceof Response) return body;
    if (!isUuid(body.requestId) || !revision(body.expectedRevision)) throw new Error('invalidRequest');
    if (action === 'save') {
      if (!exact(body, ['requestId','documentId','expectedRevision','payload']) ||
        !(body.documentId === null || isUuid(body.documentId)) || !isJobEditorPayload(body.payload) || body.payload.job.id !== jobId) throw new Error('invalidRequest');
      // Fetch through the authenticated source gateway; validate a renderable
      // codec roundtrip before committing. SQL independently validates refs/CAS.
      const source = await gateway.loadSnapshot(body.payload.source.snapshotId);
      if (!source || source.revision !== body.payload.source.revision) return privateJson({ error: { code: 'missing' } }, 404);
      try { projectJobEditor(source.payload, body.payload); } catch { throw new Error('invalidRequest'); }
      return privateJson(projection(await gateway.saveJobEditor(jobId, { requestId: body.requestId,
        documentId: body.documentId, expectedRevision: Number(body.expectedRevision), payload: body.payload })));
    }
    if (!isUuid(body.documentId)) throw new Error('invalidRequest');
    const input = { requestId: body.requestId, documentId: body.documentId, expectedRevision: Number(body.expectedRevision) };
    if (action === 'delete') {
      if (!exact(body, ['requestId','documentId','expectedRevision'])) throw new Error('invalidRequest');
      return privateJson(await gateway.deleteJobEditor(jobId, input));
    }
    if (!exact(body, ['requestId','documentId','expectedRevision','versionId']) || !isUuid(body.versionId)) throw new Error('invalidRequest');
    return privateJson(projection(await gateway.restoreJobEditor(jobId, { ...input, versionId: body.versionId })));
  } catch (error) {
    if ((error as { status?: number })?.status === 401) return privateJson({ error: { code: 'unauthorized' } }, 401);
    if ((error as { code?: string })?.code === 'IDEMPOTENCY_BODY_MISMATCH') return privateJson({ error: { code: 'requestMismatch' } }, 409);
    return routeError(error);
  }
}

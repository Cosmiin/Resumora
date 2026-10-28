import { decodeDraft, type DraftSnapshot } from '@resumora/contracts/editor/transport';
import { isUuid } from '@resumora/contracts/jobs/connected';
import { readBody } from '../cv/routes.ts';
import { privateJson, routeError } from '../jobs/routes.ts';
import { projectEnhancementContext } from './enhancement-context.ts';
import { prepareEnhancement } from './enhancement.ts';
import type { UsageLedger, AttemptStart, AttemptResult, Attempt } from './ledger.ts';
export interface EnhancementConfig {
  AI_PAID_INFERENCE?: string; AI_PROCESSING_POLICY?: string; AI_WORKER_SECRET?: string;
  OPENROUTER_API_KEY?: string; OPENAI_API_KEY?: string;
  OPENROUTER_MODEL?: string; OPENROUTER_ENDPOINT?: string; OPENAI_MODEL?: string;
}
export interface EnhancementGateway {
  loadSnapshot(id: string): Promise<DraftSnapshot | null>;
  reserveEnhancement(input: { operationId: string; snapshotId: string; revision: number; targetId: string; policy: string; secret: string }): Promise<{ created: boolean }>;
  beginAttempt(input: AttemptStart, secret: string): Promise<{ created: boolean; attempt: Attempt }>;
  finishAttempt(id: string, result: AttemptResult, secret: string): Promise<Attempt>;
}
const configId = (v: string | undefined) => !!v && /^[A-Za-z0-9_.:/-]{1,128}$/.test(v) && !v.includes(':') && !v.startsWith('openrouter/');
// Caller authenticates and checks CSRF before entering. Even ambient keys cannot enable OFF.
export async function enhancementRoute(request: Request, env: EnhancementConfig, gateway: EnhancementGateway, userId: string, transport: typeof fetch = fetch) {
  if (request.method !== 'POST') return privateJson({ error: { code: 'method' } }, 405);
  if (env.AI_PAID_INFERENCE !== 'on') return privateJson({ error: { code: 'enhancementDisabled', message: 'AI suggestions are configured off. Manual editing and saved answers remain available.' } }, 503);
  if (!env.OPENROUTER_API_KEY || !env.OPENAI_API_KEY || !env.AI_WORKER_SECRET || env.AI_WORKER_SECRET.length < 32 ||
    !configId(env.OPENROUTER_MODEL) || !configId(env.OPENROUTER_ENDPOINT) || !configId(env.OPENAI_MODEL) || !configId(env.AI_PROCESSING_POLICY))
    return privateJson({ error: { code: 'enhancementUnconfigured' } }, 503);
  try {
    const body = await readBody(request); if (body instanceof Response) return body;
    if (Object.keys(body).sort().join(',') !== 'operationId,snapshotId,snapshotRevision,targetId' || !isUuid(body.operationId) || !isUuid(body.snapshotId) ||
      !Number.isSafeInteger(body.snapshotRevision) || Number(body.snapshotRevision) < 1 || typeof body.targetId !== 'string' || !/^[A-Za-z0-9_.:/-]{1,128}$/.test(body.targetId)) throw new Error('invalidRequest');
    const snapshot = await gateway.loadSnapshot(body.snapshotId);
    if (!snapshot || snapshot.revision !== body.snapshotRevision) return privateJson({ error: { code: 'missing' } }, 404);
    let context;
    try { context = projectEnhancementContext(decodeDraft(snapshot.payload), body.targetId); }
    catch { return privateJson({ error: { code: 'noConfirmedContext' } }, 422); }
    const reserved = await gateway.reserveEnhancement({ operationId: body.operationId, snapshotId: snapshot.id, revision: snapshot.revision,
      targetId: body.targetId, policy: env.AI_PROCESSING_POLICY!, secret: env.AI_WORKER_SECRET });
    if (!reserved.created) return privateJson({ error: { code: 'alreadyRequested', message: 'This operation was already reserved. Its outcome may be unknown; it will not be replayed.' } }, 409);
    const ledger: UsageLedger = { durability: 'durable',
      begin: s => gateway.beginAttempt(s, env.AI_WORKER_SECRET!), finish: (id,r) => gateway.finishAttempt(id,r,env.AI_WORKER_SECRET!),
      report: async () => { throw new Error('REPORT_UNCONNECTED'); } };
    const runner = prepareEnhancement({ execution: 'configured', ledger, transport, groundedComposition: true,
      processingPolicy: env.AI_PROCESSING_POLICY, credentials: { openrouter: env.OPENROUTER_API_KEY, openai: env.OPENAI_API_KEY },
      primary: { provider: 'openrouter', model: env.OPENROUTER_MODEL!, upstreamEndpoint: env.OPENROUTER_ENDPOINT!, providerScope: 'configured-router' },
      fallback: { provider: 'openai', model: env.OPENAI_MODEL!, upstreamEndpoint: 'openai', providerScope: 'configured-direct' } });
    const result = await runner.propose({ operationId: body.operationId, userId, context, signal: request.signal });
    return privateJson({ operationId: body.operationId, snapshotId: snapshot.id, snapshotRevision: snapshot.revision,
      proposal: result.proposal, status: result.proposal ? 'proposal' : 'noProposal' });
  } catch (error) { return routeError(error); }
}

import { boundedJson } from '../ai/http.ts';

/** Worker bindings only. Never use a service-role/secret key at this boundary. */
export interface DatabaseConfig {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}
/** Obtain only from authenticateRequest; Auth owns verification and refresh. */
export interface DatabaseIdentity {
  user: { id: string; email?: string };
  accessToken: string;
}
export type EditorEnvelope = {
  schemaVersion: 'resumora-editor-draft/1';
  content: Record<string, unknown>;
  answers: unknown[];
};
export type DraftSnapshot = {
  id: string; revision: number; parentId: string | null; restoredFrom?: string;
  createdAt: string; reason: 'save' | 'autosave' | 'restore'; payload: EditorEnvelope;
};
export class DatabaseError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeCodes = new Set(['VERSION_CONFLICT', 'IDEMPOTENCY_BODY_MISMATCH',
  'REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE', 'COMMAND_IN_PROGRESS', 'RESOURCE_FORBIDDEN',
  'ACTIVE_WORKSPACE_REQUIRED', 'AUTHENTICATION_REQUIRED', 'SNAPSHOT_NOT_FOUND',
  'INVALID_COMMAND_ENVELOPE', 'INVALID_EDITOR_PAYLOAD', 'EDITOR_HISTORY_TOO_LARGE', 'EDITOR_PROFILE_CONFLICT']);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function isSnapshot(value: unknown): boolean {
  return record(value) && typeof value.id === 'string' && uuid.test(value.id)
    && Number.isSafeInteger(value.revision) && (value.revision as number) > 0
    && (value.parentId === null || (typeof value.parentId === 'string' && uuid.test(value.parentId)))
    && (value.restoredFrom === undefined || (typeof value.restoredFrom === 'string' && uuid.test(value.restoredFrom)))
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && ['save', 'autosave', 'restore'].includes(value.reason as string)
    && record(value.payload) && value.payload.schemaVersion === 'resumora-editor-draft/1'
    && record(value.payload.content) && Array.isArray(value.payload.answers);
}
function key(value: string) {
  if (!uuid.test(value)) throw new DatabaseError(400, 'INVALID_REQUEST');
  return value;
}
function revision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new DatabaseError(400, 'INVALID_REQUEST');
  return value;
}
function configuration(env: DatabaseConfig): { origin: string; apiKey: string } {
  try {
    const url = new URL(env.SUPABASE_URL ?? '');
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
    const apiKey = env.SUPABASE_PUBLISHABLE_KEY ?? '';
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(apiKey)) {
      // Legacy anon JWTs remain supported, but privileged JWT keys never are.
      const claims = JSON.parse(atob(apiKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.role !== 'anon' || apiKey.split('.').length !== 3) throw new Error();
    }
    return { origin: url.origin, apiKey };
  } catch { throw new DatabaseError(503, 'DATABASE_UNAVAILABLE'); }
}

export function createDatabaseGateway(env: DatabaseConfig, identity: DatabaseIdentity, transport: typeof fetch = fetch) {
  const { origin, apiKey } = configuration(env);
  if (!identity || !uuid.test(identity.user?.id ?? '') || !identity.accessToken
    || identity.accessToken.length > 8192 || /\s/.test(identity.accessToken)) throw new DatabaseError(401, 'UNAUTHORIZED');
  // Never decode a browser subject or replace this token with a privileged key.
  const token = identity.accessToken;
  async function rpc<T>(name: string, args: Record<string, unknown>, maxResponseBytes = 2 * 1048576): Promise<T> {
    let response: Response;
    try {
      const body = JSON.stringify(args);
      if (new TextEncoder().encode(body).length > 1048576) throw new DatabaseError(413, 'INVALID_COMMAND_ENVELOPE');
      response = await transport(`${origin}/rest/v1/rpc/${name}`, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: { apikey: apiKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
          'Content-Profile': 'app', 'Accept-Profile': 'app', Accept: 'application/json' }, body,
      });
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(503, 'DATABASE_UNAVAILABLE');
    }
    let result: unknown;
    try { result = await boundedJson(response, maxResponseBytes); }
    catch { throw new DatabaseError(503, 'DATABASE_UNAVAILABLE'); }
    if (!response.ok) {
      if (record(result) && typeof result.code === 'string' && /^PT(400|401|403|404|409|410|413|422)$/.test(result.code)) {
        throw new DatabaseError(Number(result.code.slice(2)), typeof result.message === 'string' && safeCodes.has(result.message)
          ? result.message : 'DATABASE_REQUEST_REJECTED');
      }
      if (response.status === 401 || response.status === 403) throw new DatabaseError(response.status, 'UNAUTHORIZED');
      throw new DatabaseError(503, 'DATABASE_UNAVAILABLE');
    }
    const valid = name === 'load_base_draft' ? result === null || isSnapshot(result)
      : name === 'base_draft_history' ? Array.isArray(result) && result.length <= (args.p_limit as number) && result.every(isSnapshot)
      : name === 'save_base_draft' || name === 'restore_base_draft' ? isSnapshot(result)
      : record(result);
    if (!valid) throw new DatabaseError(503, 'DATABASE_UNAVAILABLE');
    return result as T;
  }
  return {
    provisionWorkspace: (requestId: string) => rpc<{ tenantId: string; userId: string }>('provision_workspace', { request_key: key(requestId) }),
    loadDraft: () => rpc<DraftSnapshot | null>('load_base_draft', {}),
    draftHistory: (page: { beforeRevision?: number; limit?: number } = {}) => {
      const limit = page.limit ?? 20;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new DatabaseError(400, 'INVALID_REQUEST');
      return rpc<DraftSnapshot[]>('base_draft_history', { p_before_revision: page.beforeRevision === undefined ? null : revision(page.beforeRevision), p_limit: limit }, 21 * 1048576);
    },
    saveDraft: (input: { requestId: string; expectedRevision: number; mode: 'autosave' | 'checkpoint'; payload: EditorEnvelope }) => {
      if (!['autosave', 'checkpoint'].includes(input.mode)) throw new DatabaseError(400, 'INVALID_REQUEST');
      return rpc<DraftSnapshot>('save_base_draft', { p_key: key(input.requestId), p_expected_revision: revision(input.expectedRevision),
        p_payload: input.payload, p_mode: input.mode });
    },
    restoreDraft: (input: { requestId: string; expectedRevision: number; snapshotId: string }) => rpc<DraftSnapshot>('restore_base_draft', {
      p_key: key(input.requestId), p_expected_revision: revision(input.expectedRevision), p_snapshot: key(input.snapshotId),
    }),
  };
}

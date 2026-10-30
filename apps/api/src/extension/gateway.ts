import { captureExtensionId } from '@resumora/contracts/jobs/capture';
import type { AuthConfig } from '../auth/session.ts';
import { config } from '../auth/cookies.ts';
import { boundedJson } from '../ai/http.ts';
export interface CaptureConfig extends AuthConfig { CAPTURE_WORKER_SECRET?: string; CAPTURE_EXTENSION_IDS?: string }
export const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
export async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))), b => b.toString(16).padStart(2,'0')).join(''); }
export async function challenge(value: string) { const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))); return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export function extensionIds(env: CaptureConfig) {
  const ids = (env.CAPTURE_EXTENSION_IDS ?? captureExtensionId).split(',');
  if (!ids.length || ids.length>5 || ids.some(id => !/^[a-p]{32}$/.test(id)) || !env.CAPTURE_WORKER_SECRET || env.CAPTURE_WORKER_SECRET.length<32) throw Error('unconfigured');
  return ids;
}
// Fixed RPC allowlist; public publishable key, never a service role or arbitrary JWT.
export async function captureRpc(env: CaptureConfig, name: 'authorize_capture' | 'revoke_my_capture_connections' | 'revoke_capture_session' | 'capture_command' | 'claim_capture' | 'finish_capture', args: Record<string, unknown>, transport: typeof fetch = fetch, userToken?: string): Promise<unknown> {
  const cfg = config(env);
  if (!env.CAPTURE_WORKER_SECRET || env.CAPTURE_WORKER_SECRET.length<32) throw Error('unconfigured');
  const authenticated = name === 'authorize_capture' || name === 'revoke_my_capture_connections';
  if (authenticated !== !!userToken) throw Error('invalid credential class');
  const response = await transport(cfg.provider + '/rest/v1/rpc/' + name, {
    method:'POST', redirect:'manual', signal:AbortSignal.timeout(10000),
    headers:{ apikey:env.SUPABASE_PUBLISHABLE_KEY!, ...(userToken ? { Authorization:`Bearer ${userToken}` } : {}),
      'Content-Type':'application/json','Content-Profile':'app','Accept-Profile':'app' },
    body:JSON.stringify(name === 'revoke_my_capture_connections' ? args : { ...args,p_secret:env.CAPTURE_WORKER_SECRET }),
  });
  const result = await boundedJson(response,300000);
  if (!response.ok) {
    const code = (result as {code?: string})?.code;
    const status = code && /^PT(400|401|403|409|429)$/.test(code) ? Number(code.slice(2)) : 503;
    throw Object.assign(Error('capture unavailable'),{status});
  }
  return result;
}
export async function revokeSessionConnections(env: CaptureConfig, sessionCsrf: string, transport: typeof fetch) {
  // Unconfigured installations cannot issue capture connections, preserving existing login.
  if (!env.CAPTURE_WORKER_SECRET) return;
  await captureRpc(env,'revoke_capture_session',{p_session:await digest(sessionCsrf)},transport);
}

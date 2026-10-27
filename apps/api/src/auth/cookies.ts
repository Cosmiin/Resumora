export interface AuthConfig {
  APP_ENV?: string;
  APP_ORIGIN?: string;
  API_ORIGIN?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  AUTH_COOKIE_KEY?: string;
}
function publicKey(value?: string) {
  return !!value && value.length <= 4096 && /^sb_publishable_[A-Za-z0-9_-]+$/.test(value);
}
export function config(env: AuthConfig) {
  try {
    const app = new URL(env.APP_ORIGIN ?? ''), api = new URL(env.API_ORIGIN ?? ''), supabase = new URL(env.SUPABASE_URL ?? '');
    const local = env.APP_ENV === 'development' && [app, api].every(u => u.protocol === 'http:' && u.hostname === '127.0.0.1');
    if ([app, api].some(u => u.origin !== u.href.slice(0, -1) || u.username || u.password)
      || (!local && [app, api].some(u => u.protocol !== 'https:'))
      || app.origin !== api.origin // Same-origin proxy is the supported deployment boundary.
      || supabase.protocol !== 'https:' || supabase.origin !== supabase.href.slice(0, -1)
      || supabase.username || supabase.password || !publicKey(env.SUPABASE_PUBLISHABLE_KEY)
      || !env.AUTH_COOKIE_KEY || decode(env.AUTH_COOKIE_KEY).length !== 32) throw Error();
    return { app: app.origin, api: api.origin, provider: supabase.origin, key: env.AUTH_COOKIE_KEY, local };
  } catch { throw new Error('AUTH_UNCONFIGURED'); }
}
function encode(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decode(value: string) {
  if (!/^[A-Za-z0-9_+/-]+={0,2}$/.test(value)) throw Error('INVALID_COOKIE');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
}
const count = 4, chunk = 3000;
function name(kind: string, env: AuthConfig) { return `${config(env).local ? 'resumora-local-' : '__Host-resumora-'}${kind}`; }
export function clearCookie(headers: Headers, env: AuthConfig, kind: string) {
  for (let i = 0; i < count; i++) headers.append('Set-Cookie', `${name(kind, env)}.${i}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config(env).local ? '' : '; Secure'}`);
}
export async function writeCookie(headers: Headers, env: AuthConfig, kind: string, value: object, seconds: number) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', decode(config(env).key), 'AES-GCM', false, ['encrypt']);
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(name(kind, env)) }, key,
    new TextEncoder().encode(JSON.stringify({ ...value, until: Date.now() + seconds * 1000 })));
  const sealed = encode(iv) + '.' + encode(new Uint8Array(bytes));
  if (sealed.length > count * chunk) throw Error('SESSION_TOO_LARGE');
  for (let i = 0; i < count; i++) headers.append('Set-Cookie', `${name(kind, env)}.${i}=${sealed.slice(i * chunk, (i + 1) * chunk)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${i * chunk < sealed.length ? seconds : 0}${config(env).local ? '' : '; Secure'}`);
}
export async function readCookie<T extends { until: number }>(request: Request, env: AuthConfig, kind: string): Promise<T | null> {
  try {
    const cookie = request.headers.get('cookie') ?? '';
    if (cookie.length > 40_000) return null;
    const values = new Map<string, string>();
    for (const entry of cookie.split(';')) {
      const pos = entry.indexOf('=');
      const key = entry.slice(0, pos).trim();
      if (values.has(key) && key.startsWith(name(kind, env))) return null;
      values.set(key, entry.slice(pos + 1));
    }
    const sealed = Array.from({ length: count }, (_, i) => values.get(`${name(kind, env)}.${i}`) ?? '').join('');
    if (!sealed || sealed.length > count * chunk) return null;
    const [iv, ciphertext, extra] = sealed.split('.');
    if (extra) return null;
    const key = await crypto.subtle.importKey('raw', decode(config(env).key), 'AES-GCM', false, ['decrypt']);
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: new TextEncoder().encode(name(kind, env)) }, key, decode(ciphertext));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return Number.isFinite(data.until) && data.until > Date.now() ? data as T : null;
  } catch { return null; }
}

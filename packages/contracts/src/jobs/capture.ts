import { isUuid } from './connected.ts';
export const captureExtensionId = 'nijbkdlbbeepfncgdldnmppflmkjmhpj';
const captureAdapters = ['greenhouse','ashby','linkedin','bestjobs','lever','workday','smartrecruiters','icims','oracle','successfactors','workable','recruitee','bamboohr','personio','teamtailor','indeed','generic'] as const;
export const captureBytes = 262144;
export type CaptureSnapshot = {
  text: string; sourceUrl: string; title?: string; company?: string; location?: string;
  structured?: string; adapter: typeof captureAdapters[number];
  capturedAt: string; parserVersion: '1';
};
export type CaptureReceipt = { requestId: string; jobId: string; state: 'received' | 'processing' | 'ready' | 'failed'; createdAt: string };
export function parseCapture(value: unknown): { requestId: string; snapshot: CaptureSnapshot } {
  const r = value as Record<string, unknown>;
  if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).sort().join(',') !== 'requestId,snapshot' || !isUuid(r.requestId)) throw Error('invalidRequest');
  const s = r.snapshot as Record<string, unknown>;
  if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).some(k => !['text','sourceUrl','title','company','location','structured','adapter','capturedAt','parserVersion'].includes(k))) throw Error('invalidRequest');
  if (typeof s.text !== 'string' || !s.text.trim() || s.text.length > 120000 || typeof s.sourceUrl !== 'string' || s.sourceUrl.length > 2048
    || !captureAdapters.some(adapter=>adapter===s.adapter) || s.parserVersion !== '1'
    || typeof s.capturedAt !== 'string' || !Number.isFinite(Date.parse(s.capturedAt))) throw Error('invalidRequest');
  const url = new URL(s.sourceUrl);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || /[\s\\\u0000-\u001f]/u.test(s.sourceUrl)) throw Error('invalidRequest');
  for (const [key, v] of Object.entries(s)) {
    if (typeof v !== 'string' || /[\u0000\uD800-\uDFFF]/u.test(v) || (['title','company','location'].includes(key) && v.length > 2000) || (key === 'structured' && v.length > 60000)) throw Error('invalidRequest');
  }
  if (new TextEncoder().encode(JSON.stringify(r)).length > captureBytes) throw Error('invalidRequest');
  return { requestId: r.requestId, snapshot: s as CaptureSnapshot };
}

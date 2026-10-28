import { captureRpc, type CaptureConfig } from './gateway.ts';
import type { CaptureSnapshot } from '@resumora/contracts/jobs/capture';
const scalar = (v: unknown): string | null => typeof v==='string' && v.trim() ? v.slice(0,4000) : null;
/** Deterministic, unreviewed source fields only. No inference, remote fetch, AI or HTML execution. */
export function normalizeCapture(snapshot: CaptureSnapshot): Record<string, unknown> {
  let post: Record<string, unknown> = {};
  if(snapshot.structured) {
    const value: unknown = JSON.parse(snapshot.structured);
    if(value && typeof value==='object' && !Array.isArray(value)) post=value as Record<string,unknown>;
  }
  const place = (value: unknown): string | null => {
    if(!value || typeof value!=='object' || Array.isArray(value)) return null;
    const location = value as Record<string, unknown>;
    const address = location.address;
    if(typeof address==='string') return scalar(address);
    if(address && typeof address==='object' && !Array.isArray(address)) {
      const a = address as Record<string, unknown>;
      const country = a.addressCountry;
      const parts = [a.addressLocality,a.addressRegion,typeof country==='object' && country!==null ? (country as Record<string,unknown>).name : country].map(scalar).filter((v): v is string => v!==null);
      if(parts.length) return [...new Set(parts)].join(', ');
    }
    return scalar(location.name);
  };
  const locations = (Array.isArray(post.jobLocation)?post.jobLocation.slice(0,30):[post.jobLocation]).map(place).filter((v): v is string => v!==null);
  const org = post.hiringOrganization as Record<string, unknown> | undefined;
  const field = (v: unknown) => Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,30).map(x=>x.slice(0,2000)):scalar(v);
  return { reviewState:'unreviewed', title:scalar(post.title)??scalar(snapshot.title), company:scalar(org?.name)??scalar(snapshot.company),
    location:scalar(snapshot.location)??scalar([...new Set(locations)].join('; ')), remote:scalar(post.jobLocationType), skills:field(post.skills), requiredSkills:null, preferredSkills:null,
    experience:field(post.experienceRequirements), education:field(post.educationRequirements), certifications:null,
    languages:null, statedSalary:post.baseSalary && typeof post.baseSalary==='object'?JSON.stringify(post.baseSalary).slice(0,4000):scalar(post.baseSalary),
    applicationUrl:typeof post.url==='string' && /^https?:\/\//i.test(post.url) && !new URL(post.url).username && !new URL(post.url).password?post.url.slice(0,2048):null,
  };
}
export async function processCaptures(env: CaptureConfig, transport: typeof fetch = fetch) {
  if(!env.CAPTURE_WORKER_SECRET) return;
  for(let n=0;n<10;n++) {
    const work = await captureRpc(env,'claim_capture',{},transport) as {lease:string;snapshot:CaptureSnapshot}|null;
    if(!work) return;
    let metadata: Record<string,unknown>|null;
    try {metadata=normalizeCapture(work.snapshot);} catch {metadata=null;}
    await captureRpc(env,'finish_capture',{p_lease:work.lease,p_metadata:metadata},transport);
  }
}

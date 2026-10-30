/** Restricted public acquisition, not an arbitrary URL proxy. Exact vendor-owned
 * hosts prevent user-selected DNS/private-network destinations. Redirects are
 * rejected (including redirects to another allowed host); no credentials/cookies. */
export const publicJobHosts=['boards.greenhouse.io','job-boards.greenhouse.io','jobs.ashbyhq.com','jobs.lever.co','jobs.smartrecruiters.com'] as const;
export function publicJobUrl(value:unknown):URL{
 if(typeof value!=='string'||value.length>2048||/[\s\\\u0000-\u001f\u007f]/u.test(value))throw Error('URL_UNAVAILABLE');
 let u:URL;try{u=new URL(value);}catch{throw Error('URL_UNAVAILABLE');}if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!publicJobHosts.includes(u.hostname as typeof publicJobHosts[number])||u.pathname==='/'||/\/(?:login|signin|account|profile|apply)(?:\/|$)/i.test(u.pathname))throw Error('URL_UNAVAILABLE');return u;
}
export async function retrieveJobUrl(value:unknown,transport:typeof fetch=fetch):Promise<string>{
 const url=publicJobUrl(value),response=await transport(url.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'Resumora-Public-Job-Capture/1'}});
 if(response.status!==200||!/^text\/html(?:;|$)|^application\/xhtml\+xml(?:;|$)/i.test(response.headers.get('content-type')??'')||Number(response.headers.get('content-length')??0)>1048576){await response.body?.cancel();throw Error('URL_UNAVAILABLE');}
 const reader=response.body?.getReader();if(!reader)throw Error('URL_UNAVAILABLE');const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});let html='',size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576)throw Error('URL_UNAVAILABLE');html+=decoder.decode(value,{stream:true});}html+=decoder.decode();}catch{await reader.cancel();throw Error('URL_UNAVAILABLE');}
 // Only an unambiguous structured JobPosting is considered reliable without
 // executing site JS. Dynamic/auth/ambiguous pages require paste or extension.
 const postings:Record<string,unknown>[]=[];
 function visit(v:unknown,depth=0){if(depth>6||!v||typeof v!=='object')return;if(Array.isArray(v)){v.slice(0,30).forEach(x=>visit(x,depth+1));return;}const o=v as Record<string,unknown>;if(o['@type']==='JobPosting'||Array.isArray(o['@type'])&&o['@type'].includes('JobPosting'))postings.push(o);if(o['@graph'])visit(o['@graph'],depth+1);}
 const scripts=[...html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];if(scripts.length>20)throw Error('URL_UNAVAILABLE');
 for(const m of scripts){if(m[1].length>200000)throw Error('URL_UNAVAILABLE');try{visit(JSON.parse(m[1]));}catch{}}
 if(postings.length!==1||typeof postings[0].description!=='string')throw Error('URL_UNAVAILABLE');
 const description=postings[0].description;
 // Parse as inert text only. Never return markup or fetch its resources. Reject
 // interactive/private content instead of trying to retain part of a form.
 if(/<(?:script|style|form|input|textarea|select|iframe|object|template)\b/i.test(description))throw Error('URL_UNAVAILABLE');
 const text=description.replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|div|li|section|h[1-6]|ul|ol)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_m,n:string)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff&&!(v>=0xd800&&v<=0xdfff)?String.fromCodePoint(v):'';}).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[m]!)).trim();
 if(text.length<80||text.length>200000||text.includes('\u0000'))throw Error('URL_UNAVAILABLE');return text;
}

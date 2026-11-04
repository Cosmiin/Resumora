import {capturePage} from './snapshot.js';
import {createQueue} from './queue.js';
let cfg;
const ready=(async()=>{
cfg=await (await fetch(chrome.runtime.getURL('config.json'))).json();
for(const key of ['appOrigin','apiOrigin']) {
  const u=new URL(cfg[key]);if(u.origin!==cfg[key] || !(u.protocol==='https:'||(u.protocol==='http:'&&u.hostname==='127.0.0.1')))throw Error('Invalid configured origin');
}
await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
if(!await chrome.alarms.get('capture-delivery'))await chrome.alarms.create('capture-delivery',{periodInMinutes:1});
})();
const connection=async()=> (await chrome.storage.local.get('connection')).connection;
async function api(path,body,secret) {
  await ready;
  const {device}=await chrome.storage.local.get('device');
  const response=await fetch(cfg.apiOrigin+path,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-Resumora-Extension':chrome.runtime.id,'X-Resumora-Device':device,...(secret?{Authorization:'Bearer '+secret}:{})},body:JSON.stringify(body)});
  if(!response.ok)throw Object.assign(Error(response.status===401?'Connection expired or revoked. Reconnect the same account to retry.':response.status===429?'Server busy. Retry later.':'Not acknowledged. Retry or open Resumora for manual paste.'),{status:response.status});
  return response.json();
}
let renewing;
async function access(c) {
  const {token}=await chrome.storage.session.get('token');
  if(token?.generation===c.generation && token.until>Date.now()+30000)return token.value;
  if(renewing)return renewing;
  renewing=(async()=>{
  const result=await api('/v1/extension/token',{connection:c.secret});
  if((await connection())?.generation!==c.generation)throw Error('Connection changed');
  await chrome.storage.session.set({token:{value:result.accessToken,until:Date.now()+result.expiresIn*1000,generation:c.generation}});
  return result.accessToken;
  })();
  try{return await renewing;}finally{renewing=undefined;}
}
const queue=createQueue({read:async()=> (await chrome.storage.local.get('queue')).queue??[],write:rows=>chrome.storage.local.set({queue:rows}),connection,
  send:async(body,c)=>api('/v1/jobs',body,await access(c)),status:async(requestId,c)=>api('/v1/jobs/capture-status',{requestId},await access(c))});
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
let connecting=false;
async function revoke(c) {
  try {await api('/v1/extension/disconnect',{},c.secret);}
  catch(error){if(error?.status!==401)throw error;} // Already revoked/expired is disconnected.
}
async function connect() {
  if(connecting)throw Error('Connection already in progress.');connecting=true;
  try {
    let {device}=await chrome.storage.local.get('device');if(!device){device=crypto.randomUUID();await chrome.storage.local.set({device});}
    // A changed account cannot keep sending an old connection while pairing.
    const old=await connection();if(old)await revoke(old);
    await queue.changeConnection(async()=>{await chrome.storage.local.remove('connection');await chrome.storage.session.remove('token');});
    const verifier=encode(crypto.getRandomValues(new Uint8Array(32))),state=encode(crypto.getRandomValues(new Uint8Array(32)));
    const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const url=new URL(cfg.appOrigin+'/extension/connect');
    for(const [k,v] of Object.entries({extensionId:chrome.runtime.id,deviceId:device,challenge,state}))url.searchParams.set(k,v);
    await chrome.storage.session.set({pairing:{extensionId:chrome.runtime.id,deviceId:device,challenge,state,until:Date.now()+10*60*1000}});
    const callback=await chrome.identity.launchWebAuthFlow({url:url.href,interactive:true});
    if(!callback)throw Error('Connection cancelled.');
    const result=new URL(callback);
    if(result.origin!==new URL(chrome.identity.getRedirectURL()).origin||result.pathname!=='/capture'||result.searchParams.get('state')!==state||result.searchParams.getAll('code').length!==1)throw Error('Invalid connection response.');
    const paired=await api('/v1/extension/token',{code:result.searchParams.get('code'),verifier});
    const generation=crypto.randomUUID();
    await queue.changeConnection(async()=>{
      await chrome.storage.local.set({connection:{secret:paired.connection,userId:paired.userId,expiresAt:paired.expiresAt,generation}});
      await chrome.storage.session.set({token:{value:paired.accessToken,until:Date.now()+paired.expiresIn*1000,generation}});
    });
  }finally{await chrome.storage.session.remove('pairing');connecting=false;}
}
// Only the configured connection page can verify an in-progress toolbar click.
// This exposes no credentials and cannot initiate capture or another connection.
chrome.runtime.onMessageExternal.addListener((message,sender,respond)=>{
  (async()=>{
    await ready;
    const page=new URL(sender.url??'');
    if(page.origin!==cfg.appOrigin || page.pathname!=='/extension/connect' || sender.origin!==cfg.appOrigin || message?.type!=='verify-connection')return {ok:false};
    const {pairing}=await chrome.storage.session.get('pairing');
    return {ok:!!pairing && pairing.until>Date.now() && ['extensionId','deviceId','challenge','state'].every(key=>typeof message[key]==='string'&&message[key]===pairing[key])};
  })().then(respond,()=>respond({ok:false}));
  return true;
});
const capturing=new Map();
async function handle(message) {
  await ready;
  if(message.type==='connect'){await connect();return {connected:true};}
  if(message.type==='disconnect'){
    const c=await connection();if(c)await revoke(c);
    await queue.changeConnection(async()=>{await chrome.storage.local.remove('connection');await chrome.storage.session.remove('token');});return {connected:false};
  }
  if(message.type==='capture') {
    const c=await connection();if(!c)throw Error('Connect your Resumora account to capture jobs.');
    const expected={userId:c.userId,generation:c.generation};
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!/^https?:\/\//.test(tab.url??''))throw Error('Open a job posting in a normal web tab.');
    const key=c.generation+':'+tab.id;
    if(capturing.has(key))return capturing.get(key);
    const pending=(async()=>{
    const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:capturePage});
    const payload=results[0]?.result;if(!payload)throw Error('Unable to read this posting. Paste it in Resumora.');
    const requestId=await queue.enqueue(payload,expected);
    // Network delivery is driven by persisted queue and alarms, independently of this response.
    await chrome.alarms.create('capture-delivery',{when:Date.now()+100,periodInMinutes:1});
    void queue.flush().catch(()=>{}); // Opportunistic delivery; persisted queue + alarm own recovery.
    return {requestId};
    })();
    capturing.set(key,pending);
    try{return await pending;}finally{if(capturing.get(key)===pending)capturing.delete(key);}
  }
  if(message.type==='retry'){await queue.retry(message.requestId);await chrome.alarms.create('capture-delivery',{when:Date.now()+100,periodInMinutes:1});void queue.flush().catch(()=>{});}
  if(message.type==='discard')await queue.discard(message.requestId);
  const c=await connection();return {connected:!!c,account:c?.userId,rows:await queue.list(),appOrigin:cfg.appOrigin};
}
// Page/platform failures can contain arbitrary text. Only our known actionable
// messages cross back to the popup; never expose an unexpected error verbatim.
const safeErrors=new Set([
  'Connect your Resumora account to capture jobs.',
  'Open a job posting in a normal web tab.',
  'Unable to read this posting. Paste it in Resumora.',
  'Connection already in progress.', 'Connection cancelled.', 'Invalid connection response.',
  'Connection changed',
  'Connection changed during capture. Capture again with the connected account.',
  'Ten captures are waiting. Retry or discard them before capturing more.',
  'Reconnect the original account to reconcile this request.',
  'Unable to verify the saved job. Retry capture when connected; no duplicate was created.',
  'Connection expired or revoked. Reconnect the same account to retry.',
  'Server busy. Retry later.',
  'Not acknowledged. Retry or open Resumora for manual paste.',
  'Source link is too long. Use manual paste in Resumora.',
  'Posting exceeds capture limits. Select the relevant job text or paste it in Resumora; nothing was sent.',
  'Posting exceeds capture limits. Select relevant job text or paste it in Resumora; nothing was sent.',
  'Profile or account content is ambiguous. Select only the advert or paste it in Resumora; nothing was sent.',
  'Selection exceeds capture limits. Select less text or paste it in Resumora; nothing was sent.',
  'Selection includes profile or account content. Select only the advert or paste it in Resumora; nothing was sent.',
  'Multiple or ambiguous jobs are visible. Select one complete advert or paste it in Resumora; nothing was sent.',
  'No meaningful visible job text. Open the full posting, wait for it to load, or paste the advert in Resumora. Embedded cross-origin frames require opening the original job page.',
  'Posting is too large. Paste the relevant job section in Resumora.',
]);
const visibleError=error=>safeErrors.has(error?.message)?error.message:'Unable to capture or complete this action. Open the full posting and try again, or paste it in Resumora. Existing queued captures remain available.';
// Only packaged extension UI may request capture; content pages have no message entry.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('popup.html')))return;
  handle(message).then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:visibleError(error)}));return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='capture-delivery')return ready.then(()=>queue.flush());});
chrome.runtime.onStartup.addListener(()=>chrome.alarms.create('capture-delivery',{when:Date.now()+1000,periodInMinutes:1}));
chrome.runtime.onInstalled.addListener(()=>chrome.alarms.create('capture-delivery',{when:Date.now()+1000,periodInMinutes:1}));

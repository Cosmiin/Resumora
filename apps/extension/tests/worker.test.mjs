import test from 'node:test';
import assert from 'node:assert/strict';
test('actual worker handlers pair, persist capture after UI message, revoke, and reconnect after server revocation',async()=>{
  const local={},session={},listeners={},network=[];
  const storage=object=>({get:async key=>({[key]:structuredClone(object[key])}),set:async value=>Object.assign(object,structuredClone(value)),remove:async key=>{delete object[key];},setAccessLevel:async options=>assert.equal(options.accessLevel,'TRUSTED_CONTEXTS')});
  const ext='a'.repeat(32),owner='11111111-1111-4111-8111-111111111111';let revoked=false,exchanges=0,pairedOwner=owner;
  const chrome={runtime:{id:ext,getURL:path=>'chrome-extension://'+ext+'/'+path,onMessage:{addListener:fn=>listeners.message=fn},onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}}},storage:{local:storage(local),session:storage(session)},identity:{getRedirectURL:()=>`https://${ext}.chromiumapp.org/`,launchWebAuthFlow:async({url})=>{const parsed=new URL(url);assert.equal(parsed.origin,'http://127.0.0.1:5173');assert.equal(parsed.searchParams.get('challenge').length,43);return `https://${ext}.chromiumapp.org/capture?code=${'c'.repeat(64)}&state=${parsed.searchParams.get('state')}`;}},tabs:{query:async()=>[{id:1,url:'https://example.invalid/job'}]},scripting:{executeScript:async()=>[{result:{text:'Synthetic job snapshot',sourceUrl:'https://example.invalid/job',adapter:'generic',parserVersion:'1',capturedAt:'2026-10-28T00:00:00Z'}}]},alarms:{create:async()=>{},onAlarm:{addListener:fn=>listeners.alarm=fn}}};
  chrome.alarms.get=async()=>undefined;
  const previousChrome=globalThis.chrome,previousFetch=globalThis.fetch;globalThis.chrome=chrome;
  globalThis.fetch=async(url,init)=>{
    if(String(url).startsWith('chrome-extension:'))return Response.json({appOrigin:'http://127.0.0.1:5173',apiOrigin:'http://127.0.0.1:5173'});
    network.push({url,init});assert.equal(new URL(url).origin,'http://127.0.0.1:5173');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
    const body=JSON.parse(init.body);
    if(url.endsWith('/token')){exchanges++;return Response.json({userId:pairedOwner,connection:'d'.repeat(64),accessToken:'e'.repeat(64),expiresIn:600,expiresAt:'2026-11-01T00:00:00Z'});}
    if(url.endsWith('/disconnect'))return revoked?Response.json({}, {status:401}):Response.json({revoked:true});
    if(url.endsWith('/v1/jobs'))return Response.json({requestId:body.requestId,jobId:owner,state:'received',createdAt:'2026-10-28T00:00:00Z'},{status:202});
    if(url.endsWith('/capture-status'))return Response.json({requestId:body.requestId,jobId:owner,state:'processing'});
    throw Error('unexpected URL');
  };
  try{
    await import('../src/worker.js');
    const send=message=>new Promise(resolve=>listeners.message(message,{id:ext,url:`chrome-extension://${ext}/popup.html`},resolve));
    assert.equal((await send({type:'connect'})).ok,true);assert.equal(local.connection.userId,owner);assert.match(local.connection.secret,/^[a-f0-9]{64}$/);
    const queued=await send({type:'capture'});assert.ok(queued.requestId);assert.ok(local.queue.some(row=>row.requestId===queued.requestId));
    // Popup is gone; alarm/runtime processing still uses persisted queue.
    await listeners.alarm({name:'capture-delivery'});
    for(let i=0;i<20&&!local.queue[0].receipt;i++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(local.queue[0].receipt.state,'received');assert.equal(local.queue[0].payload,undefined);
    for(const [port,method,nextOwner] of [[chrome.scripting,'executeScript','22222222-2222-4222-8222-222222222222'],[chrome.tabs,'query','22222222-2222-4222-8222-222222222222'],[chrome.scripting,'executeScript',owner]]) {
      pairedOwner=owner;assert.equal((await send({type:'connect'})).ok,true);
      const previousGeneration=local.connection.generation;
      const original=port[method];let started,release;
      const waiting=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
      port[method]=async(...args)=>{started();await gate;return original(...args);};
      const pending=send({type:'capture'});await waiting;
      const before=structuredClone(local.queue),deliveries=network.filter(row=>row.url.endsWith('/v1/jobs')).length;
      assert.equal((await send({type:'disconnect'})).ok,true);
      pairedOwner=nextOwner;assert.equal((await send({type:'connect'})).ok,true);
      assert.notEqual(local.connection.generation,previousGeneration);
      release();assert.equal((await pending).ok,false);port[method]=original;
      await listeners.alarm({name:'capture-delivery'});
      assert.deepEqual(local.queue.map(row=>({requestId:row.requestId,owner:row.owner,generation:row.generation})),before.map(row=>({requestId:row.requestId,owner:row.owner,generation:row.generation})));assert.equal(network.filter(row=>row.url.endsWith('/v1/jobs')).length,deliveries);
      assert.equal(local.connection.userId,nextOwner);
      const fresh=await send({type:'capture'});assert.equal(fresh.ok,true);
      const freshRow=local.queue.find(row=>row.requestId===fresh.requestId);assert.equal(freshRow.owner,nextOwner);assert.equal(freshRow.generation,local.connection.generation);
      await listeners.alarm({name:'capture-delivery'});
      for(let n=0;n<20&&!local.queue.find(row=>row.requestId===fresh.requestId).receipt;n++)await new Promise(resolve=>setImmediate(resolve));
      assert.equal(local.queue.find(row=>row.requestId===fresh.requestId).receipt.state,'received');
    }
    const beforeReconnect=exchanges;
    revoked=true;assert.equal((await send({type:'connect'})).ok,true);assert.equal(exchanges,beforeReconnect+1);assert.equal((await send({type:'disconnect'})).ok,true);assert.equal(local.connection,undefined);
    let touched=false;listeners.message({type:'capture'},{id:ext,url:'https://evil.invalid/'},()=>touched=true);assert.equal(touched,false);
  } finally{globalThis.chrome=previousChrome;globalThis.fetch=previousFetch;}
});

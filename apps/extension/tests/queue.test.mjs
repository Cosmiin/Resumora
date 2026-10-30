import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueue} from '../src/queue.js';
const identity={userId:'A',generation:'one'};
const snapshot={text:'A synthetic job',sourceUrl:'https://example.invalid/job',parserVersion:'1'};
const receipt=(body,state='received')=>({requestId:body.requestId,jobId:'job-'+body.requestId,state,createdAt:'2026-10-28T00:00:00Z'});
function setup(send){
  let disk=[],c={userId:'A',generation:'one'},clock=0,counter=0;
  const port={read:async()=>structuredClone(disk),write:async rows=>{disk=structuredClone(rows);},connection:async()=>c,now:()=>clock,id:()=>String(++counter),send,status:async requestId=>receipt({requestId},'processing')};
  return {queue:createQueue(port),restart:()=>createQueue(port),set account(v){c=v;},tick:()=>clock+=300001,get disk(){return disk;}};
}
test('A accepted then popup close/worker restart/navigation and B while A processes retain independent durable receipts',async()=>{
  const saved=new Map();
  const f=setup(async body=>{if(!saved.has(body.requestId))saved.set(body.requestId,receipt(body));return saved.get(body.requestId);});
  const a=await f.queue.enqueue(snapshot,identity);await f.queue.flush();
  assert.equal(f.disk[0].receipt.state,'received');assert.equal(f.disk[0].payload,undefined);
  const afterPopupClose=f.restart();
  const b=await afterPopupClose.enqueue({...snapshot,text:'B synthetic job'},identity);await afterPopupClose.flush();
  assert.notEqual(a,b);assert.equal(saved.size,2);assert.equal((await afterPopupClose.list()).find(x=>x.requestId===a).receipt.jobId,'job-'+a);
  assert.equal((await afterPopupClose.list()).find(x=>x.requestId===b).receipt.jobId,'job-'+b);
});
test('slow A transport does not block enqueue or B transport; late A cannot replace B result',async()=>{
  let release,started;const waiting=new Promise(r=>started=r);
  const f=setup(async body=>{if(body.snapshot.text==='A synthetic job'){started();await new Promise(r=>release=r);}return receipt(body);});
  const a=await f.queue.enqueue(snapshot,identity),sending=f.queue.flush();await waiting;
  const b=await f.queue.enqueue({...snapshot,text:'B'},identity);await f.queue.flush();
  assert.equal(f.disk.find(x=>x.requestId===b).receipt.jobId,'job-'+b);release();await sending;
  assert.equal(f.disk.find(x=>x.requestId===a).receipt.jobId,'job-'+a);assert.equal(f.disk.length,2);
});
test('ambiguous response retries same immutable ID across restart; new intent uses a different ID',async()=>{
  let first=true;const saved=new Map();
  const f=setup(async body=>{saved.set(body.requestId,receipt(body));if(first){first=false;throw Error('timeout');}return saved.get(body.requestId);});
  const id=await f.queue.enqueue(snapshot,identity);await f.queue.flush();assert.equal(f.disk[0].state,'queued');assert.ok(f.disk[0].payload);
  f.tick();await f.restart().flush();assert.equal(saved.size,1);assert.equal(f.disk[0].receipt.requestId,id);
  const next=await f.queue.enqueue(snapshot,identity);assert.notEqual(next,id);await f.queue.flush();assert.equal(saved.size,2);
});
test('account switch/revocation never reassigns queued content; original account requires explicit retry',async()=>{
  const sent=[];const f=setup(async body=>{sent.push(body);return receipt(body);});
  const id=await f.queue.enqueue(snapshot,identity);f.account={userId:'B',generation:'two'};await f.restart().flush();assert.equal(sent.length,0);
  await assert.rejects(f.queue.retry(id),/original account/);f.account={userId:'A',generation:'three'};await f.queue.flush();assert.equal(sent.length,0);
  await f.queue.retry(id);await f.queue.flush();assert.equal(sent.length,1);
});
test('three bounded attempts, backpressure, discard and TTL; no false saved state',async()=>{
  let calls=0;const f=setup(async()=>{calls++;throw Error('offline');});
  const id=await f.queue.enqueue(snapshot,identity);for(let i=0;i<5;i++){await f.queue.flush();f.tick();}assert.equal(calls,3);assert.equal(f.disk[0].receipt,undefined);
  for(let i=0;i<9;i++)await f.queue.enqueue(snapshot,identity);await assert.rejects(f.queue.enqueue(snapshot,identity),/Ten captures/);
  await f.queue.discard(id);assert.equal(f.disk.length,9);
  for(let i=0;i<300;i++)f.tick();assert.equal((await f.restart().list()).length,0);
});
test('third-attempt acknowledgement continues receipt polling after worker restart',async()=>{
  let deliveries=0;
  const f=setup(async body=>{
    if(++deliveries<3)throw Error('offline');
    return receipt(body);
  });
  const id=await f.queue.enqueue(snapshot,identity);
  for(let i=0;i<3;i++){await f.queue.flush();f.tick();}
  assert.equal(deliveries,3);assert.equal(f.disk[0].attempts,3);assert.equal(f.disk[0].payload,undefined);
  await f.restart().flush();
  const row=(await f.queue.list()).find(row=>row.requestId===id);
  assert.equal(row.state,'processing');assert.equal(row.receipt.state,'processing');assert.equal(deliveries,3);
});
test('accepted third-attempt receipts reach either terminal state without redelivery',async()=>{
  for(const terminal of ['ready','failed']) {
    let disk=[],clock=0,deliveries=0,polls=0;
    const port={read:async()=>structuredClone(disk),write:async value=>{disk=structuredClone(value);},now:()=>clock,connection:async()=>({userId:'A',generation:'one'}),
      send:async body=>{if(++deliveries<3)throw Error('offline');return receipt(body,'processing');},
      status:async requestId=>{polls++;return receipt({requestId},terminal);}};
    const q=createQueue(port);await q.enqueue(snapshot,identity);
    for(let n=0;n<3;n++){await q.flush();clock+=300001;}
    await createQueue(port).flush();clock+=60001;await createQueue(port).flush();
    assert.equal(disk[0].state,terminal);assert.equal(disk[0].receipt.state,terminal);assert.equal(deliveries,3);assert.equal(polls,1);
  }
});

test('enqueue requires the identity pinned before extraction and rejects owner or generation changes',async()=>{
  const f=setup(async body=>receipt(body));
  await assert.rejects(f.queue.enqueue(snapshot),/Connection changed/);
  for(const next of [null,{userId:'B',generation:'one'},{userId:'A',generation:'two'}]) {
    f.account=next;
    await assert.rejects(f.queue.enqueue(snapshot,identity),/Connection changed/);
    assert.equal(f.disk.length,0);
  }
});
test('enqueue checks the pinned identity inside its storage transaction after pending reads',async()=>{
  let c=identity,disk=[],started,release;
  const waiting=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  const q=createQueue({read:async()=>{started();await gate;return structuredClone(disk);},write:async rows=>{disk=structuredClone(rows);},connection:async()=>c,send:async()=>assert.fail('stale capture must not send'),status:async()=>null});
  const pending=q.enqueue(snapshot,identity);await waiting;
  c={userId:'B',generation:'two'};release();
  await assert.rejects(pending,/Connection changed/);assert.equal(disk.length,0);
});

test('connection replacement and enqueue commit use the same transaction lock',async()=>{
  let c=identity,disk=[],started,release,changed=false;
  const waiting=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  const q=createQueue({read:async()=>structuredClone(disk),write:async rows=>{started();await gate;disk=structuredClone(rows);},connection:async()=>c,send:async()=>null,status:async()=>null});
  const pending=q.enqueue(snapshot,identity);await waiting;
  const replacement=q.changeConnection(async()=>{c={userId:'B',generation:'two'};changed=true;});
  await Promise.resolve();assert.equal(changed,false);
  release();await pending;await replacement;
  assert.equal(disk.length,1);assert.equal(disk[0].owner,'A');assert.equal(disk[0].generation,'one');
  await assert.rejects(q.enqueue(snapshot,identity),/Connection changed/);
  assert.equal(disk.length,1);
});

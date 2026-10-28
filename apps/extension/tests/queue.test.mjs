import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueue} from '../src/queue.js';
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
  const a=await f.queue.enqueue(snapshot);await f.queue.flush();
  assert.equal(f.disk[0].receipt.state,'received');assert.equal(f.disk[0].payload,undefined);
  const afterPopupClose=f.restart();
  const b=await afterPopupClose.enqueue({...snapshot,text:'B synthetic job'});await afterPopupClose.flush();
  assert.notEqual(a,b);assert.equal(saved.size,2);assert.equal((await afterPopupClose.list()).find(x=>x.requestId===a).receipt.jobId,'job-'+a);
  assert.equal((await afterPopupClose.list()).find(x=>x.requestId===b).receipt.jobId,'job-'+b);
});
test('slow A transport does not block enqueue or B transport; late A cannot replace B result',async()=>{
  let release,started;const waiting=new Promise(r=>started=r);
  const f=setup(async body=>{if(body.snapshot.text==='A synthetic job'){started();await new Promise(r=>release=r);}return receipt(body);});
  const a=await f.queue.enqueue(snapshot),sending=f.queue.flush();await waiting;
  const b=await f.queue.enqueue({...snapshot,text:'B'});await f.queue.flush();
  assert.equal(f.disk.find(x=>x.requestId===b).receipt.jobId,'job-'+b);release();await sending;
  assert.equal(f.disk.find(x=>x.requestId===a).receipt.jobId,'job-'+a);assert.equal(f.disk.length,2);
});
test('ambiguous response retries same immutable ID across restart; new intent uses a different ID',async()=>{
  let first=true;const saved=new Map();
  const f=setup(async body=>{saved.set(body.requestId,receipt(body));if(first){first=false;throw Error('timeout');}return saved.get(body.requestId);});
  const id=await f.queue.enqueue(snapshot);await f.queue.flush();assert.equal(f.disk[0].state,'queued');assert.ok(f.disk[0].payload);
  f.tick();await f.restart().flush();assert.equal(saved.size,1);assert.equal(f.disk[0].receipt.requestId,id);
  const next=await f.queue.enqueue(snapshot);assert.notEqual(next,id);await f.queue.flush();assert.equal(saved.size,2);
});
test('account switch/revocation never reassigns queued content; original account requires explicit retry',async()=>{
  const sent=[];const f=setup(async body=>{sent.push(body);return receipt(body);});
  const id=await f.queue.enqueue(snapshot);f.account={userId:'B',generation:'two'};await f.restart().flush();assert.equal(sent.length,0);
  await assert.rejects(f.queue.retry(id),/original account/);f.account={userId:'A',generation:'three'};await f.queue.flush();assert.equal(sent.length,0);
  await f.queue.retry(id);await f.queue.flush();assert.equal(sent.length,1);
});
test('three bounded attempts, backpressure, discard and TTL; no false saved state',async()=>{
  let calls=0;const f=setup(async()=>{calls++;throw Error('offline');});
  const id=await f.queue.enqueue(snapshot);for(let i=0;i<5;i++){await f.queue.flush();f.tick();}assert.equal(calls,3);assert.equal(f.disk[0].receipt,undefined);
  for(let i=0;i<9;i++)await f.queue.enqueue(snapshot);await assert.rejects(f.queue.enqueue(snapshot),/Ten captures/);
  await f.queue.discard(id);assert.equal(f.disk.length,9);
  for(let i=0;i<300;i++)f.tick();assert.equal((await f.restart().list()).length,0);
});

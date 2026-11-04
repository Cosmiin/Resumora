import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {diagnose, importWorkerPids} from './dev-doctor.mjs';
function fixture(t) {
 const workspace=mkdtempSync(path.join(tmpdir(),'resumora-doctor-'));
 t.after(()=>rmSync(workspace,{recursive:true,force:true}));
 mkdirSync(path.join(workspace,'apps/api'),{recursive:true});
 mkdirSync(path.join(workspace,'.config/systemd/user'),{recursive:true});
 writeFileSync(path.join(workspace,'.nvmrc'),'22.23.4\n');
 writeFileSync(path.join(workspace,'apps/api/.dev.vars'),'APP_ORIGIN=http://127.0.0.1:15173\nAI_PAID_INFERENCE=off\nOPENAI_API_KEY=private-test-secret\nSUPABASE_URL=https://synthetic.supabase.co\n',{mode:0o600});
 writeFileSync(path.join(workspace,'.config/systemd/user/resumora-dev.service'),`# Workspace: ${workspace}\n`);
 return {workspace,home:workspace,version:'22.23.4',checkService:()=> 'active',checkSession:async origin=>origin==='http://127.0.0.1:15173',findWorkers:()=>[]};
}
test('doctor separates local app and hosted dependencies without revealing credentials',async t=>{
 const options=fixture(t);const result=await diagnose(options);
 assert.equal(result.ok,true);
 assert.match(result.text,/local development on Linux\/WSL/);
 assert.match(result.text,/hosted Supabase/);
 assert.match(result.text,/CV import worker: disabled with AI/);
 assert.doesNotMatch(result.text,/private-test-secret/);
});
test('doctor detects wrong Node, wrong checkout, and an unreachable session',async t=>{
 const options=fixture(t);
 writeFileSync(path.join(options.home,'.config/systemd/user/resumora-dev.service'),'# Workspace: /other\n');
 const result=await diagnose({...options,version:'18.0.0',checkSession:async()=>false});
 assert.equal(result.ok,false);
 assert.match(result.text,/nvm use/);
 assert.match(result.text,/not installed for this checkout/);
 assert.match(result.text,/not ready/);
});
test('worker discovery matches the exact checkout script, never logs process arguments',t=>{
 const {workspace}=fixture(t);
 const proc=path.join(workspace,'proc');mkdirSync(proc);
 for(const [pid,script] of [['12',path.join(workspace,'scripts/import-worker.mjs')],['13','/other/scripts/import-worker.mjs']]){
  mkdirSync(path.join(proc,pid));writeFileSync(path.join(proc,pid,'cmdline'),`node\0${script}\0--watch\0private-arg\0`);
 }
 assert.deepEqual(importWorkerPids(workspace,proc),['12']);
});
test('doctor flags a still-running worker after configuration disables AI',async t=>{
 const options=fixture(t);
 for(const pids of [['12'],['12','13']]) {
  const result=await diagnose({...options,findWorkers:()=>pids});
  assert.equal(result.ok,false);
  assert.match(result.text,/still running despite AI being disabled/);
  assert.match(result.text,/dev:start/);
 }
});
test('doctor requires one configured job worker even when paid imports are off',async t=>{
 const options=fixture(t);
 writeFileSync(path.join(options.workspace,'apps/api/.dev.vars'),'APP_ORIGIN=http://127.0.0.1:15173\nAI_PAID_INFERENCE=off\nSUPABASE_URL=https://synthetic.supabase.co\nSUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic\nCAPTURE_WORKER_SECRET='+ 'c'.repeat(32)+'\n',{mode:0o600});
 for(const pids of [[],['21'],['21','22']]){
  const result=await diagnose({...options,findJobWorkers:()=>pids});
  assert.equal(result.ok,pids.length===1);
  assert.match(result.text,/Job capture\/workflow worker:/);
  if(pids.length===1)assert.match(result.text,/Job capture\/workflow worker: running \(one process\)/);
 }
});

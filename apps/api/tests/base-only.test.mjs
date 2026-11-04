import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';

test('removed routes cannot call a database or provider', async () => {
 const original=globalThis.fetch; let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('retired route made an outbound request')};
 try {
  for(const path of ['/v1/jobs','/v1/jobs/url','/v1/jobs/capture-status','/v1/jobs/11111111-1111-4111-8111-111111111111/workflow','/v1/jobs/11111111-1111-4111-8111-111111111111/cv','/v1/jobs/intakes/11111111-1111-4111-8111-111111111111/submit','/v1/extension/authorize']){
   for(const method of ['GET','POST','OPTIONS']){
    const response=await worker.fetch(new Request('http://localhost'+path,{method,headers:{Authorization:'Bearer retired',Origin:'chrome-extension://retired'}}),{APP_ENV:'development'});
    assert.equal(response.status,404,path+' '+method);
    assert.equal((await response.json()).error.code,'NOT_FOUND');
   }
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { startDevServers } from './dev-processes.mjs';
test('one launcher manages imports and jobs separately and restricts capture credentials to jobs', () => {
 const calls=[];
 const runtime=startDevServers({webPort:15173,imports:true,jobs:true,configuration:{OPENAI_API_KEY:'synthetic-secret',AI_PAID_INFERENCE:'on',AUTH_COOKIE_KEY:'not-for-workers',CAPTURE_WORKER_SECRET:'synthetic-capture'},spawnProcess:(...args)=>{calls.push(args);return {};}});
 assert.deepEqual(runtime.children.map(c=>c.name),['api','web','imports','jobs']);
 assert.equal(calls[1][2].env.APP_ORIGIN,'http://127.0.0.1:15173');
 assert.equal(calls[1][2].env.API_ORIGIN,calls[1][2].env.APP_ORIGIN);
 assert.equal(calls[0][2].env.OPENAI_API_KEY,undefined);
 assert.equal(calls[1][2].env.OPENAI_API_KEY,undefined);
 assert.equal(calls[2][2].env.OPENAI_API_KEY,'synthetic-secret');
 assert.equal(calls[2][2].env.AUTH_COOKIE_KEY,undefined);
 assert.equal(calls[2][2].env.CAPTURE_WORKER_SECRET,undefined);
 assert.equal(calls[3][2].env.CAPTURE_WORKER_SECRET,'synthetic-capture');
 assert.equal(calls[3][2].env.AUTH_COOKIE_KEY,undefined);
 assert.equal(calls[2][1][0],'--experimental-strip-types');
 assert.equal(calls[2][1].at(-1),'--watch');
 assert.ok(calls.every(c=>!c[1].join(' ').includes('synthetic-secret')));
 runtime.stop();runtime.stop();
});
test('job processing remains managed when paid imports are disabled', () => {
 const runtime=startDevServers({jobs:true,imports:false,spawnProcess:()=>({})});
 assert.deepEqual(runtime.children.map(c=>c.name),['api','web','jobs']);
 runtime.stop();
});
test('smoke/test launch does not implicitly activate a paid import worker', () => {
 const runtime=startDevServers({spawnProcess:()=>({})});
 assert.deepEqual(runtime.children.map(c=>c.name),['api','web']);
 runtime.stop();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { jobsRoute } from '../src/jobs/routes.ts';
import { createDatabaseGateway } from '../src/db/supabase.ts';
const jobId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const request=(body={requestId},method='POST',suffix='')=>new Request(`https://resumora.invalid/v1/jobs/${jobId}/delete${suffix}`,{method,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
test('job deletion invokes the owned command directly so an acknowledged request can replay after deletion',async()=>{
 const calls=[],gateway={deleteJob:async(input)=>{calls.push(input);return {jobId,deleted:true};},getJob:async()=>{throw Error('Deleted jobs cannot be loaded');}};
 for(let n=0;n<2;n++)assert.deepEqual(await (await jobsRoute(request(),gateway)).json(),{jobId,deleted:true});
 assert.deepEqual(calls,[{requestId,jobId},{requestId,jobId}]);
});
test('delete rejects caller ownership, malformed identities, queries and unexpected methods before dispatch',async()=>{
 let calls=0;const gateway={deleteJob:async()=>{calls++;return {jobId,deleted:true};}};
 for(const body of [{},{requestId:'invalid'},{requestId,tenantId:jobId},{requestId,confirmed:false}])assert.equal((await jobsRoute(request(body),gateway)).status,400);
 assert.equal((await jobsRoute(request({requestId},'POST','?other=1'),gateway)).status,400);
 assert.equal((await jobsRoute(request(undefined,'GET'),gateway)).status,405);
 assert.equal(calls,0);
});
test('foreign and missing jobs share a missing response; failures never acknowledge deletion',async()=>{
 for(const status of [403,404,503]){
  const response=await jobsRoute(request(),{deleteJob:async()=>{throw Object.assign(Error('refused'),{status});}});
  assert.equal(response.status,status===403?404:status);
  assert.equal((await response.json()).deleted,undefined);
 }
});
test('database deletion maps only the request and job identifiers and validates its receipt',async()=>{
 const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'};
 const identity={user:{id:jobId},accessToken:'synthetic-user-token'},calls=[];
 const gateway=createDatabaseGateway(env,identity,async(url,init)=>{calls.push({url,body:JSON.parse(init.body),authorization:init.headers.Authorization});return Response.json({jobId,deleted:true});});
 assert.deepEqual(await gateway.deleteJob({requestId,jobId}),{jobId,deleted:true});
 assert.deepEqual(calls,[{url:env.SUPABASE_URL+'/rest/v1/rpc/delete_target_job',body:{p_key:requestId,p_job:jobId},authorization:'Bearer synthetic-user-token'}]);
 for(const receipt of [{jobId:requestId,deleted:true},{jobId,deleted:false},{}]){
  const invalid=createDatabaseGateway(env,identity,async()=>Response.json(receipt));
  await assert.rejects(()=>invalid.deleteJob({requestId,jobId}));
 }
 const canonical='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const uppercase=createDatabaseGateway(env,identity,async(_url,init)=>{
  assert.equal(JSON.parse(init.body).p_job,canonical);
  return Response.json({jobId:canonical,deleted:true});
 });
 assert.deepEqual(await uppercase.deleteJob({requestId,jobId:canonical.toUpperCase()}),{jobId:canonical,deleted:true});
});

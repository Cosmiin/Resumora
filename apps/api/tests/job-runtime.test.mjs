import test from 'node:test';
import assert from 'node:assert/strict';

const configuration={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',CAPTURE_WORKER_SECRET:'c'.repeat(32),AI_WORKER_SECRET:'w'.repeat(32),AI_PAID_INFERENCE:'off'};
const source='Maintain SQL reporting workflows and integration services for our customers. Work with a multidisciplinary team to build accurate reports.';
test('managed job loop retries capture failures while fetching durable URL jobs with paid AI off',async()=>{
 const {runJobWorker}=await import('../../../scripts/job-worker.mjs');
 const controller=new AbortController(),errors=[],finished=[];let captureClaims=0,jobClaims=0;
 const transport=async(url,init)=>{
  if(url==='https://jobs.lever.co/example/one')return new Response('<script type="application/ld+json">'+JSON.stringify({'@type':'JobPosting',description:source})+'</script>',{headers:{'content-type':'text/html'}});
  assert.ok(String(url).startsWith(configuration.SUPABASE_URL+'/rest/v1/rpc/'),'only queue RPCs and the allowed public URL may be fetched');
  const body=JSON.parse(init.body);
  if(url.endsWith('/claim_capture')){
   captureClaims++;if(captureClaims===1)throw Error('synthetic-temporary-outage');
   return Response.json({lease:'capture-lease',snapshot:{text:source,title:'Data analyst'}});
  }
  if(url.endsWith('/finish_capture')){finished.push(body);controller.abort();return Response.json({state:'ready'});}
  if(url.endsWith('/claim_job_workflow')){
   jobClaims++;assert.equal(body.p_fetch_only,true);
   return Response.json({operation:{kind:'fetch'},sourceUrl:'https://jobs.lever.co/example/one',lease:'job-lease'});
  }
  if(url.endsWith('/finish_job_workflow')){finished.push(body);return Response.json({state:'ready'});}
  throw Error('unexpected queue operation');
 };
 await runJobWorker(configuration,{watch:true,signal:controller.signal,transport,pollMs:0,onError:kind=>errors.push(kind)});
 assert.deepEqual(errors,['captures']);assert.equal(jobClaims,1);assert.equal(captureClaims,2);
 assert.equal(finished[0].p_result.text,source);assert.equal(finished[0].p_error,null);
 assert.equal(finished[1].p_metadata.title,'Data analyst');assert.equal(finished[1].p_lease,'capture-lease');
});
test('shutdown settles the active job and does not claim another operation',async()=>{
 const {runJobWorker}=await import('../../../scripts/job-worker.mjs');
 const controller=new AbortController();let claims=0,settled;
 await runJobWorker({...configuration,CAPTURE_WORKER_SECRET:undefined},{watch:true,signal:controller.signal,pollMs:0,transport:async(url,init)=>{
  if(url.endsWith('/claim_job_workflow')){claims++;controller.abort();return Response.json({operation:{kind:'fetch'},sourceUrl:'https://jobs.lever.co/example/one',lease:'active-lease'});}
  if(url==='https://jobs.lever.co/example/one')return new Response('<script type="application/ld+json">'+JSON.stringify({'@type':'JobPosting',description:source})+'</script>',{headers:{'content-type':'text/html'}});
  if(url.endsWith('/finish_job_workflow')){settled=JSON.parse(init.body);return Response.json({state:'ready'});}
  throw Error('unexpected transport');
 }});
 assert.equal(claims,1);assert.equal(settled.p_lease,'active-lease');assert.equal(settled.p_result.text,source);
});

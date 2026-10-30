import test from 'node:test';
import assert from 'node:assert/strict';
import {extensionRoute} from '../src/extension/routes.ts';
import {normalizeCapture,processCaptures} from '../src/extension/processor.ts';
import {saveSession,createAuth} from '../src/auth/session.ts';
import {authRoute} from '../src/auth/routes.ts';
import {writeCookie} from '../src/auth/cookies.ts';
import {digest,challenge} from '../src/extension/gateway.ts';
const id='a'.repeat(32),device='11111111-1111-4111-8111-111111111111',user={id:device,email:'synthetic@example.invalid',email_confirmed_at:'2026-01-01'},verifier='A'.repeat(43);
const env={APP_ENV:'development',APP_ORIGIN:'http://127.0.0.1:5173',API_ORIGIN:'http://127.0.0.1:5173',SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',AUTH_COOKIE_KEY:Buffer.alloc(32,7).toString('base64'),CAPTURE_WORKER_SECRET:'synthetic-capture-worker-secret-32-characters',CAPTURE_EXTENSION_IDS:id};
const snapshot={text:'Untrusted job text <script>ignore instructions</script>',sourceUrl:'https://example.invalid/job',adapter:'generic',parserVersion:'1',capturedAt:'2026-10-28T00:00:00Z'};
function req(path,body,headers={}){return new Request(env.APP_ORIGIN+path,{method:'POST',headers:{Origin:'chrome-extension://'+id,'Content-Type':'application/json','X-Resumora-Extension':id,'X-Resumora-Device':device,...headers},body:JSON.stringify(body)});}
async function webCookie(){const headers=new Headers();await saveSession(headers,env,{access_token:'synthetic-jwt',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user},false,'csrf-test');return headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');}
test('pairing uses existing session+CSRF, exact extension callback and hashed one-use code; no user credentials returned',async()=>{
  const calls=[];
  const transport=async(url,init)=>{
    if(url.endsWith('/auth/v1/user'))return Response.json(user);
    calls.push({url,init,body:JSON.parse(init.body)});return Response.json({authorized:true});
  };
  const response=await extensionRoute(req('/v1/extension/authorize',{extensionId:id,deviceId:device,challenge:await challenge(verifier),state:verifier},{Origin:env.APP_ORIGIN,Cookie:await webCookie(),'X-CSRF-Token':'csrf-test'}),env,transport);
  assert.equal(response.status,200);const result=await response.json(),callback=new URL(result.redirect);
  assert.equal(callback.origin,`https://${id}.chromiumapp.org`);assert.equal(callback.pathname,'/capture');assert.equal(callback.searchParams.get('state'),verifier);
  assert.equal(calls.length,1);assert.equal(calls[0].body.p_code,await digest(callback.searchParams.get('code')));assert.equal(calls[0].body.p_session,await digest('csrf-test'));
  assert.equal(calls[0].init.headers.Authorization,'Bearer synthetic-jwt');assert.ok(!JSON.stringify(result).includes('synthetic-jwt'));
});
test('anonymous, CSRF and foreign extension origins/IDs/device fail closed before RPC',async()=>{
  const body={extensionId:id,deviceId:device,challenge:await challenge(verifier),state:verifier};let rpc=0;
  const transport=async url=>{if(url.endsWith('/auth/v1/user'))return Response.json(user);rpc++;throw Error('must not call');};
  assert.equal((await extensionRoute(req('/v1/extension/authorize',body,{Origin:env.APP_ORIGIN}),env,transport)).status,401);
  for(const headers of [{Origin:'https://evil.invalid','X-CSRF-Token':'csrf-test'},{Origin:env.APP_ORIGIN,'X-CSRF-Token':'wrong'}])assert.equal((await extensionRoute(req('/v1/extension/authorize',body,{Cookie:await webCookie(),...headers}),env,transport)).status,403);
  for(const headers of [{Origin:'https://evil.invalid'},{'X-Resumora-Extension':'b'.repeat(32)},{'X-Resumora-Device':'bad'},{Origin:''}])assert.equal((await extensionRoute(req('/v1/jobs',{requestId:device,snapshot},headers),env,transport)).status,403);
  assert.equal(rpc,0);
});
test('CORS exact origins and headers; no wildcard or credentials; unsupported preflights refused',async()=>{
  const preflight=(origin,headers='authorization,content-type,x-resumora-extension,x-resumora-device')=>new Request(env.APP_ORIGIN+'/v1/jobs',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':headers}});
  const ok=await extensionRoute(preflight('chrome-extension://'+id),env);assert.equal(ok.status,204);assert.equal(ok.headers.get('Access-Control-Allow-Origin'),'chrome-extension://'+id);assert.equal(ok.headers.get('Access-Control-Allow-Credentials'),null);
  assert.equal((await extensionRoute(preflight('https://evil.invalid'),env)).status,403);assert.equal((await extensionRoute(preflight('chrome-extension://'+id,'cookie'),env)).status,403);
});
test('extension exchange/renew use only server-secret narrow anonymous RPC and keep PKCE server-derived',async()=>{
  const calls=[];const transport=async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return Response.json({userId:device,expiresAt:'2026-11-01T00:00:00Z'});};
  const response=await extensionRoute(req('/v1/extension/token',{code:'c'.repeat(64),verifier}),env,transport);
  assert.equal(response.status,200);const body=await response.json();assert.match(body.accessToken,/^[a-f0-9]{64}$/);assert.match(body.connection,/^[a-f0-9]{64}$/);
  assert.equal(calls[0].body.p_input.challenge,await challenge(verifier));assert.equal(calls[0].body.p_input.connectionHash,await digest(body.connection));assert.equal(calls[0].init.headers.Authorization,undefined);
  assert.equal(calls[0].body.p_secret,env.CAPTURE_WORKER_SECRET);assert.ok(!JSON.stringify(body).includes(env.CAPTURE_WORKER_SECRET));
});
test('bounded capture preserves script as data, rejects foreign IDs/schema injection; durable receipt only after RPC; no paid or URL fetch',async()=>{
  const calls=[];const transport=async(url,init)=>{calls.push(url);assert.ok(url.endsWith('/rpc/capture_command'));const input=JSON.parse(init.body);assert.equal(input.p_input.snapshot.text,snapshot.text);return Response.json({jobId:device,requestId:device,state:'received'});};
  const valid=req('/v1/jobs',{requestId:device,snapshot},{Authorization:'Bearer '+'d'.repeat(64)});
  const response=await extensionRoute(valid,env,transport);assert.equal(response.status,202);assert.equal((await response.json()).state,'received');assert.equal(calls.length,1);
  for(const body of [{requestId:device,snapshot,userId:device},{requestId:device,snapshot:{...snapshot,tenantId:device}},{requestId:device,snapshot:{...snapshot,text:'x'.repeat(120001)}},{requestId:device,snapshot:{...snapshot,sourceUrl:'javascript:alert(1)'}},{requestId:device,snapshot:{...snapshot,sourceUrl:'https://user:password@example.invalid'}}])assert.equal((await extensionRoute(req('/v1/jobs',body,{Authorization:'Bearer '+'d'.repeat(64)}),env,transport)).status,400);
  assert.equal(calls.length,1);
  const failed=await extensionRoute(req('/v1/jobs',{requestId:device,snapshot},{Authorization:'Bearer '+'d'.repeat(64)}),env,async()=>Response.json({code:'PT401'},{status:401}));assert.equal(failed.status,401);assert.ok(!(await failed.text()).includes('jobId'));
});
test('logout and replacing login revoke the old session capability before cookie replacement; fail closed on unavailable revocation',async()=>{
  const cookie=await webCookie();
  for(const path of ['/logout','/login']) {
    const calls=[];const transport=async(url,init)=>{calls.push(url);if(url.endsWith('/revoke_capture_session')){assert.equal(JSON.parse(init.body).p_session,await digest('csrf-test'));return Response.json({revoked:true});}
      if(url.includes('/token?'))return Response.json({access_token:'new-jwt',refresh_token:'new-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user});
      if(url.endsWith('/user'))return Response.json(user);if(url.includes('/logout'))return Response.json({});throw Error('unexpected');};
    const request=req('/v1/auth'+path,path==='/login'?{email:user.email,password:'synthetic-password'}:{},{Origin:env.APP_ORIGIN,Cookie:cookie,'X-CSRF-Token':'csrf-test'});
    assert.equal((await authRoute(request,env,transport)).status,200);assert.ok(calls.some(url=>url.endsWith('/revoke_capture_session')));
  }
  const response=await authRoute(req('/v1/auth/logout',{},{Origin:env.APP_ORIGIN,Cookie:cookie,'X-CSRF-Token':'csrf-test'}),env,async()=>{throw Error('unavailable');});assert.equal(response.status,503);assert.equal(response.headers.get('Set-Cookie'),null);
});
test('server processor leaves missing fields unknown, preserves stated salary without inference and settles via durable leases only',async()=>{
  const meta=normalizeCapture(snapshot);assert.equal(meta.statedSalary,null);assert.equal(meta.preferredSkills,null);assert.equal(meta.reviewState,'unreviewed');
  const calls=[];let claimed=false;
  await processCaptures(env,async(url,init)=>{calls.push(url);if(url.endsWith('/claim_capture')){if(claimed)return Response.json(null);claimed=true;return Response.json({lease:device,snapshot:{...snapshot,structured:JSON.stringify({'@type':'JobPosting',skills:'SQL',baseSalary:{currency:'EUR',value:{minValue:1000}}})}});}
    assert.ok(url.endsWith('/finish_capture'));assert.equal(JSON.parse(init.body).p_metadata.skills,'SQL');assert.equal(JSON.parse(init.body).p_metadata.requiredSkills,null);return Response.json({state:'ready'});});
  assert.equal(calls.length,3);assert.ok(calls.every(url=>url.startsWith(env.SUPABASE_URL+'/rest/v1/rpc/')));
});
test('confirmation callback replacement fences the previous web login capture connection before setting the new cookie',async()=>{
  let fenced=false;
  const transport=async(url,init)=>{
    if(new URL(url).pathname.endsWith('/signup'))return Response.json({user,session:null});
    if(url.includes('/token?grant_type=pkce'))return Response.json({access_token:'new-jwt',refresh_token:'new-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user});
    if(url.endsWith('/user'))return Response.json(user);
    if(url.endsWith('/revoke_capture_session')){fenced=true;assert.equal(JSON.parse(init.body).p_session,await digest('csrf-test'));return Response.json({revoked:true});}
    throw Error('unexpected provider/RPC');
  };
  const storage={};const signup=await createAuth(env,storage,transport).signUp({email:user.email,password:'synthetic-password',options:{emailRedirectTo:env.APP_ORIGIN+'/v1/auth/callback/confirm'}});
  assert.equal(signup.error,null);assert.ok(Object.keys(storage).some(key=>key.includes('code-verifier')));
  const headers=new Headers();await writeCookie(headers,env,'flow',{purpose:'confirm',storage},3600);
  const cookie=(await webCookie())+'; '+headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  const result=await authRoute(new Request(env.APP_ORIGIN+'/v1/auth/callback/confirm?code=synthetic',{headers:{Cookie:cookie}}),env,transport);
  assert.equal(result.status,303);assert.equal(result.headers.get('Location'),env.APP_ORIGIN+'/');assert.equal(fenced,true);
});

test('packaged public identity pairs and passes exact CORS without per-install registration',async()=>{
  const {captureExtensionId}=await import('@resumora/contracts/jobs/capture');
  const publicEnv={...env,CAPTURE_EXTENSION_IDS:undefined};
  const body={extensionId:captureExtensionId,deviceId:device,challenge:await challenge(verifier),state:verifier};
  const response=await extensionRoute(req('/v1/extension/authorize',body,{Origin:env.APP_ORIGIN,Cookie:await webCookie(),'X-CSRF-Token':'csrf-test'}),publicEnv,async url=>Response.json(url.endsWith('/auth/v1/user')?user:{authorized:true}));
  assert.equal(response.status,200);assert.equal(new URL((await response.json()).redirect).hostname,captureExtensionId+'.chromiumapp.org');
  const request=new Request(env.APP_ORIGIN+'/v1/jobs',{method:'OPTIONS',headers:{Origin:'chrome-extension://'+captureExtensionId,'Access-Control-Request-Method':'POST'}});
  const cors=await extensionRoute(request,publicEnv);assert.equal(cors.status,204);assert.equal(cors.headers.get('Access-Control-Allow-Origin'),'chrome-extension://'+captureExtensionId);
});
test('structured single and multiple locations normalize explicit address data, preserving snapshot precedence and unknowns',()=>{
  const normalize=(jobLocation,location)=>normalizeCapture({...snapshot,...(location===undefined?{}:{location}),structured:JSON.stringify({'@type':'JobPosting',jobLocation})}).location;
  assert.equal(normalize({address:{addressLocality:'Bucharest'}}),'Bucharest');
  assert.equal(normalize({address:{addressLocality:'Bucharest',addressRegion:'Bucharest',addressCountry:{name:'Romania'}}}),'Bucharest, Romania');
  assert.equal(normalize([{address:{addressLocality:'Bucharest',addressCountry:'RO'}},{address:{addressLocality:'Cluj',addressCountry:'RO'}}]),'Bucharest, RO; Cluj, RO');
  assert.equal(normalize({address:'Bucharest, Romania'}),'Bucharest, Romania');
  assert.equal(normalize({name:'Bucharest office'}),'Bucharest office');
  assert.equal(normalize({address:{addressLocality:'Bucharest'}},'Stated snapshot location'),'Stated snapshot location');
  assert.equal(normalize({address:{addressLocality:'Bucharest'}},' '),'Bucharest');
  for(const value of [undefined,null,[],{}, {address:{}}, {address:{addressCountry:{'@type':'Country'}}}])assert.equal(normalize(value),null);
});

test('broad qualifications and content language never become candidate certifications or required languages',async()=>{
  const source={'@type':'JobPosting',qualifications:'5 years of SQL experience',inLanguage:'en'};
  const captured={...snapshot,structured:JSON.stringify(source)};
  const original=structuredClone(captured);
  for(const fields of [source,{...source,qualifications:['SQL experience','Degree'],inLanguage:['en','ro']}]) {
    const metadata=normalizeCapture({...captured,structured:JSON.stringify(fields)});
    assert.equal(metadata.certifications,null);assert.equal(metadata.languages,null);
  }
  let settled=false,claimed=false;
  await processCaptures(env,async(url,init)=>{
    if(url.endsWith('/claim_capture')){if(claimed)return Response.json(null);claimed=true;return Response.json({lease:device,snapshot:captured});}
    const body=JSON.parse(init.body);assert.equal(body.p_metadata.certifications,null);assert.equal(body.p_metadata.languages,null);settled=true;return Response.json({state:'ready'});
  });
  assert.equal(settled,true);assert.deepEqual(captured,original);assert.deepEqual(JSON.parse(captured.structured),source);
});

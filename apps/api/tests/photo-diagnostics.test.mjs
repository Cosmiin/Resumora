import test from 'node:test';import assert from 'node:assert/strict';
import {photoRoute} from '../src/photos/routes.ts';
import {createDatabaseGateway} from '../src/db/supabase.ts';
import {PhotoError} from '../src/photos/format.ts';
const id='11111111-1111-4111-8111-111111111111',secret='s'.repeat(40);
const request=()=>new Request('http://local/v1/photos',{method:'POST',headers:{'Content-Type':'image/jpeg','X-Request-Id':id},body:new Uint8Array([1])});
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'},identity={user:{id},accessToken:'PRIVATE_TOKEN'};
test('bounded diagnostics distinguish normalize/reservation/write/verification/finalize without printing private exception or paths',async()=>{
 const original=console.warn,logs=[];console.warn=(...args)=>logs.push(args);
 try{for(const phase of ['normalize','reserve','storage_write','storage_verify','finalize']){
  const fail=()=>{throw Error('PRIVATE_IMAGE_NAME_OR_TOKEN')};
  const gateway={reservePhoto:async()=>({id,objectKey:'PRIVATE_PATH',state:'reserved'}),putPhoto:async()=>{},getPhoto:async()=>new Uint8Array([1]),readyPhoto:async()=>({id,state:'ready'})};
  const normal=async()=>({bytes:new Uint8Array([1]),width:256,height:256,mime:'image/jpeg'});
  let normalize=normal;if(phase==='normalize')normalize=fail;else gateway[{reserve:'reservePhoto',storage_write:'putPhoto',storage_verify:'getPhoto',finalize:'readyPhoto'}[phase]]=fail;
  const response=await photoRoute(request(),gateway,secret,normalize);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'photoUnavailable',phase}});
 }
 assert.ok(logs.every(([event,meta])=>event==='photo-failure'&&Object.keys(meta).sort().join(',')==='code,httpStatus,phase'));
 assert.ok(!JSON.stringify(logs).includes('PRIVATE_'));
 const result=await photoRoute(request(),{},undefined,()=>assert.fail('no normalize'));assert.equal((await result.json()).error.phase,'configuration');
 const validation=await photoRoute(request(),{},secret,async()=>{throw new PhotoError('invalidPhoto')});assert.equal(validation.status,422);assert.equal((await validation.json()).error.phase,'normalize');
 }finally{console.warn=original;}
});
test('photo gateway records only allowlisted DB/Storage metadata and retains existing authorization and statuses',async()=>{
 const logs=[],original=console.warn;console.warn=(...args)=>logs.push(args);
 try{
  const g=createDatabaseGateway(env,identity,async()=>Response.json({code:'23514',message:'PRIVATE_CONSTRAINT_DETAIL'},{status:400}));await assert.rejects(g.reservePhoto({id,sha256:'a'.repeat(64),width:256,height:256,byteSize:100},secret));
  assert.deepEqual(logs[0],['photo-database',{operation:'reserve_photo',httpStatus:400,code:'23514',reason:'UNCLASSIFIED'}]);
  const storage=createDatabaseGateway(env,identity,async()=>Response.json({code:'AccessDenied',message:'PRIVATE_OBJECT_NAME'},{status:403}));await assert.rejects(storage.putPhoto(`${id}/${id}.jpg`,new Uint8Array([1])));
  assert.deepEqual(logs[1],['photo-storage-response',{operation:'write',httpStatus:403,code:'AccessDenied'}]);assert.ok(!JSON.stringify(logs).includes('PRIVATE_'));assert.ok(!JSON.stringify(logs).includes(secret));
 }finally{console.warn=original;}
});

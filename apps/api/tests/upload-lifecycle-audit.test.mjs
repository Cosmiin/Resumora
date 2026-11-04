import test from 'node:test';
import assert from 'node:assert/strict';
import {importGateway} from '../src/db/imports.ts';
import {importWorkflow} from '../src/intelligence/import-workflow.ts';
const id='11111111-1111-4111-8111-111111111111';
test('original source is reauthorized after asynchronous Storage read, fencing deletion or account revocation',async()=>{
 let revoked=false,checks=0;
 const gateway=importGateway(async(name)=>{assert.equal(name,'get_cv_import_source');checks++;if(revoked)throw Error('SOURCE_UNAVAILABLE');return{objectKey:`${id}/${id}/original.pdf`,format:'pdf',sourceHash:'a'.repeat(64)};},async()=>{},async()=>{revoked=true;return new Uint8Array([1]);});
 await assert.rejects(gateway.createImportStore('').source(id),/SOURCE_UNAVAILABLE/);assert.equal(checks,2);
});
test('PDF original bytes must match pinned upload hash on the server before reopening',async()=>{
 const workflow=importWorkflow({userId:id,store:{source:async()=>({format:'pdf',sourceHash:'a'.repeat(64),bytes:new TextEncoder().encode('%PDF-1.4\n%%EOF')})},aiEnabled:false,processor:async()=>{throw Error('must not process')},operations:{}});
 await assert.rejects(workflow.source(id),/SOURCE_MISMATCH/);
});

test('a changed source identity, operation, owner path, format or checksum cannot replace the original during read',async()=>{
 const row={id,operationId:id,objectKey:`${id}/${id}/original.pdf`,format:'pdf',sourceHash:'a'.repeat(64)};
 for(const patch of [{id:'other'},{operationId:'other'},{objectKey:`foreign/${id}/original.pdf`},{format:'docx'},{sourceHash:'b'.repeat(64)}]){
  let checks=0;const gateway=importGateway(async()=>++checks===1?row:{...row,...patch},async()=>{},async()=>new Uint8Array([1]));
  await assert.rejects(gateway.createImportStore('').source(id),/SOURCE_MISMATCH/);assert.equal(checks,2);
 }
});
test('unchanged owned original and its valid PDF checksum reopen without a processing/provider call',async()=>{
 const bytes=new TextEncoder().encode('%PDF-1.4\n%%EOF');
 const sourceHash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 let checks=0,reads=0;const gateway=importGateway(async()=>{checks++;return{id,operationId:id,objectKey:`${id}/${id}/original.pdf`,format:'pdf',sourceHash}},async()=>{},async()=>{reads++;return bytes});
 const workflow=importWorkflow({userId:id,store:gateway.createImportStore(''),aiEnabled:false,processor:async()=>assert.fail('no processing on reopen'),operations:{}});
 assert.deepEqual(await workflow.source(id),{bytes,format:'pdf',sourceHash});assert.equal(checks,2);assert.equal(reads,1);
});

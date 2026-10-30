import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument,StandardFonts,PDFName,PDFString} from '@cantoo/pdf-lib';
import {exportRoute,exportFilename} from '../src/export/routes.ts';
import {inspectExportPdf} from '../src/export/pdf-structure.ts';
import {decodeDraft} from '@resumora/contracts/editor/transport';
const id='11111111-1111-4111-8111-111111111111';
const payload=JSON.parse(await readFile(new URL('../../../packages/contracts/fixtures/job-editor-import.json',import.meta.url),'utf8'));
const row={id,revision:1,reason:'save',parentId:null,payload,createdAt:'2026-10-30T00:00:00Z'};
function request(body={kind:'base',versionId:id,revision:1}) {return new Request('https://api.example.test/v1/exports/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
const gateway=(value=null)=>({loadSnapshot:async()=>value,loadCurrentJobDocument:async()=>null,readPhoto:async()=>{throw new Error('unavailable');},getPhoto:async()=>{throw new Error('unavailable');}});
test('export accepts immutable pins only, never client HTML/template/contact/resource URLs',async()=>{
 let launches=0;const launch=async()=>{launches++;throw new Error('must not launch');};
 for(const body of [{kind:'base',versionId:id,revision:1,html:'private'},{kind:'base',versionId:id,revision:1,templateVersionId:'bad'},{kind:'base',versionId:'foreign',revision:1},{kind:'job',versionId:id,revision:1,jobId:id,documentId:'foreign'}])assert.equal((await exportRoute(request(body),gateway(),{PDF_EXPORT_ENABLED:'on'},launch)).status,400);
 assert.equal(launches,0);
});
test('foreign/deleted versions fail closed, with no renderer call',async()=>{
 let launches=0;
 const response=await exportRoute(request(),gateway(),{PDF_EXPORT_ENABLED:'on'},async()=>{launches++;throw new Error('not used');});
 assert.equal(response.status,404);assert.equal(launches,0);assert.match(response.headers.get('Cache-Control'),/no-store/);
});
test('autosave is not an accepted Base checkpoint and cannot launch browser',async()=>{
 assert.equal((await exportRoute(request(),gateway({...row,reason:'autosave'}),{PDF_EXPORT_ENABLED:'on'})).status,409);
});
test('an unconfigured renderer reports unavailable rather than fake PDF success',async()=>{
 // Job accepted projection uses the existing source, including any scoped wording.
 const source=decodeDraft(payload);
 const job={schemaVersion:'resumora-job-editor/1',acceptance:'accepted',source:{snapshotId:id,revision:1},job:{id,versionId:null,fingerprint:'a'.repeat(64)},selectedFacts:[],selectedAnswerIds:[],wording:[],presentation:{},localAdditions:[]};
 const db=gateway();db.loadCurrentJobDocument=async()=>({id,documentId:id,revision:1,createdAt:"now",locale:"ro",fingerprint:"a".repeat(64),provenance:{},payload});
 const response=await exportRoute(request({kind:'job',jobId:id,documentId:id,versionId:id,revision:1,locale:'ro',fingerprint:'a'.repeat(64)}),db,{});
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'pdfExportUnavailable'}});assert.equal(source.name.value,decodeDraft(payload).name.value);
});
test('professional names omit internal IDs and reject path/control characters',()=>{
 const source=decodeDraft(payload);source.name.value='Mara Șerban / private\nname';source.titles[0].value='Automation Engineer';
 const name=exportFilename(source,'Nord Systems');assert.match(name,/^Mara_Serban_private_name_Automation_Engineer_Nord_Systems_(RO|EN)\.pdf$/);assert.ok(!name.includes(id));
});
test('actual PDF byte validator rejects missing text/Unicode, active content and malformed data',async()=>{
 await assert.rejects(inspectExportPdf(new TextEncoder().encode('not a pdf')));
 const doc=await PDFDocument.create();const page=doc.addPage([595.28,841.89]);const font=await doc.embedFont(StandardFonts.Helvetica);page.drawText('Synthetic text',{font});
 await assert.rejects(inspectExportPdf(await doc.save()),/UNICODE_MAP/);
 doc.catalog.set(PDFName.of('OpenAction'),doc.context.obj({S:PDFName.of('JavaScript'),JS:PDFString.of('untrusted')}));
 await assert.rejects(inspectExportPdf(await doc.save()),/ACTIVE_CONTENT/);
});

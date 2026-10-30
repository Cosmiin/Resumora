import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,createPublicKey} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildPackage} from '../package.mjs';
import {captureExtensionId} from '../../../packages/contracts/src/jobs/capture.ts';
const root=fileURLToPath(new URL('.',import.meta.url));
function inspect(archive){
  const inspected=spawnSync('python3',['-c',`import sys,zipfile,json,io
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
 print(json.dumps({'files':z.namelist(),'manifest':json.loads(z.read('manifest.json')),'config':json.loads(z.read('config.json')),'license':z.read('LICENSE').decode()}))`],{input:archive,maxBuffer:4*1024*1024});
  assert.equal(inspected.status,0);return JSON.parse(inspected.stdout.toString());
}
function checkArchive(bytes,origin){
  const archive=inspect(bytes);
  assert.deepEqual(archive.files.slice().sort(),['LICENSE','README.md','config.json','icons/128.png','icons/16.png','icons/48.png','manifest.json','popup.css','popup.html','src/popup.js','src/queue.js','src/snapshot.js','src/worker.js'].sort());
  assert.equal(archive.manifest.manifest_version,3);assert.deepEqual(archive.manifest.permissions,['activeTab','scripting','storage','identity','alarms']);
  assert.deepEqual(archive.manifest.host_permissions,[new URL(origin).origin.replace(/:\d+$/,'')+'/*']);
  assert.deepEqual(archive.config,{appOrigin:origin,apiOrigin:origin});assert.ok(archive.license.startsWith('MIT License'));
  const key=Buffer.from(archive.manifest.key,'base64');
  assert.equal(createPublicKey({key,format:'der',type:'spki'}).asymmetricKeyType,'rsa');
  const id=[...createHash('sha256').update(key).digest().subarray(0,16)].map(x=>String.fromCharCode(97+(x>>4),97+(x&15))).join('');
  assert.equal(id,captureExtensionId);
  return archive;
}
test('reproducible site archives use exact origins, a stable public identity and a fixed file allowlist',async()=>{
  for(const origin of ['https://jobs.synthetic.invalid','https://careers.synthetic.invalid:8443','http://127.0.0.1:5173']) {
    const a=await buildPackage({appOrigin:origin}),b=await buildPackage({appOrigin:origin});
    assert.deepEqual(a.archive,b.archive);assert.equal(a.extensionId,captureExtensionId);checkArchive(a.archive,origin);
  }
  for(const options of [{},{appOrigin:'https://example.invalid/path'},{appOrigin:'http://example.invalid'},{appOrigin:'https://example.invalid',apiOrigin:'https://different.invalid'},{appOrigin:'https://user:secret@example.invalid'}])await assert.rejects(buildPackage(options));
});
test('real site builds generate origin-matched downloads and refuse an unconfigured release',async()=>{
  const {build}=await import('vite');
  const dir=await mkdtemp(join(root,'.package-build-'));
  const previous={APP_ORIGIN:process.env.APP_ORIGIN,API_ORIGIN:process.env.API_ORIGIN};
  try {
    await writeFile(join(dir,'index.html'),'<!doctype html><title>Synthetic site build</title>');
    const configFile=fileURLToPath(new URL('../../web/vite.config.ts',import.meta.url));
    const options={configFile,root:dir,logLevel:'silent',build:{outDir:join(dir,'output'),emptyOutDir:true}};
    for(const origin of ['https://jobs.synthetic.invalid','https://careers.synthetic.invalid']) {
      process.env.APP_ORIGIN=origin;process.env.API_ORIGIN=origin;
      await build(options);
      const bytes=await readFile(join(dir,'output/downloads/resumora-extension.zip'));
      checkArchive(bytes,origin);
      assert.deepEqual(bytes,(await buildPackage({appOrigin:origin})).archive);
    }
    delete process.env.APP_ORIGIN;delete process.env.API_ORIGIN;
    await assert.rejects(build({...options,mode:'capture-test-unconfigured'}));
  }finally{
    for(const key of Object.keys(previous)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
    await rm(dir,{recursive:true,force:true});
  }
});
test('local development serves its generated download instead of the static public artifact',async()=>{
  const {createServer}=await import('vite');
  const dir=await mkdtemp(join(root,'.package-dev-'));
  const previous={APP_ORIGIN:process.env.APP_ORIGIN,API_ORIGIN:process.env.API_ORIGIN};
  let server;
  try {
    delete process.env.APP_ORIGIN;delete process.env.API_ORIGIN;
    await mkdir(join(dir,'public/downloads'),{recursive:true});
    await writeFile(join(dir,'public/downloads/resumora-extension.zip'),'stale artifact');
    server=await createServer({configFile:fileURLToPath(new URL('../../web/vite.config.ts',import.meta.url)),root:dir,logLevel:'silent',server:{port:0,strictPort:false}});
    await server.listen();
    const address=server.httpServer.address();
    const response=await fetch(`http://127.0.0.1:${address.port}/downloads/resumora-extension.zip`);
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');
    checkArchive(Buffer.from(await response.arrayBuffer()),'http://127.0.0.1:5173');
  }finally{
    await server?.close();
    for(const key of Object.keys(previous)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
    await rm(dir,{recursive:true,force:true});
  }
});

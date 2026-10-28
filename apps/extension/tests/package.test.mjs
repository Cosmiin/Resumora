import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildPackage} from '../package.mjs';
test('reproducible public archive, meaningful manifest policy, exact configured origin and no private files',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'resumora-extension-package-'));
  try {
    const a=join(dir,'a.zip'),b=join(dir,'b.zip');await buildPackage({output:a});await buildPackage({output:b});
    assert.deepEqual(await readFile(a),await readFile(b));
    const inspected=spawnSync('python3',['-c',`import sys,zipfile,json
with zipfile.ZipFile(sys.argv[1]) as z:
 print(json.dumps({'files':z.namelist(),'manifest':json.loads(z.read('manifest.json')),'config':json.loads(z.read('config.json')),'license':z.read('LICENSE').decode()}))`,a],{encoding:'utf8'});
    assert.equal(inspected.status,0);const archive=JSON.parse(inspected.stdout);
    assert.deepEqual(archive.files.slice().sort(),['LICENSE','README.md','config.json','icons/128.png','icons/16.png','icons/48.png','manifest.json','popup.css','popup.html','src/popup.js','src/queue.js','src/snapshot.js','src/worker.js'].sort());
    assert.equal(archive.manifest.manifest_version,3);assert.deepEqual(archive.manifest.permissions,['activeTab','scripting','storage','identity','alarms']);assert.deepEqual(archive.manifest.host_permissions,['http://127.0.0.1/*']);assert.equal(archive.config.apiOrigin,'http://127.0.0.1:5173');assert.ok(archive.license.startsWith('MIT License'));
    await assert.rejects(buildPackage({output:b,apiOrigin:'https://evil.invalid/path'}));await assert.rejects(buildPackage({output:b,appOrigin:'http://example.invalid'}));
  }finally{await rm(dir,{recursive:true,force:true});}
});

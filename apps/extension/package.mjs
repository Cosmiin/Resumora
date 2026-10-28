import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
function origin(value){const u=new URL(value);if(u.origin!==value || !(u.protocol==='https:' || (u.protocol==='http:'&&u.hostname==='127.0.0.1')))throw Error('Use an exact HTTPS origin, or explicit local 127.0.0.1 HTTP origin.');return u.origin;}
export async function buildPackage({appOrigin='http://127.0.0.1:5173',apiOrigin=appOrigin,output=join(root,'../web/public/downloads/resumora-extension.zip')}={}) {
  appOrigin=origin(appOrigin);apiOrigin=origin(apiOrigin);
  if(appOrigin!==apiOrigin)throw Error('Existing authentication requires the same-origin app/API proxy.');
  const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
  manifest.host_permissions=[new URL(apiOrigin).origin.replace(/:\d+$/,'')+'/*'];
  const files=['popup.html','popup.css','LICENSE','README.md','icons/16.png','icons/48.png','icons/128.png','src/worker.js','src/popup.js','src/snapshot.js','src/queue.js'];
  const entries={'manifest.json':Buffer.from(JSON.stringify(manifest,null,2)+'\n'),'config.json':Buffer.from(JSON.stringify({appOrigin,apiOrigin})+'\n')};
  for(const file of files)entries[file]=await readFile(join(root,file));
  // Fixed allowlist: no filesystem walk, env, credentials, dependencies or sessions.
  const data=Object.fromEntries(Object.entries(entries).map(([name,bytes])=>[name,bytes.toString('base64')]));
  const result=spawnSync('python3',['-c',`import sys,json,base64,zipfile,io
items=json.load(sys.stdin); out=io.BytesIO()
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for name in sorted(items):
  info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  z.writestr(info,base64.b64decode(items[name]))
sys.stdout.buffer.write(out.getvalue())`],{input:JSON.stringify(data),maxBuffer:4*1024*1024});
  if(result.status!==0)throw Error('Package creation failed');
  await mkdir(new URL('.', 'file://'+output).pathname,{recursive:true});
  await writeFile(output,result.stdout);
  return {output,files:Object.keys(entries).sort(),bytes:result.stdout.length};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);if(args.length!==0&&args.length!==2)throw Error('Usage: node package.mjs [APP_ORIGIN API_ORIGIN]');
  console.log(await buildPackage(args.length?{appOrigin:args[0],apiOrigin:args[1]}:{}));
}

import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,createPublicKey} from 'node:crypto';
import {dirname,join} from 'node:path';
import {captureExtensionId} from '../../packages/contracts/src/jobs/capture.ts';
const root=fileURLToPath(new URL('.',import.meta.url));
function origin(value){const u=new URL(value);if(u.origin!==value || !(u.protocol==='https:' || (u.protocol==='http:'&&u.hostname==='127.0.0.1')))throw Error('Use an exact HTTPS origin, or explicit local 127.0.0.1 HTTP origin.');return u.origin;}
export async function buildPackage({appOrigin,apiOrigin=appOrigin,output}={}) {
  appOrigin=origin(appOrigin);apiOrigin=origin(apiOrigin);
  if(appOrigin!==apiOrigin)throw Error('Existing authentication requires the same-origin app/API proxy.');
  const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
  const key=Buffer.from(manifest.key,'base64');
  createPublicKey({key,format:'der',type:'spki'});
  const extensionId=[...createHash('sha256').update(key).digest().subarray(0,16)].map(x=>String.fromCharCode(97+(x>>4),97+(x&15))).join('');
  if(extensionId!==captureExtensionId)throw Error('Manifest identity must match the API capture identity.');
  manifest.host_permissions=[new URL(apiOrigin).origin.replace(/:\d+$/,'')+'/*'];
  manifest.externally_connectable={matches:[new URL(appOrigin).origin.replace(/:\d+$/,'')+'/extension/connect*']};
  const files=['popup.html','popup.css','LICENSE','README.md','icons/16.png','icons/48.png','icons/128.png','src/worker.js','src/popup.js','src/snapshot.js','src/queue.js'];
  const entries={'manifest.json':Buffer.from(JSON.stringify(manifest,null,2)+'\n'),'config.json':Buffer.from(JSON.stringify({appOrigin,apiOrigin})+'\n')};
  for(const file of files)entries[file]=await readFile(join(root,file));
  const data=Object.fromEntries(Object.entries(entries).map(([name,bytes])=>['Resumeify Extension/'+name,bytes.toString('base64')]));
  const result=spawnSync('python3',['-c',`import sys,json,base64,zipfile,io
items=json.load(sys.stdin); out=io.BytesIO()
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for name in sorted(items):
  info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  z.writestr(info,base64.b64decode(items[name]))
sys.stdout.buffer.write(out.getvalue())`],{input:JSON.stringify(data),maxBuffer:4*1024*1024});
  if(result.status!==0)throw Error('Package creation failed');
  if(output){await mkdir(dirname(output),{recursive:true});await writeFile(output,result.stdout);}
  return {files:Object.keys(data).sort(),bytes:result.stdout.length,archive:result.stdout,extensionId};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);if(args.length!==0&&args.length!==2)throw Error('Usage: node --experimental-strip-types package.mjs [APP_ORIGIN API_ORIGIN]');
  const {appOrigin,apiOrigin}=args.length?{appOrigin:args[0],apiOrigin:args[1]}:{appOrigin:process.env.APP_ORIGIN,apiOrigin:process.env.API_ORIGIN};
  const output=join(root,'../web/public/downloads/resumora-extension.zip');
  const {archive,...result}=await buildPackage({appOrigin,apiOrigin,output});
  console.log({output,...result});
}

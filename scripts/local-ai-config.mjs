import { constants } from 'node:fs';
import { open, lstat, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
/** Explicit owner opt-in only. Never source shell input or print credential values. */
export async function prepareLocalAi(path) {
  const dir = await lstat(dirname(path)), meta = await lstat(path);
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid() || (dir.mode & 0o777) !== 0o700 ||
    !meta.isFile() || meta.isSymbolicLink() || meta.uid !== process.getuid() || (meta.mode & 0o777) !== 0o600 || meta.size > 16384) throw new Error('Unsafe private configuration metadata');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let content;
  try { const opened = await handle.stat(); if (opened.ino !== meta.ino || opened.dev !== meta.dev) throw new Error('Private file changed'); content = await handle.readFile('utf8'); }
  finally { await handle.close(); }
  const keys = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = /^(OPENROUTER_API_KEY|OPENAI_API_KEY)=([A-Za-z0-9_.-]{8,512})$/.exec(line);
    if (!match || keys[match[1]]) throw new Error('Unsupported private configuration format');
    keys[match[1]] = match[2];
  }
  if (!keys.OPENROUTER_API_KEY || !keys.OPENAI_API_KEY) throw new Error('Both server keys are required');
  const directory = await mkdtemp(join(tmpdir(), 'resumora-private-ai-'));
  try {
    const envFile = join(directory,'worker.env');
    await writeFile(envFile,Object.entries(keys).map(([k,v])=>`${k}=${v}`).join('\n')+'\nAI_PAID_INFERENCE=off\n',{mode:0o600});
    const config = join(directory,'wrangler.json');
    await writeFile(config,JSON.stringify({name:'resumora-private-ai-local',main:root+'apps/api/src/index.ts',compatibility_date:'2026-10-25',send_metrics:false,
      vars:{APP_ENV:'development',AI_PAID_INFERENCE:'off'}}),{mode:0o600});
    return {directory,envFile,config,cleanup:()=>rm(directory,{recursive:true,force:true})};
  } catch { await rm(directory,{recursive:true,force:true}); throw new Error('Could not prepare private Worker config'); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).join(' ') !== '--load-owner-keys-disabled') {
    console.error('Use --load-owner-keys-disabled for explicit local opt-in. Paid execution stays OFF.'); process.exitCode=1;
  } else {
    let setup;
    try {
      setup=await prepareLocalAi('/home/cosmin/.config/resumora/ai.env');
      // Isolated cwd/config avoids reading or editing the existing .dev.vars/preview runtime.
      const child=spawn(process.execPath,[root+'node_modules/wrangler/bin/wrangler.js','dev','--local','--cwd',setup.directory,'--config',setup.config,
        '--env-file',setup.envFile,'--ip','127.0.0.1','--port','8799','--inspector-port','9249','--log-level','none'],
        {cwd:setup.directory,env:{PATH:process.env.PATH,HOME:process.env.HOME,WRANGLER_SEND_METRICS:'false'},stdio:['ignore','ignore','ignore']});
      console.log('Private local Worker starting on 127.0.0.1:8799; paid inference OFF. No key validation or live request performed.');
      for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>child.kill(signal));
      await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Worker stopped')));});
    } catch { console.error('Private local Worker unavailable. Inspect configuration privately; credential values are suppressed.');process.exitCode=1; }
    finally {await setup?.cleanup();}
  }
}

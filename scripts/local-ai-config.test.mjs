import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareLocalAi } from './local-ai-config.mjs';
test('owner opt-in writes only server key bindings with paid mode forcibly off and rejects unsafe files without echoing values', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'resumora-synthetic-config-'));
  const path=join(dir,'ai.env');
  const synthetic='OPENROUTER_API_KEY=synthetic-router-placeholder\nOPENAI_API_KEY=synthetic-direct-placeholder\n';
  let setup;
  try {
    await writeFile(path,synthetic,{mode:0o600});setup=await prepareLocalAi(path);
    const config=JSON.parse(await readFile(setup.config,'utf8'));
    assert.equal(config.vars.AI_PAID_INFERENCE,'off');assert.equal(Object.keys(config.vars).length,2);
    assert.equal(await readFile(setup.envFile,'utf8'),synthetic+'AI_PAID_INFERENCE=off\n');
    await chmod(path,0o644);await assert.rejects(prepareLocalAi(path),/metadata/);await chmod(path,0o600);
    await writeFile(path,synthetic+'AI_PAID_INFERENCE=on\n');await assert.rejects(prepareLocalAi(path),e=>!e.message.includes('placeholder') && /format/.test(e.message));
    await symlink(path,join(dir,'link.env'));await assert.rejects(prepareLocalAi(join(dir,'link.env')),/metadata/);
  } finally { await setup?.cleanup();await rm(dir,{recursive:true,force:true}); }
});

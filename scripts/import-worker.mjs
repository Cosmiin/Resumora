// Local counterpart of the scheduled Worker; use the same file as the API.
import { processCvImport } from '../apps/api/src/intelligence/import-processor.ts';
import { fileURLToPath } from 'node:url';
import { readDevConfiguration, importWorkerEnabled } from './dev-config.mjs';
const configuration=readDevConfiguration(fileURLToPath(new URL('../',import.meta.url)));
if(!importWorkerEnabled(configuration)) throw Error('AI_PAID_INFERENCE must explicitly be on in apps/api/.dev.vars for the local import worker');
let stopped=false;
process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
console.log('CV import worker ready; claims only explicitly queued uploads.');
do {
  try { const result=await processCvImport(configuration); if(result.processed)console.log('CV import processing finished.'); }
  catch {console.error('CV import worker could not reach its queue; will check again.');}
  if(!process.argv.includes('--watch') || stopped)break;
  await new Promise(resolve=>setTimeout(resolve,2000));
} while(!stopped);

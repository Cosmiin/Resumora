import { startDevServers } from './dev-processes.mjs';
import { readDevOrigin, readDevAiSummary, readDevConfiguration, importWorkerEnabled, jobWorkerEnabled } from './dev-config.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = readDevOrigin(root);
const configuration = readDevConfiguration(root);
const imports = importWorkerEnabled(configuration);
const jobs = jobWorkerEnabled(configuration);
const { children, stop } = startDevServers({ webPort: Number(new URL(origin).port), configuration, imports, jobs });
console.log(`Resumora: ${origin}/#/profile`);
console.log(readDevAiSummary(root));
console.log(`CV import worker: ${imports ? 'managed with the frontend and API' : 'disabled with AI'}.`);
console.log(`Job capture/workflow worker: ${jobs ? 'managed with the frontend and API; paid extraction follows AI policy' : 'not configured'}.`);
let stopping = false;
function finish(code) {
  if (stopping) return;
  stopping = true;
  stop();
  process.exitCode = code;
}
for (const { name, child } of children) {
  child.on('error', () => {
    console.error(`Could not start ${name}. Run npm ci first.`);
    finish(1);
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${name} exited; stopping the local development services.`);
      finish(code === 0 ? 1 : (code ?? 1));
    }
  });
}
process.on('SIGINT', () => finish(0));
process.on('SIGTERM', () => finish(0));

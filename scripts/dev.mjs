import { startDevServers } from './dev-processes.mjs';

const { children, stop } = startDevServers();
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
      console.error(`${name} exited; stopping the local development pair.`);
      finish(code ?? 1);
    }
  });
}
process.on('SIGINT', () => finish(0));
process.on('SIGTERM', () => finish(0));

// Local counterpart of scheduled capture/workflow processing. No browser lifetime.
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { processCaptures } from '../apps/api/src/extension/processor.ts';
import { processJobWorkflow } from '../apps/api/src/jobs/processor.ts';
import { readDevConfiguration, jobWorkerEnabled, localProcessEnvironment } from './dev-config.mjs';

export async function runJobWorker(configuration, {
  watch = false, signal, transport = fetch, pollMs = 2000,
  onError = kind => console.error(`Job worker could not process ${kind}; will check again.`),
} = {}) {
  const shouldContinue = () => !signal?.aborted;
  while (shouldContinue()) {
    // A temporarily unavailable capture queue must not starve URL/workflow jobs.
    try { await processCaptures(configuration, transport, { shouldContinue }); }
    catch { onError('captures'); }
    if (!shouldContinue()) return;
    try { await processJobWorkflow(configuration, { transport }); }
    catch { onError('workflows'); }
    if (!watch || !shouldContinue()) return;
    try { await pause(pollMs, undefined, { signal }); }
    catch (error) { if (error.name !== 'AbortError') throw error; }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const configuration = readDevConfiguration(fileURLToPath(new URL('../', import.meta.url)));
  if (!jobWorkerEnabled(configuration)) throw Error('Job queue credentials must be configured in apps/api/.dev.vars');
  const shutdown = new AbortController();
  process.on('SIGINT', () => shutdown.abort());
  process.on('SIGTERM', () => shutdown.abort());
  console.log('Job worker ready; capture normalization and URL retrieval enabled, extraction follows AI policy.');
  await runJobWorker(localProcessEnvironment({}, configuration, 'jobs'), {
    watch: process.argv.includes('--watch'), signal: shutdown.signal,
  });
}

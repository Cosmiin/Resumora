import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readDevOrigin, readDevConfiguration, readDevAiSummary, importWorkerEnabled, jobWorkerEnabled } from './dev-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
export function importWorkerPids(workspace, proc = '/proc') {
  return workerPids(workspace, 'import-worker.mjs', proc);
}
export function jobWorkerPids(workspace, proc = '/proc') {
  return workerPids(workspace, 'job-worker.mjs', proc);
}
function workerPids(workspace, script, proc) {
  const expected = path.join(workspace, 'scripts', script);
  try {
    return readdirSync(proc).filter(pid => /^\d+$/.test(pid)).filter(pid => {
      try { return readFileSync(path.join(proc, pid, 'cmdline'), 'utf8').split('\0').includes(expected); }
      catch { return false; }
    });
  } catch { return []; }
}
async function probe(origin) {
  try {
    const response = await fetch(origin + '/v1/auth/session', {signal: AbortSignal.timeout(3000)});
    const body = await response.json();
    return response.ok && typeof body?.csrfToken === 'string' && typeof body?.recovery === 'boolean' && 'user' in body;
  } catch { return false; }
}
function serviceState() {
  const result = spawnSync('systemctl', ['--user','is-active','resumora-dev.service'], {encoding:'utf8'});
  return result.stdout?.trim() === 'active' ? 'active' : 'inactive or unavailable';
}
export async function diagnose({workspace = root, home = homedir(), version = process.versions.node, checkSession = probe, checkService = serviceState, findWorkers = importWorkerPids, findJobWorkers = jobWorkerPids} = {}) {
  const lines = ['Environment: local development on Linux/WSL', `Code: ${workspace}`];
  let ok = true;
  const pin = readFileSync(path.join(workspace,'.nvmrc'),'utf8').trim();
  lines.push(`Node: ${version} (pinned ${pin})`);
  if (pin !== version) { ok = false; lines.push('Action: run nvm use in this checkout.'); }
  const configPath = path.join(workspace,'apps/api/.dev.vars');
  lines.push(`Configuration: ${configPath}`);
  if (!existsSync(configPath)) {ok = false;lines.push('Configuration file: missing');}
  else if (process.platform !== 'win32' && (statSync(configPath).mode & 0o077)) {ok = false;lines.push('Action: restrict the configuration file to its owner (chmod 600).');}
  let origin, config;
  try {origin = readDevOrigin(workspace);config = readDevConfiguration(workspace);}
  catch { return {ok:false, text:lines.concat('Configuration: invalid; check the loopback APP_ORIGIN and matching API_ORIGIN.').join('\n')}; }
  lines.push(`Browser: ${origin}/#/profile`, 'API: local Wrangler runtime on 127.0.0.1:8787');
  let database = 'not configured';
  try {const url = new URL(config.SUPABASE_URL);if(url.protocol==='https:' && /^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) database=url.origin;} catch {}
  lines.push(`Database, authentication and storage: hosted Supabase (${database})`);
  lines.push('AI providers: hosted OpenRouter, with OpenAI fallback', readDevAiSummary(workspace));
  try {
    const enabled = importWorkerEnabled(config);
    const workers = findWorkers(workspace);
    lines.push(`CV import worker: ${enabled ? workers.length === 1 ? 'running (one process)' : workers.length ? 'multiple processes; stop the extra manual worker' : 'not running; use npm run dev:start' : workers.length ? 'still running despite AI being disabled in the file; use npm run dev:start to reload, then check for extra manual workers' : 'disabled with AI'}`);
    if (enabled ? workers.length !== 1 : workers.length !== 0) ok = false;
  } catch(error) {ok = false;lines.push(error.message);}
  try {
    const enabled = jobWorkerEnabled(config), workers = findJobWorkers(workspace);
    lines.push(`Job capture/workflow worker: ${enabled ? workers.length === 1 ? 'running (one process)' : workers.length ? 'multiple processes; stop the extra manual worker' : 'not running; use npm run dev:start' : workers.length ? 'still running despite missing queue configuration; use npm run dev:start' : 'not configured'}`);
    if (enabled ? workers.length !== 1 : workers.length !== 0) ok = false;
  } catch(error) {ok = false;lines.push(error.message);}
  const unitPath = path.join(home,'.config/systemd/user/resumora-dev.service');
  const owned = existsSync(unitPath) && readFileSync(unitPath,'utf8').startsWith(`# Workspace: ${workspace}\n`);
  const state = checkService();
  lines.push(`Managed service: ${state}; ${owned ? 'belongs to this checkout' : 'not installed for this checkout'}`);
  if (!owned || state !== 'active') ok = false;
  const session = await checkSession(origin);
  lines.push(`Frontend → API → session endpoint: ${session ? 'reachable' : 'not ready'}`);
  if (!session) ok = false;
  lines.push('Provider inference, capture/workflow and import processing: not exercised by this read-only check.', 'Cloudflare deployment: separate from this local environment; not managed by these commands.');
  return {ok, text:lines.join('\n')};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {const result = await diagnose();console.log(result.text);if(!result.ok)process.exitCode=1;}
  catch {console.error('Environment report could not be completed. Use Node from .nvmrc and check local setup permissions.');process.exitCode=1;}
}

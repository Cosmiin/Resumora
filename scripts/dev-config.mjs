import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function devOrigin(source) {
  const config = parseEnv(source);
  const origin = config.APP_ORIGIN || 'http://127.0.0.1:5173';
  const message = 'APP_ORIGIN and API_ORIGIN must use the same http://127.0.0.1:<frontend-port> origin (not API port 8787). Check apps/api/.dev.vars.';
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        !url.port || url.port === '8787' || url.origin !== origin ||
        (config.API_ORIGIN && config.API_ORIGIN !== origin)) throw Error();
    return origin;
  } catch { throw new Error(message); }
}
function readDevSource(root) {
  let source = '';
  try { source = readFileSync(path.join(root, 'apps/api/.dev.vars'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return source;
}
export function readDevOrigin(root) {
  return devOrigin(readDevSource(root));
}
export function readDevConfiguration(root) {
  return parseEnv(readDevSource(root));
}
const aiIds = ['AI_PROCESSING_POLICY', 'OPENAI_MODEL', 'OPENROUTER_MODEL', 'OPENROUTER_ENDPOINT'];
const modelIds = ['OPENAI_CV_ADMISSION_MODEL', 'OPENAI_CV_EXTRACTION_MODEL', 'OPENROUTER_CV_ADMISSION_MODEL', 'OPENROUTER_CV_EXTRACTION_MODEL'];
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_./-]{1,128}$/.test(value) && !value.startsWith('openrouter/');
export function importWorkerEnabled(config) {
  if (config.AI_PAID_INFERENCE === undefined || config.AI_PAID_INFERENCE === 'off') return false;
  if (config.AI_PAID_INFERENCE !== 'on') throw Error('AI_PAID_INFERENCE must be on or off in apps/api/.dev.vars.');
  const required = ['AI_WORKER_SECRET', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', ...aiIds, ...modelIds];
  const missing = required.filter(key => !config[key]?.trim() ||
    (key === 'AI_WORKER_SECRET' && config[key].length < 32) ||
    ([...aiIds, ...modelIds].includes(key) && !validId(config[key])));
  if (config.AI_REASONING_EFFORT !== undefined && !['none','minimal','low','medium','high','xhigh','max'].includes(config.AI_REASONING_EFFORT)) missing.push('AI_REASONING_EFFORT');
  if (missing.length) throw Error(`Incomplete local AI configuration: ${missing.join(', ')}. Check apps/api/.dev.vars before restarting.`);
  return true;
}
/** Capture normalization and public job retrieval remain available with AI off. */
export function jobWorkerEnabled(config) {
  const secrets = ['CAPTURE_WORKER_SECRET', 'AI_WORKER_SECRET'];
  if (!secrets.some(key => config[key] !== undefined)) return false;
  const missing = secrets.filter(key => config[key] !== undefined && (!config[key]?.trim() || config[key].length < 32));
  try {
    const url = new URL(config.SUPABASE_URL ?? '');
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.origin + '/' !== url.href) throw Error();
  } catch { missing.push('SUPABASE_URL'); }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.SUPABASE_PUBLISHABLE_KEY ?? '')) missing.push('SUPABASE_PUBLISHABLE_KEY');
  if (missing.length) throw Error(`Incomplete local job queue configuration: ${missing.join(', ')}. Check apps/api/.dev.vars before restarting.`);
  return true;
}
/** Server bindings come from the chosen file, never a previously exported account. */
export function localProcessEnvironment(ambient, workerConfig, workerKind = 'imports') {
  const binding = /^(?:AI_|OPENAI_|OPENROUTER_|SUPABASE_|AUTH_|CAPTURE_|PHOTO_|APP_ORIGIN$|API_ORIGIN$|APP_ENV$|VITE_)/;
  const env = Object.fromEntries(Object.entries(ambient).filter(([key]) => !binding.test(key)));
  if (workerConfig) for (const [key, value] of Object.entries(workerConfig)) {
    if (/^(?:AI_|OPENAI_|OPENROUTER_)/.test(key) || ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'].includes(key)) env[key] = value;
    if (workerKind === 'jobs' && key === 'CAPTURE_WORKER_SECRET') env[key] = value;
  }
  return {...env, WRANGLER_SEND_METRICS: 'false'};
}
/** Configuration presence only; never prints values or implies provider readiness. */
export function devAiSummary(source) {
  const config = parseEnv(source);
  if (config.AI_PAID_INFERENCE !== 'on') return 'AI: disabled in local configuration (manual editing remains available).';
  const ids = ['AI_PROCESSING_POLICY', 'OPENAI_MODEL', 'OPENROUTER_MODEL', 'OPENROUTER_ENDPOINT'];
  const missing = ['AI_WORKER_SECRET', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', ...ids].filter(key =>
    !config[key]?.trim() || (key === 'AI_WORKER_SECRET' && config[key].length < 32) ||
    (ids.includes(key) && (!/^[A-Za-z0-9_./-]{1,128}$/.test(config[key]) || config[key].startsWith('openrouter/'))));
  if (missing.length) return `AI: incomplete local configuration; check ${missing.join(', ')} in apps/api/.dev.vars.`;
  return 'AI: enabled locally; provider connectivity not checked.';
}
export function readDevAiSummary(root) {
  return devAiSummary(readDevSource(root));
}
function quote(value) {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid service path.');
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%') + '"';
}
export function serviceUnit(root, node) {
  return `# Workspace: ${root.replace(/[\r\n]/g, '')}
[Unit]
Description=Resumora local frontend, API and background processors
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=${quote(root).slice(1, -1)}
ExecStart=${quote(node)} ${quote(path.join(root, 'scripts/dev.mjs'))}
Environment=${quote('PATH=' + path.dirname(node) + ':/usr/local/bin:/usr/bin:/bin')}
Environment=WRANGLER_SEND_METRICS=false
Restart=on-failure
RestartSec=2
KillMode=control-group
TimeoutStopSec=450
UMask=0077

[Install]
WantedBy=default.target
`;
}

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function startDevServers({ quiet = false } = {}) {
  const specs = [
    ['api', 'node_modules/wrangler/bin/wrangler.js', ['dev', '--local', '--ip', '127.0.0.1', '--port', '8787'], 'apps/api'],
    ['web', 'node_modules/vite/bin/vite.js', [], 'apps/web'],
  ];
  const children = specs.map(([name, entry, args, cwd]) => {
    const child = spawn(process.execPath, [root + entry, ...args], {
      cwd: root + cwd,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: quiet ? 'ignore' : 'inherit',
      detached: process.platform !== 'win32',
    });
    return { name, child };
  });

  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    for (const { child } of children) {
      if (!child.pid) continue;
      if (process.platform === 'win32') {
        // Only terminate the process tree started by this launcher.
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
    }
  }

  return { children, stop };
}

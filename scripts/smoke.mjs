import assert from 'node:assert/strict';
import net from 'node:net';
import { startDevServers } from './dev-processes.mjs';

async function requireFreePort(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error(`Port ${port} is in use. Stop your local dev pair before running npm run smoke.`)));
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise(resolve => server.close(resolve));
}

async function waitFor(url, children) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const failed = children.find(({ child }) => child.exitCode !== null);
    if (failed) throw new Error(`${failed.name} exited before becoming ready.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* Startup is bounded by the deadline. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Local service did not become ready: ${new URL(url).origin}`);
}

await requireFreePort(5173);
await requireFreePort(8787);
const { children, stop } = startDevServers({ quiet: true });
const abort = () => { stop(); process.exitCode = 1; };
process.once('SIGINT', abort);
process.once('SIGTERM', abort);
try {
  await waitFor('http://127.0.0.1:8787/v1/health', children);
  await waitFor('http://127.0.0.1:5173/', children);

  const shell = await fetch('http://127.0.0.1:5173/');
  assert.match(await shell.text(), /Resumora/);

  // Request from the frontend origin. Vite must forward /v1 to the real local Worker.
  const response = await fetch('http://127.0.0.1:5173/v1/health');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('set-cookie'), null);
  const health = await response.json();
  assert.equal(health.service, 'resumora-api');
  assert.equal(health.environment, 'development');
  assert.deepEqual(health.capabilities, { authentication: 'not_implemented', database: 'not_connected' });
  assert.match(health.requestId, /^[0-9a-f-]{36}$/);

  const wrongMethod = await fetch('http://127.0.0.1:5173/v1/health', { method: 'POST' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET');

  for (const [path, method] of [
    ['/signup', 'POST'], ['/login', 'POST'], ['/recovery', 'POST'],
    ['/password', 'POST'], ['/logout', 'POST'],
    ['/callback/confirm', 'GET'], ['/callback/recovery', 'GET'],
  ]) {
    const result = await fetch(`http://127.0.0.1:5173/v1/auth${path}`, { method });
    assert.equal(result.status, 501, `${method} ${path} must not pretend to authenticate`);
    assert.equal((await result.json()).error.code, 'AUTH_NOT_IMPLEMENTED');
    assert.equal(result.headers.get('set-cookie'), null);
  }
  const missing = await fetch('http://127.0.0.1:5173/v1/does-not-exist');
  assert.equal(missing.status, 404);
  const adminUsage = await fetch('http://127.0.0.1:5173/v1/admin/ai/usage');
  assert.equal(adminUsage.status, 503);
  assert.equal((await adminUsage.json()).error.code, 'AUTH_UNCONFIGURED');
  assert.match(adminUsage.headers.get('cache-control'), /no-store/);
  const adminPage = await fetch('http://127.0.0.1:8787/admin/ai');
  assert.equal(adminPage.status, 503);
  assert.match(await adminPage.text(), /Acces restricționat/);
  assert.match(adminPage.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  console.log('PASS: frontend shell, same-origin Worker health proxy, methods, honest auth contracts, protected unavailable admin and unknown routes.');
} finally {
  stop();
  process.removeListener('SIGINT', abort);
  process.removeListener('SIGTERM', abort);
}

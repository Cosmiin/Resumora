import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

test('frontend serves public modules without exposing Worker files or default-denied secrets', async () => {
  const fixtures = [];
  let server;
  try {
    const api = await mkdtemp(path.join(root, 'apps/api/.secret-boundary-'));
    fixtures.push(api);
    const web = await mkdtemp(path.join(root, 'apps/web/.secret-boundary-'));
    fixtures.push(web);
    const cacheDir = await mkdtemp(path.join(root, '.secret-boundary-cache-'));
    fixtures.push(cacheDir);

    const marker = 'synthetic-worker-only-secret';
    const denied = [
      path.join(api, '.dev.vars'),
      path.join(api, '.dev.vars.preview'),
      path.join(api, 'private.json'),
      ...['.env', '.env.local', '.npmrc', '.yarnrc.yml', 'tls.pem', '.git/config']
        .map(name => path.join(web, name)),
    ];
    for (const file of denied) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, `SECRET=${marker}\n`, { flag: 'wx' });
    }

    server = await createServer({
      root: path.join(root, 'apps/web'),
      cacheDir,
      server: { port: 0 },
      logLevel: 'silent',
    });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;

    const deniedPaths = denied.flatMap(file => {
      const workspace = file.startsWith(`${api}${path.sep}`) ? 'api' : 'web';
      return [
        file,
        path.join(root, 'node_modules/@resumora', workspace,
          path.relative(path.join(root, 'apps', workspace), file)),
      ];
    });
    for (const file of deniedPaths) {
      for (const query of ['', '?raw']) {
        const response = await fetch(`${origin}/@fs/${file}${query}`);
        assert.equal(response.status, 403, `${path.relative(root, file)}${query} must be denied`);
        assert.equal((await response.text()).includes(marker), false);
      }
    }

    // Real HTTP module responses prove the narrower allowlist still supports the app.
    for (const route of [
      '/', '/src/main.tsx', '/src/App.tsx',
      ...[
        'packages/contracts/src/index.ts',
        'node_modules/@resumora/contracts/src/index.ts',
        'node_modules/@resumora/web/src/main.tsx',
        'node_modules/react/index.js',
      ].flatMap(file => ['', '?raw'].map(query => `/@fs/${path.join(root, file)}${query}`)),
    ]) {
      const response = await fetch(`${origin}${route}`);
      assert.equal(response.status, 200, `${route} must remain accessible`);
      assert.ok((await response.text()).length > 0);
    }
  } finally {
    // Let dependency bundling finish before deleting its disposable cache.
    // Closing Vite alone can leave native bundler writes still in flight.
    await server?.waitForRequestsIdle();
    const optimizer = server?.environments.client.depsOptimizer;
    await optimizer?.scanProcessing;
    await Promise.all(Object.values(optimizer?.metadata.discovered ?? {}).map(dependency => dependency.processing));
    await server?.close();
    for (const directory of fixtures) await rm(directory, { recursive: true, force: true });
  }
});

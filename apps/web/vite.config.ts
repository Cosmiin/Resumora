import { defineConfig, loadEnv, type Plugin } from 'vite';
import { buildPackage } from '../extension/package.mjs';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  const appOrigin = env.APP_ORIGIN ?? (command === 'serve' ? 'http://127.0.0.1:5173' : undefined);
  const apiOrigin = env.API_ORIGIN ?? appOrigin;
  const download: Plugin = {
    name: 'site-capture-download',
    async generateBundle() {
      const { archive } = await buildPackage({ appOrigin, apiOrigin });
      this.emitFile({ type: 'asset', fileName: 'downloads/resumora-extension.zip', source: archive });
    },
    async configureServer(server) {
      const { archive } = await buildPackage({ appOrigin, apiOrigin });
      server.middlewares.use('/downloads/resumora-extension.zip', (_request, response) => {
        response.setHeader('Content-Type', 'application/zip');
        response.setHeader('Cache-Control', 'no-store');
        response.end(archive);
      });
    },
  };
  return {
    plugins: [react(), download],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      headers: { 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' },
      fs: {
        // Do not expose the Worker or the rest of the workspace through /@fs/.
        allow: ['.', '../../packages/contracts', '../../node_modules'].map(
          path => fileURLToPath(new URL(path, import.meta.url)),
        ),
        deny: [
          '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}',
          '.npmrc', '.yarnrc.yml', '**/.git/**',
          '**/apps/api/**', '**/node_modules/@resumora/api/**',
        ],
      },
      proxy: {
        '/v1': {
          target: 'http://127.0.0.1:8787',
          // Preserve the browser origin for future Worker origin/CSRF checks.
          changeOrigin: false,
        },
      },
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, headers: { 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' } },
  };
});

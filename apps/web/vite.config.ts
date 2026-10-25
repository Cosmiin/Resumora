import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
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
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});

---
id: extension/build
area: extension
files: ["apps/extension/package.json","apps/extension/tsconfig.json","apps/extension/vite.config.ts","apps/extension/vite.reader.config.ts","apps/extension/README.md","apps/extension/.env.example"]
depends_on: ["extension/environments","extension/manifest","extension/background","extension/popup-shell"]
contract: false
checked_hash: 7c69b245
decisions: []
open: []
---
Build the popup and module worker, then append the injectable reader bundle.

- The workspace build runs the main Vite build before the reader build. `apps/extension/package.json:6` -> `"build"`
- The main build emits manifest.json from the same environment parser used at runtime, loading only VITE_ prefixed settings. `apps/extension/vite.config.ts:16` -> `buildManifest`
- Main entry points are the background module and popup HTML; entry and chunk names are stable rather than hashed. `apps/extension/vite.config.ts:27` -> `background`; `apps/extension/vite.config.ts:31` -> `entryFileNames`
- The reader is an IIFE named ResumoraReader written to reader.js; emptyOutDir is false so the second build preserves the first. `apps/extension/vite.reader.config.ts:7` -> `emptyOutDir`
- Tests run in jsdom; typechecking includes source and both build configurations with DOM and WebWorker libraries. `apps/extension/vite.config.ts:37` -> `jsdom`; `apps/extension/tsconfig.json:4` -> `lib`
- Runtime dependencies include the shared workspace, Supabase client and Zod; the package exposes test and no-emit typecheck commands. `apps/extension/package.json:7` -> `test`; `apps/extension/package.json:10` -> `dependencies`

## Connections
- Uses manifest generation: build-time caller and implementation. `apps/extension/vite.config.ts:16` -> `buildManifest`; `apps/extension/src/manifest.ts:3` -> `buildManifest`
- Reader output name must match the injected filename. `apps/extension/vite.reader.config.ts:12` -> `reader.js`; `apps/extension/src/background.ts:32` -> `reader.js`
- Build environment parsing and runtime parsing share environmentsFrom. `apps/extension/vite.config.ts:16` -> `environmentsFrom`; `apps/extension/src/config.ts:3` -> `environmentsFrom`

## Assumptions
- Both build stages must target the same output directory; the reader stage deliberately does not clean it. `apps/extension/vite.config.ts:24` -> `dist`; `apps/extension/vite.reader.config.ts:6` -> `dist`

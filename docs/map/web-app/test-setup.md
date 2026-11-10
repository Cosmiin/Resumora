---
id: web-app/test-setup
area: web-app
files: ["apps/web/src/test/setup.ts"]
depends_on: ["web-app/config"]
contract: false
checked_hash: bddd9b3f
decisions: []
open: []
---
Install browser test matchers and clean rendered React trees between tests.

- Setup imports the Vitest-specific jest-dom matcher integration. `apps/web/src/test/setup.ts:1` -> `@testing-library/jest-dom/vitest`
- React Testing Library cleanup is registered after each test. `apps/web/src/test/setup.ts:5` -> `afterEach(() => cleanup())`
- Vite selects jsdom for the test environment. `apps/web/vite.config.ts:16` -> `jsdom`
- Tests run in the threads pool and receive configured Supabase environment names. `apps/web/vite.config.ts:19` -> `VITE_SUPABASE_URL`; `apps/web/vite.config.ts:20` -> `threads`
- The setup module installs matchers and cleanup only; it does not replace Supabase or fetch. `apps/web/src/test/setup.ts:1` -> `import`; `apps/web/src/test/setup.ts:5` -> `cleanup`
## Connections
- Used by Vite test setup and paired with compiler matcher types: `apps/web/vite.config.ts:17` -> `src/test/setup.ts`; `apps/web/src/test/setup.ts:1` -> `jest-dom/vitest`; `apps/web/tsconfig.json:6` -> `jest-dom/vitest`
## Assumptions
- Cleanup removes rendered trees; service isolation must be supplied separately because this setup contains no transport mock. `apps/web/src/test/setup.ts:2` -> `cleanup`; `apps/web/src/test/setup.ts:5` -> `afterEach`

---
id: web-app/config
area: web-app
files: ["apps/web/package.json","apps/web/tsconfig.json","apps/web/vite.config.ts"]
depends_on: ["web-app/bootstrap","web-app/test-setup","web-app/supabase","api-core/app"]
contract: false
checked_hash: bb811082
cited: [c3527a, af3b2f, 59b164, d8118d, 5c3e6b, 1a09b0, aaabda, ae7b26, 5d6042, 3986d4, ff497c, ff497c, 9c6de1, 7cfc68, 0f659d, e44b10, 9c6d7e, 40c404]
decisions: []
open: []
---
Configure the web workspace, development proxy and browser-oriented compilation.

- The workspace is private ESM, with separate Vite build, Vitest run and no-emit typecheck commands. `apps/web/package.json:3` -> `private`
- Shared schemas are a workspace dependency; Supabase, React Query, React Router and Zod are direct runtime dependencies. `apps/web/package.json:21` -> `@resumora/shared`
- PDF and DOCX generators are direct browser dependencies, alongside installed font packages. `apps/web/package.json:20` -> `@react-pdf/renderer`; `apps/web/package.json:24` -> `docx`
- The compiler extends the root base and includes DOM libraries, React JSX, Vite client types and test matchers. `apps/web/tsconfig.json:2` -> `extends`
- Typechecking includes src and vite.config.ts; building alone does not invoke the separate typecheck script. `apps/web/tsconfig.json:8` -> `include`; `apps/web/package.json:7` -> `vite build`
- Vite uses the React plugin, binds loopback port 5173, and fails rather than choosing another port. `apps/web/vite.config.ts:8` -> `react()`; `apps/web/vite.config.ts:12` -> `strictPort`
- The development proxy forwards /v1 and /health to the API on loopback port 8788. `apps/web/vite.config.ts:5` -> `8788`; `apps/web/vite.config.ts:13` -> `proxy`
## Connections
- Uses the API's health endpoint and protected URL prefix: `apps/web/vite.config.ts:13` -> `/health`; `apps/api/src/app.ts:63` -> `/health`; `apps/api/src/app.ts:65` -> `/v1/*`
- Uses shared test initialization: `apps/web/vite.config.ts:17` -> `setupFiles`; `apps/web/src/test/setup.ts:5` -> `afterEach`
## Assumptions
- Relative API calls require a /v1 handler on the browser origin outside this development proxy. `apps/web/src/lib/api.ts:17` -> `fetch(path`; `apps/web/vite.config.ts:9` -> `server`

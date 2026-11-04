# Local development

Read the [environment guide](environment.md) first. The active application is a Linux/WSL checkout with a managed frontend, API and CV import processor. Supabase and AI providers are hosted dependencies.

## Toolchain and startup

Use Node from `.nvmrc` and the existing npm workspaces. For a new checkout, install locked dependencies with `npm ci --ignore-scripts`. Runtime bindings belong in that checkout's ignored `apps/api/.dev.vars`. Do not copy private settings into source or frontend variables.

```sh
nvm use
npm run dev:doctor
npm run dev:start
npm run dev:status
```

The usual active browser origin is `http://127.0.0.1:15173`; use the configuration reported by `dev:doctor`. An unconfigured checkout defaults to 5173 and a locked authentication shell. `dev:start` manages one `resumora-dev.service`; avoid launching another frontend, API or import worker alongside it. `dev:stop` stops the managed environment.

## Workspace map

| Path | Responsibility |
| --- | --- |
| `apps/web/src` | React editor, authenticated shell, import review, enrichment and document preview |
| `apps/api/src` | Worker API, authentication, persistence gateways and provider operations |
| `packages/contracts/src` | Shared CV, transport and intelligence contracts |
| `supabase/migrations` | Ordered database migration history |
| `scripts/dev*.mjs` | Managed local configuration, processes and diagnostics |
| `scripts/import-worker.mjs` | Background CV import processor |
| `scripts/db` | Native database verification |

## Configuration and secrets

The frontend proxies `/v1` to the API on port 8787. The configured frontend origin, API origin and browser hostname must agree. Origin/CSRF and session checks are enforced by the API.

Checked-in paid inference defaults off. The active checkout's private configuration controls enabled providers and the background import worker. `dev:doctor` reports configuration and process state without invoking models. It does not establish end-to-end provider availability.

Vite denies API workspace files and private configuration through both normal and workspace-symlink paths. Keys remain server-side. The API build is a Wrangler dry run; it does not deploy.

## Checks

```sh
npm run check
npm test --workspace @resumora/api
npm run dev:doctor
npm run smoke
```

`check` runs workspace typechecks, frontend tests, frontend/API builds, secret-boundary tests and development-configuration tests. `smoke` reads the already-running managed app; it does not start another pair or send model requests. Neither command requires stopping the managed service.

For a bounded frontend worker count use `npm run test --workspace @resumora/web -- --maxWorkers=2`. Formatting can be checked separately with `npm run format:check --workspace @resumora/web`.

Native database and canonical-schema checks are described in the [database guide](../database/README.md). The [application CI workflow](../../.github/workflows/ci.yml) runs application checks and API tests. The [database CI workflow](../../.github/workflows/database.yml) separately runs preflight credential checks and synthetic PostgreSQL migrations, isolation, races and populated upgrades. Automated synthetic results establish code behavior within their tested boundaries, not live provider quality or latency.

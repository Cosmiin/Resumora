# Local frontend and Worker foundation

This workspace includes a runnable [**local Base CV slice**](../frontend/base-cv.md), plus the local Worker foundation. Login/session authentication is not implemented. It uses React + Vite + TypeScript for the frontend and Wrangler's local Workers runtime for the API. With default configuration it does not call Supabase, send email, persist CVs across reloads, set authenticated sessions, or use Google OAuth. A configured admin verifier can fetch public Supabase signing keys; no database connection or paid inference is wired. No Cloudflare account, API token or environment file is needed to run it.

## Start from a clean checkout

Use the Node version pinned in [`.nvmrc`](../../.nvmrc) and the npm version in the root [`packageManager` field](../../package.json). Direct dependencies are exact versions; the [root lockfile](../../package-lock.json) pins transitive dependencies. From the repository root:

```sh
npm ci --ignore-scripts
npm run dev
```

Open **http://127.0.0.1:5173/**. The page opens the Base CV workspace with a clear page-memory persistence boundary. Both servers bind to loopback; this does not expose a development server to the LAN. Stop the launcher with Ctrl+C; it stops only its own process trees.

For separate terminals, use `npm run dev:api` and `npm run dev:web`. The Worker is **http://127.0.0.1:8787/**. Vite proxies relative `/v1/...` requests to that Worker; the Base CV memory adapter makes no API requests. The browser sees one origin (`http://127.0.0.1:5173`); no permissive CORS configuration or browser API key is needed.

The proxy preserves the incoming host/origin context rather than claiming all requests came from the API origin. Future session code must still check the actual `Origin` header and CSRF token; the proxy alone is not an authorization control. Keep the `127.0.0.1` hostname consistent: substituting `localhost` changes the origin and can affect future cookies. No HTTPS or cookie security behavior has been proven by this HTTP foundation.

`npm ci --ignore-scripts` was used for this initial toolchain: the lockfile's platform packages supply the local executables without dependency lifecycle scripts. Other operating systems must verify their native tool binaries before development; do not disable antivirus if one is blocked.

## Workspace map

| Path | Purpose |
| --- | --- |
| `apps/web/` | Romanian-first Base CV app, interaction tests, Vite config and frontend build; adapters described in the [Base CV guide](../frontend/base-cv.md#code-and-replacement-boundary) |
| `apps/api/` | Worker entry point, protected admin preparation, internal OpenAI adapter and API contract placeholders; unmounted CV handler described in the [persistence handoff](../frontend/base-cv.md#persistence-component-handoff) |
| `packages/contracts/` | Shared health/error response types and [editor modules](../frontend/base-cv.md#code-and-replacement-boundary); no server bindings or secret values |
| `scripts/dev.mjs` | Start/stop the local pair together |
| `scripts/smoke.mjs` | Start a fresh local pair, verify HTTP/proxy behavior, then stop it |

The discovery prototype remains under `prototype/` with its existing independent commands. It is not bundled into this app. The app adopts the supplied Resumora pine/sage tokens and locally bundled fonts/icons, without external CDN requests or the reference's simulated login behavior.

## Current routes and future auth boundary

JSON API responses include a generated `requestId`; API/admin responses use `Cache-Control: private, no-store`. Unknown routes return 404; wrong methods on foundation routes return 405 with `Allow`. Admin routes authorize before method/filter/data handling. The Worker handler does not read or log request bodies, callback queries, passwords or cookies.

| Method and path | Current result |
| --- | --- |
| `GET /v1/health` | 200; `status: ok`, development service identity, auth `not_implemented`, database `not_connected`; process health only, not proof of database/Auth readiness |
| `POST /v1/auth/signup` | 501 `AUTH_NOT_IMPLEMENTED` |
| `POST /v1/auth/login` | 501 `AUTH_NOT_IMPLEMENTED` |
| `POST /v1/auth/recovery` | 501 `AUTH_NOT_IMPLEMENTED` |
| `GET /v1/auth/callback/confirm` | 501 `AUTH_NOT_IMPLEMENTED` |
| `GET /v1/auth/callback/recovery` | 501 `AUTH_NOT_IMPLEMENTED` |
| `POST /v1/auth/password` | 501 `AUTH_NOT_IMPLEMENTED` |
| `POST /v1/auth/logout` | 501 `AUTH_NOT_IMPLEMENTED` |
| `GET /admin/ai` | Protected server-rendered usage dashboard; 503 locked/unconfigured until verified auth and durable storage are wired |
| `GET /v1/admin/ai/usage` | Owner-only accounting JSON; same fail-closed configuration/storage boundary |

The 501 responses are deliberate: they never simulate successful signup, email delivery, password changes or logout. The shell has no password form. [Authentication preparation](authentication.md#proposed-worker-session-boundary) owns the future implementation contracts. The local proxy solves the development-origin plumbing; callback handlers themselves are not implemented, so **do not yet put these URLs in Supabase's hosted redirect allowlist**.

## Configuration and secrets

The [OpenAI/admin preparation guide](openai-admin.md) documents the isolated synthetic preview, Worker-only secret paths, narrow owner verifier and exact durable-ledger/session integration still required. No paid provider call is mounted in this foundation.

The checked-in [Worker configuration](../../apps/api/wrangler.jsonc) contains only public `APP_ENV=development`, a proposed development Worker name and a compatibility date. No `account_id`, hosted routes, remote resource bindings or provider key is configured. The build script uses `wrangler deploy --dry-run` to bundle locally without uploading. `workers_dev` and preview URLs are disabled as additional publishing defaults; they do not prevent somebody manually invoking a deployment command. This task did not deploy.

No frontend environment variables are needed now. If future web configuration is introduced, Vite's client-prefixed values are public build output and must never contain secrets. Future Worker public configuration (`SUPABASE_URL`, publishable key and actual allowed origins) stays separate from secrets such as a cookie-protection key. Ordinary user-auth flows do not require a service-role key or database password.

The root ignore rules cover `.env*` and `.dev.vars*` at every depth. Future local Worker secrets belong in `apps/api/.dev.vars`, only when the feature needs them. No real credential files or example exceptions were added. Verify a proposed path using `git check-ignore` before writing values. Never print credential-file contents to validate setup.

Vite's development filesystem access is limited to `apps/web/`, `packages/contracts/` and `node_modules/`, retaining the pinned Vite version's default denied-file rules. The Worker workspace is explicitly denied through both `apps/api/` and npm's `node_modules/@resumora/api/` symlink. Worker files, including `.dev.vars` and its environment variants, cannot be served through the frontend's `/@fs/` endpoint using either path.

Wrangler telemetry is disabled in this local configuration/launcher. The root [`undici` override](../../package.json) replaces Wrangler/Miniflare's vulnerable dependency; the [lockfile](../../package-lock.json) records the resolved version. Recheck the override when upgrading Wrangler; it is not permission to use `npm audit fix --force` or downgrade tooling blindly. [Maintainer advisory](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c)

## Checks

Stop any running local dev pair first, then run:

```sh
npm run check
```

This runs frontend/API type checks, browser-free React interaction and memory-adapter tests, the frontend production build, the Worker's **dry-run** bundle (no upload), and an HTTP smoke check of the real local Worker through Vite. The smoke check verifies health metadata, no session cookie, method handling, every unimplemented auth contract, unconfigured admin denial and unknown-route handling. It does not sign in or access external resources. It refuses occupied ports rather than stopping another service.

To check frontend formatting separately, run `npm run format:check --workspace @resumora/web`. It checks `apps/web/src/` and `apps/web/vitest.config.ts` with Prettier; it is not included in `npm run check`.

To run only the local integration check: `npm run smoke`. Generated `node_modules/`, `dist/` and `.wrangler/` directories are ignored. Native Windows runtime, browser rendering/accessibility and hosted Cloudflare behavior need their own later verification; this foundation was checked in the current WSL/Linux environment.

To run only the development secret-boundary regression: `npm run test:dev-secrets`. It starts Vite on an available loopback port, checks that synthetic Worker secrets, other private Worker files and Vite's default protected files return 403 for direct and `?raw` requests through canonical and npm workspace-symlink paths, verifies frontend/shared/dependency files remain accessible, then removes its fixtures and stops the server. It also runs as part of `npm run check`.

The [GitHub Actions workflow](../../.github/workflows/ci.yml) runs these foundation checks for pull requests and pushes to `main`, using the pinned Node/npm toolchain and locked dependencies with lifecycle scripts disabled. It does not deploy the application or verify browser rendering, hosted services or working authentication. The discovery prototype and schema/research checks remain separate from this workflow.

Run `npm test --workspace @resumora/api` for injected OpenAI/accounting/owner-verification tests and synthetic admin HTTP checks; CI runs this separately from `npm run check`. It requires no provider credentials or remote inference.

## Next milestones

1. Follow the [database guide](../database/README.md) for the approved SQL implementation, verification and development apply boundary; Worker database integration remains a later step.
2. Implement the Worker auth/session boundary, UI and genuine confirmation/recovery tests, using authorized project-team recipients initially.
3. Validate HTTPS/cookie behavior and actual app callback routes before changing hosted Auth settings.
4. Separately authorize hosted development resources/Git integration and deployment. Do not reuse CVTailor resources or deploy the discovery repository root.

Official tool references checked 25 October 2026: [Vite](https://vite.dev/guide/), [Wrangler installation](https://developers.cloudflare.com/workers/wrangler/install-and-update/), [local Workers development](https://developers.cloudflare.com/workers/local-development/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

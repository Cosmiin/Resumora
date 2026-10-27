# Local frontend and Worker foundation

This workspace includes a runnable [**local Base CV slice**](../frontend/base-cv.md), plus the local Worker foundation. It uses React + Vite + TypeScript for the frontend and Wrangler's local Workers runtime for the API. See [authentication setup](authentication.md) for the implemented auth boundary, private local configuration and hosted test dependencies, and the [Base CV guide](../frontend/base-cv.md#persistence-component-handoff) for the connected editor. Without auth configuration the app stays locked and does not call Supabase or send email. A configured admin verifier can fetch public Supabase signing keys; paid inference remains unmounted. No Cloudflare account, API token or environment file is needed to start the locked shell.

## Start from a clean checkout

Use the Node version pinned in [`.nvmrc`](../../.nvmrc) and the npm version in the root [`packageManager` field](../../package.json). Direct dependencies are exact versions; the [root lockfile](../../package-lock.json) pins transitive dependencies. From the repository root:

```sh
npm ci --ignore-scripts
npm run dev
```

Open **http://127.0.0.1:5173/** following the [browser verification requirements](authentication.md#external-setup-dependencies). The page opens the authentication shell, which stays locked until configured. See the [Base CV guide](../frontend/base-cv.md#run-and-review) for persistence behavior. Both servers bind to loopback; this does not expose a development server to the LAN. Stop the launcher with Ctrl+C; it stops only its own process trees.

For separate terminals, use `npm run dev:api` and `npm run dev:web`. The Worker is **http://127.0.0.1:8787/**. Vite proxies relative `/v1/...` requests to that Worker; the composed Base CV adapter uses those authenticated routes. The browser sees one origin (`http://127.0.0.1:5173`); no permissive CORS configuration or browser API key is needed.

The proxy preserves the incoming host/origin context rather than claiming all requests came from the API origin. Session code checks the actual `Origin` header and CSRF token; the proxy alone is not an authorization control. Keep the `127.0.0.1` hostname consistent: substituting `localhost` changes the origin and can affect future cookies. No HTTPS or cookie security behavior has been proven by this HTTP foundation.

`npm ci --ignore-scripts` was used for this initial toolchain: the lockfile's platform packages supply the local executables without dependency lifecycle scripts. Other operating systems must verify their native tool binaries before development; do not disable antivirus if one is blocked.

## Workspace map

| Path | Purpose |
| --- | --- |
| `apps/web/` | Romanian-first Base CV app, interaction tests, Vite config and frontend build; adapters described in the [Base CV guide](../frontend/base-cv.md#code-and-replacement-boundary) |
| `apps/api/` | Worker entry point; [authentication](authentication.md#session-and-request-contract), [database gateway](../database/gateway.md), CV routes described in the [persistence handoff](../frontend/base-cv.md#persistence-component-handoff), protected admin preparation and internal OpenAI adapter |
| `packages/contracts/` | Shared health/error response types and [editor modules](../frontend/base-cv.md#code-and-replacement-boundary); no server bindings or secret values |
| `scripts/dev.mjs` | Start/stop the local pair together |
| `scripts/smoke.mjs` | Start a fresh local pair, verify HTTP/proxy behavior, then stop it |

The discovery prototype remains under `prototype/` with its existing independent commands. It is not bundled into this app. The app adopts the supplied Resumora pine/sage tokens and locally bundled fonts/icons, without external CDN requests or the reference's simulated login behavior.

## Current routes and auth boundary

`GET /v1/health` reports process health only, with authentication `implemented_unverified` and database `implemented_unverified`; it is not proof of hosted connectivity. Unknown routes return 404, wrong methods 405. Auth routes use the Worker-only PKCE/cookie boundary documented in [authentication setup](authentication.md#session-and-request-contract). Unconfigured auth returns `503 AUTH_UNCONFIGURED`, never simulated success. Admin routes retain their separate existing owner-verifier/durable-ledger requirements.

## Configuration and secrets

The [OpenAI/admin preparation guide](openai-admin.md) documents the isolated synthetic preview, Worker-only secret paths, narrow owner verifier and exact durable-ledger/session integration still required. No paid provider call is mounted in this foundation.

The checked-in [Worker configuration](../../apps/api/wrangler.jsonc) contains only public `APP_ENV=development`, a proposed development Worker name and a compatibility date. No `account_id`, hosted routes, remote resource bindings or provider key is configured. The build script uses `wrangler deploy --dry-run` to bundle locally without uploading. `workers_dev` and preview URLs are disabled as additional publishing defaults; they do not prevent somebody manually invoking a deployment command. This task did not deploy.

No frontend environment variables are needed. If future web configuration is introduced, Vite's client-prefixed values are public build output and must never contain secrets. Worker auth configuration (`SUPABASE_URL`, publishable key and exact same-origin proxy addresses) stays separate from the private cookie-protection key. Ordinary user-auth flows do not require a service-role key or database password.

The root ignore rules cover `.env*` and `.dev.vars*` at every depth. Local Worker secrets belong in `apps/api/.dev.vars`, only when the feature needs them. No real credential files or example exceptions were added. Verify a proposed path using `git check-ignore` before writing values. Never print credential-file contents to validate setup.

Vite's development filesystem access is limited to `apps/web/`, `packages/contracts/` and `node_modules/`, retaining the pinned Vite version's default denied-file rules. The Worker workspace is explicitly denied through both `apps/api/` and npm's `node_modules/@resumora/api/` symlink. Worker files, including `.dev.vars` and its environment variants, cannot be served through the frontend's `/@fs/` endpoint using either path.

Wrangler telemetry is disabled in this local configuration/launcher. The root [`undici` override](../../package.json) replaces Wrangler/Miniflare's vulnerable dependency; the [lockfile](../../package-lock.json) records the resolved version. Recheck the override when upgrading Wrangler; it is not permission to use `npm audit fix --force` or downgrade tooling blindly. [Maintainer advisory](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c)

## Checks

Stop any running local dev pair first, then run:

```sh
npm run check
```

This runs frontend/API type checks, the browser-free frontend suite described in the [Base CV guide](../frontend/base-cv.md#verification-and-limits), the frontend production build, the Worker's **dry-run** bundle (no upload), and an HTTP smoke check of the real local Worker through Vite. The smoke check verifies health metadata, no session cookie, method handling, unconfigured auth denial or configured Origin/CSRF and missing-flow denial, unconfigured admin denial and unknown-route handling. It does not sign in or access external resources. It refuses occupied ports rather than stopping another service.

To check frontend formatting separately, run `npm run format:check --workspace @resumora/web`. It checks `apps/web/src/` and `apps/web/vitest.config.ts` with Prettier; it is not included in `npm run check`.

To run only the local integration check: `npm run smoke`. Generated `node_modules/`, `dist/` and `.wrangler/` directories are ignored. Native Windows runtime, browser rendering/accessibility and hosted Cloudflare behavior need their own later verification; this foundation was checked in the current WSL/Linux environment.

To run only the development secret-boundary regression: `npm run test:dev-secrets`. It starts Vite on an available loopback port, checks that synthetic Worker secrets, other private Worker files and Vite's default protected files return 403 for direct and `?raw` requests through canonical and npm workspace-symlink paths, verifies frontend/shared/dependency files remain accessible, then removes its fixtures and stops the server. It also runs as part of `npm run check`.

The [GitHub Actions workflow](../../.github/workflows/ci.yml) runs these foundation checks for pull requests and pushes to `main`, using the pinned Node/npm toolchain and locked dependencies with lifecycle scripts disabled. It does not deploy the application or verify browser rendering, hosted services or working authentication. The discovery prototype and schema/research checks remain separate from this workflow.

Run `npm test --workspace @resumora/api` for injected OpenAI/accounting/owner-verification tests, synthetic admin HTTP checks, database gateway checks and CV route/editor transport checks; CI runs this separately from `npm run check`. It requires no provider credentials, hosted database access or remote inference.

## Next milestones

1. Follow the [database guide](../database/README.md) for the approved SQL implementation, verification and development apply boundary; the Worker now composes the user-scoped database gateway and CV routes.
2. Configure the implemented Worker auth boundary and coordinate real confirmation/recovery tests using authorized project-team recipients.
3. Complete controlled hosted signup/login/reset and account-isolation acceptance. Owner-reported hosted URL/schema configuration is separate from observed user-flow evidence.
4. Separately authorize hosted deployment. Do not reuse CVTailor resources or deploy the discovery repository root.

Official tool references checked 25 October 2026: [Vite](https://vite.dev/guide/), [Wrangler installation](https://developers.cloudflare.com/workers/wrangler/install-and-update/), [local Workers development](https://developers.cloudflare.com/workers/local-development/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

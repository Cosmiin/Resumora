# OpenAI connection and owner usage dashboard preparation

This is working preparation code with **synthetic verification only**, not a connected spend monitor. No inference, hosted migration, deployment, customer read or account configuration was performed. The Worker never constructs the provider adapter. Merely supplying a key cannot enable paid calls.

| Surface | Current state |
| --- | --- |
| `GET /admin/ai` on Worker port 8787 | Romanian server-rendered owner dashboard; locked until auth configured, then unavailable until durable ledger wired |
| `GET /v1/admin/ai/usage` | Owner check on every request; accounting JSON or explicit 401/403/503, no CORS access |
| Internal `prepareConnection().check()` | Fixed `connection_check` using Responses; disabled by default, injected synthetic transport tested; no public generation/check route |
| Ledger | Typed `UsageLedger` port; **no durable implementation/binding**, new tables or migrations |
| Login/session | Existing signup/login/cookie flows remain unimplemented; this adds narrow bearer JWT verification only |
| Organization Costs API | Unimplemented; no organization admin key required |

## Local synthetic preview

With the repository's pinned Node/npm versions and installed dependencies:

```sh
npm run dev:admin-demo --workspace @resumora/api
```

Visit `http://127.0.0.1:8790/admin/ai?from=2026-10-26&to=2026-10-26`. Use the exact loopback hostname. The separate Node process serves only this page, rejects other Hosts/methods/files and imports no provider transport or secrets. Stop your own preview with Ctrl+C. It is not mounted in the Worker and cannot unlock production routes. Its banner, cost label and fixture IDs explicitly mark synthetic data; no real calls occur. The fixture includes completed, incomplete, rejected, timed-out and unpriced attempts. An empty period shows no recorded usage. Preview memory disappears on restart.

The UI adapts the supplied Resumora pine/sage/marigold tokens, flat cards, 14px radii and Romanian copy. It uses system font fallbacks with no third-party fonts/scripts/assets; responsive grids and table overflow containment are included. HTTP/generated HTML tests are not a browser visual or accessibility review. Browser/Lavish review requires positive verification of the owner's `cosmin@emedi.ro` Chrome profile; do not launch an isolated/headless browser as a substitute.

## Secure owner setup, only when needed

No key is needed for tests or preview. Do not send credentials to an agent/chat, print environment files, or put provider/admin/Supabase service keys in `apps/web`, `VITE_*`, browser storage or client JavaScript.

When separately authorized to configure the provider, the owner uses the existing OpenAI project: **API Dashboard → project selector → API keys**, choosing a project-scoped restricted key with only the needed Responses capability where available. No new paid account/service or organization admin credential is needed for this preparation. Configure project budget/alerts according to the approved budget; alerts are not an application spending limit. [OpenAI authentication](https://developers.openai.com/api/reference/overview#authentication)

For local Worker setup, first run `git check-ignore apps/api/.dev.vars` (names only). Create/edit that ignored file privately, with permissions restricted to the owner. Placeholder shape, **not an executable setup or a checked-in credential file**:

```dotenv
OPENAI_API_KEY=<project-restricted-key-entered-privately>
OPENAI_MODEL=<explicitly-reviewed-model-id>
OPENAI_PROVIDER_SCOPE=<stable-nonsecret-project-accounting-namespace>
SUPABASE_JWT_ISSUER=https://<existing-project-ref>.supabase.co/auth/v1
SUPABASE_JWKS_URL=https://<existing-project-ref>.supabase.co/auth/v1/.well-known/jwks.json
ADMIN_USER_IDS=<verified-owner-auth.users-uuid>
```

All three auth variables are required. Admin IDs come from the existing Supabase project's **Authentication → Users → actual owner's UID**, independently verified by the project operator. Never choose the first user or derive IDs from browser email/role claims. Check the project's existing asymmetric signing configuration before connection; no signing-key rotation or hosted Auth change is authorized here. ES256/P-256 and RS256 public JWKS verification is supported; legacy HS256 is rejected. The JWKS URL must exactly match the configured HTTPS issuer plus `/.well-known/jwks.json`; token-provided URLs and redirects are rejected. Signature, issuer, `authenticated` audience, UUID subject, expiry and optional not-before/issued-at are checked. JWKS outages fail closed. No application JWKS cache is added; upstream cache/revocation lag and valid-until-expiry JWT limitations still apply. [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts), [signing keys](https://supabase.com/docs/guides/auth/signing-keys)

For a later approved Cloudflare environment, use **Workers & Pages → the approved Worker → Settings → Variables and Secrets**: `OPENAI_API_KEY` must be a **Secret**, separately per environment. Nonsecret model/scope/issuer/JWKS/allowlist values are Worker variables. Alternatively the owner can use the local pinned Wrangler CLI's interactive `secret put OPENAI_API_KEY` with this app's config and the explicitly approved target environment. Do not pass a key on a command line or reuse development values blindly. No such command or deployment was run here.

Config alone still does not connect data or execute inference. Future browser access must extract identity from the approved Worker-managed HttpOnly session and feed the same verified owner authorization, preserving the [existing auth boundary](authentication.md#proposed-worker-session-boundary). Do not build a browser token-entry form to work around missing sessions. No access/refresh token is returned by this UI or stored in JavaScript. A trusted nonbrowser caller can use an existing bearer access token; this preparation does not mint one or implement login.

## Required integration before real usage

The approved SQL [P0–P3 contract](../database/api.md) has no AI accounting commands. The [database plan P4](../database/plan-v2.0.0.md#8-migration-order-dependencies-and-approval-scopes) owns operations, attempts and usage. Reuse that planned boundary rather than create a competing billing schema. This branch changes no migration hashes, database roles, hosted schema or service bindings.

Implement a **server-only durable `UsageLedger` adapter** in the P4 scope, then inject it at `adminRoute` and the internal adapter. Required semantics are documented in [`ledger.ts`](../../apps/api/src/ai/ledger.ts):

- Atomically reserve a unique attempt ID against server-derived user, operation ID/category, provider scope/model and exact request fingerprint; equal replay returns the original row, changed context rejects. No network call until reservation commits. A started row after a crash means unknown outcome.
- Atomically finish once, preserve usage/price evidence, and enforce uniqueness of `(provider, providerScope, providerResponseId)` for counted responses. Equal redelivery is linked/excluded, conflicting evidence rejects for reconciliation. A true retry uses a new attempt ID under the same operation and each distinct provider response is counted. The client request ID is a trace ID, **not a provider deduplication guarantee**.
- Persist timestamps, requested/resolved model, verified user ID, safe HTTP/provider status/error codes and request/response IDs, normalized counters plus sanitized numeric provider usage, and the complete immutable price snapshot/cost estimate. The fingerprint covers the fixed request only; no CV content is hashed or processed. Tenant identity must be derived by future verified ownership checks, never supplied by a browser.
- Aggregate the complete UTC period in storage, return model/operation breakdowns, and cap recent attempts at 50. A date range is inclusive and limited to 366 days. Admin reads require dedicated server authorization, not a public table grant or client service-role credential. Do not return a truncated sample as a full-period total.
- Keep unknown attempts/usage/prices visible until reconciliation. No expiry into zero, blind automatic retry or historical repricing. Duplicate metadata delivery is not another charge. A completion-storage failure propagates; a replay must not call the provider again.

The fixture class is test/preview memory only; production routes reject it. No claim of durable accrued spend or end-to-end live readiness follows from a test double implementing this interface.

After storage and approved auth/session integration, a separately approved **single fixed owner smoke check** could explicitly construct `prepareConnection` with `execution: 'live'`, a durable ledger and Worker-only secret. There is no runtime enable switch/public route in this branch. Live smoke, generation, enrichment, customer input, queues, streaming, reconciliation jobs and budget enforcement need their own bounded implementation/authorization; none are activated here.

## API and estimate rules

The adapter uses one nonstreaming `POST https://api.openai.com/v1/responses`, fixed input `Reply with OK.`, `store:false`, no tools, `service_tier:default`, disabled truncation and no redirects. Output defaults to 32 tokens and is restricted to 16–256, including reasoning; input defaults to 256 bytes and can be set only within 1–4096. The complete request is capped at 4096 bytes, response at 256KiB and timeout at 30 seconds (default 15). There is no user-authored prompt or generic proxy. `store:false` does not promise zero provider retention. [Responses operation](https://developers.openai.com/api/reference/resources/responses/methods/create), [data controls](https://developers.openai.com/api/docs/guides/your-data)

The adapter makes **no automatic retries**. A rejection records a failed attempt with unknown usage unless reported; a timeout, transport failure or unreadable response records unknown outcome. Incomplete responses can still have billable usage. It stores safe fixed error codes, never upstream error text, prompts, output, keys, full headers or CV/job content. `X-Client-Request-Id` is the reserved attempt ID; `x-request-id` and response ID are retained when available. [Request IDs](https://developers.openai.com/api/reference/overview#debugging-requests), [error/retry guidance](https://developers.openai.com/api/docs/guides/error-codes)

Prices are a versioned **26 October 2026 observed standard text snapshot**; the effective date is this application's snapshot boundary, not a claimed vendor price-change date. No model is selected by default. The demo prices `gpt-5.4-nano` (input/cached/output $0.20/$0.02/$1.25 per million tokens) and `gpt-5.4-mini` ($0.75/$0.075/$4.50), including exact documented `2026-03-17` snapshots. These fixture models are not a recommendation; review availability/deprecation/quality before future live use. Unknown models/tiers, pre-snapshot dates, unsupported nonzero cache-write usage or missing/invalid counters have unknown cost. New prices require a new version; do not replace stored historical rates. [Official pricing](https://developers.openai.com/api/docs/pricing), [nano model](https://developers.openai.com/api/docs/models/gpt-5.4-nano), [mini model](https://developers.openai.com/api/docs/models/gpt-5.4-mini)

`(input − cached input) × input rate + cached input × cache rate + output × output rate` uses integer nano-USD. Cached input is a subset of input, reasoning is a subset of output; neither is added again. Missing reasoning detail remains null. Money rounds half up only for display (six decimals); persisted sums retain full integer precision. Missing usage/prices are excluded from the **known subtotal**, with separate unknown counters; an unknown subtotal is labeled unknown, never free. Provider usage is allowlisted to documented numeric token fields, not arbitrary response JSON. Estimates cover only this application's recorded attempts and are **not an OpenAI invoice**. [Reasoning and output limits](https://developers.openai.com/api/docs/guides/reasoning)

## Verification

```sh
npm test --workspace @resumora/api
npm run check
```

The API tests generate ephemeral signing keys, inject provider/JWKS transports and run the synthetic preview on an ephemeral loopback port. They cover success/error/timeout/malformed/oversized responses, limits, no default execution or implicit retry, exact cached/reasoning arithmetic and decimal rounding, missing/unpriced data, duplicate ingestion and retry attempts, failed settlement replay, owner/nonowner/anonymous/malformed/expired/forged JWTs, configuration failure, dates/empty/error states, safe generated output and HTTP Host/file protection. CI runs these alongside existing type/build/HTTP/frontend secret-boundary checks. No test calls OpenAI, hosted Supabase or a browser.

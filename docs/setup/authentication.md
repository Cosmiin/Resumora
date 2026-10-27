# Local Supabase authentication

The application implements email/password signup, confirmation, login, session refresh, logout, password-reset request and recovery completion through the local Cloudflare Worker and Supabase Auth. Google sign-in is deferred. This is one application: React calls relative `/v1` routes through Vite; only the Worker uses `@supabase/auth-js`. There is no browser Supabase session, password database, service-role client or separate local auth service.

Implementation tests use a synthetic provider and include a native workerd login/session/logout check. They do **not** establish hosted login, email receipt, recipient eligibility or configured redirects. No hosted Auth settings have been changed. Persistence composition is delivered after the Database and Persistence module branches land; the auth branch alone retains the existing editor adapter.

## Local configuration

Use the existing **Resumora development Supabase project**, not a duplicate project. Keep the frontend at `http://127.0.0.1:5173` and Worker at `http://127.0.0.1:8787`; the existing Vite proxy preserves the browser Origin. `API_ORIGIN` is the browser-facing API origin through that proxy, **not** port 8787. Do not substitute `localhost` or expose these HTTP listeners to the LAN.

Check the intended secret path before creating it:

```sh
git check-ignore apps/api/.dev.vars
```

Place configuration privately in ignored `apps/api/.dev.vars`. The following are **placeholders**, not usable credentials:

```dotenv
APP_ORIGIN="http://127.0.0.1:5173"
API_ORIGIN="http://127.0.0.1:5173"
SUPABASE_URL="https://<existing-development-project-ref>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<existing-development-publishable-or-legacy-anon-key>"
AUTH_COOKIE_KEY="<private-base64-encoded-32-random-bytes>"
```

`APP_ENV=development` already lives in Wrangler's checked-in configuration. The URL, publishable/anon key and origins are public configuration; the cookie key is a Worker-only secret. Obtain existing designated configuration through the approved private setup path. Generate/store the cookie key privately without printing it in chat, terminals, logs or source files. Do not use a Supabase signing key, service-role/secret key, database password or management token. Service-role/secret keys fail configuration validation. Never put secrets in a `VITE_*` value. Root ignores and Vite's Worker filesystem deny rules remain in force.

Run `npm ci --ignore-scripts`, then `npm run dev`. Missing/invalid settings return actionable `503 AUTH_UNCONFIGURED`; the frontend stays locked. Frontend and browser-facing API must share one exact origin. This implementation deliberately has no permissive CORS or cross-site cookie mode. HTTPS uses Secure `__Host-` cookies; only explicit development on HTTP `127.0.0.1` uses the distinct `resumora-local-` cookie names. Ports share host cookies, so do not run unrelated apps using these names on the same hostname. Replacing `AUTH_COOKIE_KEY` invalidates existing cookies; no automatic key rotation or hosted settings write occurs.

## External setup dependencies

Before any controlled signup/reset send, Firstmate must coordinate eligible project-team recipients and test approval. Keep email confirmation enabled. Team-only built-in SMTP restrictions and actual limits must be verified by the authorized project owner; an API success is never delivery evidence. No paid SMTP, outside testers, account resets or remote test users are implied by installing/running this code.

Separately review/approve hosted Authentication URL Configuration. The exact local browser-facing callback paths are:

- `http://127.0.0.1:5173/v1/auth/callback/confirm`
- `http://127.0.0.1:5173/v1/auth/callback/recovery`

The pinned Auth SDK attaches `sb_flow_id` to callback URLs. The approved Supabase redirect configuration must preserve that query parameter and route, and email templates must preserve the provider redirect. Verify compatibility with Supabase's [redirect allowlist rules](https://supabase.com/docs/guides/auth/redirect-urls) before modifying hosted settings. Site URL is the actual frontend origin. No arbitrary `next`/return URL is supported. Do not copy codes, email links or browser sessions into logs, chat or tests. Proxy/access-log configuration must redact callback queries before real email tests. Native browser validation requires the verified `cosmin@emedi.ro` Chrome profile; it has not been performed by these automated tests.

Hosted database migrations, schema exposure and the final two-account save/reopen test are separate dependencies owned by Database/Persistence and Firstmate. Auth tests do not prove database RLS or hosted integration.

## Session and request contract

| Route | Behavior |
| --- | --- |
| `GET /v1/auth/session` | Safe `{user:{id,email}\|null, csrfToken, recovery}` status; initializes anonymous browser CSRF context. No tokens. |
| `POST /v1/auth/signup` | SDK `signUp`, PKCE confirmation transaction; generic check-email response even for existing-account provider rejection. Signup never directly establishes an application session. |
| `POST /v1/auth/login` | SDK `signInWithPassword`, then server `getUser` verification and protected cookie. Unknown user/wrong password share one safe error. |
| `POST /v1/auth/recovery` | SDK `resetPasswordForEmail`, recovery-purpose PKCE transaction; generic known/unknown account response. |
| `GET /v1/auth/callback/confirm` | Exchange code against the initiating browser's PKCE verifier; verify identity, then clean fixed redirect to `/`. |
| `GET /v1/auth/callback/recovery` | Bound recovery-purpose exchange plus SDK `PASSWORD_RECOVERY` signal; verify identity, then fixed `/reset-password` redirect. |
| `POST /v1/auth/password` | Require unexpired verified recovery session and CSRF. Refresh validates provider revocation, update password, revoke local recovery session, clear cookies and require login. |
| `POST /v1/auth/logout` | Provider local signout and all app session/flow/browser-cookie removal. Provider failure is explicit even though local cookies are cleared. |

Every write, including login/reset/logout, requires exact configured Origin, JSON, a bounded body and `X-CSRF-Token` matching protected session/anonymous context. Callback GETs instead validate the browser-bound flow and code. Responses use `private, no-store`, `no-referrer` and `nosniff`. Provider diagnostics and credentials never enter responses/logs. Provider `429` yields safe retry guidance; email flows also set `Retry-After: 60`. This local implementation does not add a distributed abuse-limiting service.

AES-GCM cookies bind ciphertext to cookie purpose/name. Token pairs are encrypted and HttpOnly, host-only, `Path=/`, `SameSite=Lax`, chunked into at most four 3000-character values; stale chunks are explicitly removed. Oversized/unusable/tampered/expired sessions fail closed. Normal cookies have a seven-day application cap; recovery has ten minutes, never extended by refresh. Provider policy may expire sessions earlier. Start one pending email flow at a time; overlapping attempts with its cookie return `FLOW_PENDING`. Use the cancel/signout action to discard the pending flow and request another. Links require the initiating browser/device. Invalid, expired, consumed or wrong-purpose callback context redirects to a clean restart message without echoing parameters.

`apps/api/src/auth/session.ts` exports:

- `authenticateRequest(request, env, transport?)` → `{user, accessToken, headers}` or `{response}`. `user.id` comes from current Supabase Auth `getUser(accessToken)`, never browser input. Recovery-only sessions cannot access CV data. The database gateway forwards that same access token for authenticated RLS/RPC access; ownership is keyed by user ID, never email.
- `checkWrite(request, env)` checks Origin/content-type/CSRF. CV composition must call it for POST requests before dispatch.

Forward **all** authentication response headers, particularly each rotated/cleared `Set-Cookie`, onto both successful and failed CV responses. Keep `accessToken` inside the Worker. Expiring normal access tokens refresh on demand; a short-lived single-flight cache shares the rotated pair across concurrent requests in the supported local Worker isolate. Refresh failure clears session cookies and fails closed. Multi-isolate/hosted deployment requires separately reviewed refresh/recovery coordination; these in-memory locks are not a distributed guarantee. Supabase-issued JWTs may remain valid until expiry after refresh revocation; logout cannot promise instant invalidation of a separately copied JWT. See [Supabase session behavior](https://supabase.com/docs/guides/auth/sessions).

`AuthShell` wraps the existing editor; its render child receives `(account, transport)`. That stable transport adds credentials/CSRF/no-store and unmounts private UI on protected-resource 401. Construct the persistence adapter per authenticated account. Logout unmounts the editor immediately and fences older status responses. Failed logout remains explicit instead of silently reopening private UI on focus.

## Focused checks

```sh
npm test --workspace @resumora/api
npm run test --workspace @resumora/web -- src/auth/AuthShell.test.tsx
npm run typecheck
npm run smoke
```

These cover the SDK against synthetic provider responses, native Worker cookie/session execution, form transitions, generic enumeration responses, CSRF/origin/body boundaries, refresh rotation/failure, cookie tampering/expiry, recovery isolation/consumption and fixed redirects. No test sends real email, creates hosted users or proves hosted login. Mandatory no-mistakes and CI gates remain part of delivery.

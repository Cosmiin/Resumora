# Development authentication preparation

Prepared **25 October 2026** for email/password signup, login and password reset, with Google later. **This is docs/config preparation, not a working authentication implementation.** See the [local route inventory](local-development.md#current-routes-and-future-auth-boundary) for current API behavior; authentication and callback handling remain unimplemented. The discovery prototype remains a separate demo. This change adds credential-file ignores; it does not change Supabase settings, deploy code or send email.

## Readiness and next step

| State | Evidence / next dependency |
| --- | --- |
| **READY** | Earlier read-only dashboard inspection (25 October, 07:37–07:40 UTC): project **Resumora**, ref `aquvhqbkvrtzhbmezkci`; General: **West EU (Ireland)**; linked organization Billing: **Free Plan**; Authentication → Sign In / Providers: **Email enabled**, **Confirm email enabled**, signup allowed. Reuse this project. |
| **READY** | Root `.gitignore` protects `.env*` and `.dev.vars*` at every depth, including suffixed/local variants. No example exceptions or credential files added. These are proposed branch changes until merged. |
| **PREPARED** | Worker session boundary, proposed routes, configuration boundaries and future checks below. Owner choice: **only owner/project-team email recipients initially**; no external testers or paid SMTP configuration now. |
| **NEEDS OWNER** | Before email tests, verify each intended recipient is an authorized organization-team address. Before external recipients, approve an SMTP approach/sender; none selected. Before hosted URL changes, the implementation must establish real frontend/API origins and callback routes. |
| **NOT IMPLEMENTED** | Signup/login/reset/session API and UI, delivery tests, Google and application integration. See the [SQL access contract](../database/api.md#granted-reads-and-access) for implemented tenant policies. “Empty” and intended development use are owner claims. Machine region code, hosted RLS, storage protection, login, SMTP and delivery remain unverified. Dashboard `PRODUCTION` is a branch/context label, not proof of actual production data. |

**Exact next configuration step, after separate implementation approval:** once the real app and Worker callback routes exist locally, record their exact origins, then review **Authentication → URL Configuration** on this existing project: Site URL = actual frontend origin; redirect allowlist = exact Worker confirmation/recovery callback URLs. Do not put the prototype preview address or proposed examples into hosted settings now. Verify eligible team recipients and current email limits before a controlled send. No duplicate project, upgrade or password/key collection is needed for preparation.

## Proposed Worker session boundary

Follow the existing [API contract](../../research/architecture/contracts.md) and [security proposal](../../research/architecture/security-ops.md): browser → Worker → Supabase Auth. Only the Worker uses the Auth SDK; browser JavaScript receives safe account/session status, never access/refresh tokens or a Supabase localStorage session. Use a request-scoped client with `flowType: 'pkce'` and a server-controlled storage adapter; no shared mutable user client across requests. Supabase's usual browser/SSR examples do not automatically implement this HttpOnly boundary. [Server-side Auth guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide)

Proposed session storage: authenticated-encrypted, HttpOnly cookies containing the token pair, with a separate protected, expiring flow cookie for PKCE verifier and purpose. A future Worker-only `AUTH_COOKIE_KEY` seals them; it is not a Supabase signing secret. Implementation must handle cookie size/chunking, key rotation, refresh concurrency and reject tampering/expiry before this design is usable. No store or key is created here.

Use host-only cookies, `Path=/`, `HttpOnly`, `Secure`, `SameSite=Lax`; production may use the `__Host-` prefix with no `Domain`. Prefer HTTPS and same-site frontend/API deployment. Local HTTP needs an explicit development-only cookie policy/name: do not assume Secure/prefix behavior works identically in every localhost browser. Local ports share cookies by host; use consistent hostnames and avoid collisions. Unrelated `pages.dev` and `workers.dev` sites may not support this Lax cookie flow; settle routing/custom domains or a local proxy before configuring origins. [Cookie rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)

For every mutating endpoint, including login/reset/logout: require exact approved `Origin`, a CSRF token bound to the protected session/flow and a bounded request body; reject absent/unapproved origins for browser writes. CORS credentials use exact allowlisted origins, never `*`. SameSite/CORS alone are insufficient. Callback GETs instead validate the bound PKCE transaction and fixed destination; do not require a cross-site email navigation to supply the app's Origin. No arbitrary `next`/redirect input. Auth responses use `Cache-Control: private, no-store`; callback pages use `Referrer-Policy: no-referrer` and no analytics/third-party assets.

The authenticated behavior below remains **proposed and unimplemented**; the [local route inventory](local-development.md#current-routes-and-future-auth-boundary) owns current responses. `APP_ORIGIN` and `API_ORIGIN` are unset placeholders for actual origins. API paths are on the Worker; page paths are on the frontend.

| Proposed route | Future behavior |
| --- | --- |
| `POST /v1/auth/signup` | Worker calls `signUp({ email, password, options: { emailRedirectTo: API_ORIGIN + '/v1/auth/callback/confirm' } })`. Keep confirmation enabled; do not treat account creation as a confirmed session. Show a generic check-email response. [Signup API](https://supabase.com/docs/reference/javascript/auth-signup) |
| `GET /v1/auth/callback/confirm` | Exchange the confirmation code using its bound verifier; only verified success establishes the session, then redirect to a fixed frontend page without query credentials. |
| `POST /v1/auth/login` | Worker calls `signInWithPassword({ email, password })`, validates the resulting identity and sets protected cookies. Generic invalid-credentials message for unknown user/wrong password; no provider/account-existence hints. [Password login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) |
| `POST /v1/auth/recovery` | Worker starts a recovery-only PKCE transaction and calls `resetPasswordForEmail(email, { redirectTo: API_ORIGIN + '/v1/auth/callback/recovery' })`. Show “If an eligible account exists, check your email.” Success is not delivery evidence. [Recovery request API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) |
| `GET /v1/auth/callback/recovery` | Validate the original recovery transaction and exchange its code; only then permit the reset form at `APP_ORIGIN + '/reset-password'` using protected recovery context. A path, `type=recovery` query, ordinary login cookie or client event alone is not proof of recovery. |
| `POST /v1/auth/password` | Require CSRF, verified user and the unexpired recovery context bound to that user/session; call `updateUser({ password })`. Consume/clear recovery context on success, end that recovery session and require login with the new password. Reject direct form visits without verified recovery. [Password update API](https://supabase.com/docs/reference/javascript/auth-updateuser) |
| `POST /v1/auth/logout` | Explicit `signOut({ scope: 'local' })`, clear all session/flow cookies; keep global logout an explicit separate action. Refresh revocation does not instantly invalidate an already-issued JWT. [Logout API](https://supabase.com/docs/reference/javascript/auth-signout) |

## Confirmation, recovery and session rules

Use `exchangeCodeForSession(code)` with the verifier saved when the transaction started. Bind purpose (`confirmation` or `recovery`) and browser to that transaction; never let a confirmation/Google code grant recovery rights. Preserve the SDK recovery signal (`PASSWORD_RECOVERY`) where provided, alongside server-controlled purpose, rather than deriving purpose from untrusted URL text. PKCE requires the initiating browser/device; if context is missing, offer a fresh request in that browser. Start one pending flow at a time; overlapping requests must not silently replace another verifier. Auth codes are documented as **single-use, valid for five minutes**; this is distinct from the email verification link's configured lifetime. [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [code exchange](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession)

Supabase verifies the email link before returning the code. Treat consumed/expired/invalid links as a safe restart, never an authentication bypass. The hosted project's email-token expiry and templates have not been inspected: read their actual settings before testing, rather than promising an invented recovery lifetime. Templates must preserve the intended confirmation/recovery redirect; scanner prefetch can consume one-time links. [Email templates and limitations](https://supabase.com/docs/guides/auth/auth-email-templates)

After exchange, remove codes from the address bar with a redirect to a clean fixed URL. Redact passwords, cookies, Authorization headers, email links, codes, token hashes, PKCE verifiers and token pairs at logging/telemetry boundaries, including proxy access logs. Never log full callback URLs or raw provider responses. Keep recovery sessions restricted to changing the password/logout; a successful request to send email grants no recovery access. The one-time Auth exchange is provider-enforced; implementing consumption of application recovery context is still required and must be tested.

Worker requests validate identity using supported Auth verification (`getUser()` for current server-side user/session checks); never authorize from an unverified `getSession()` payload. Refresh on demand, persist both rotated tokens before responding and serialize concurrent refresh attempts. Fail closed and clear unusable cookies on invalid refresh. Supabase documents refresh-token rotation/reuse exceptions; do not implement blind retry loops. App cookie expiry is not provider revocation, and Free does not include every paid session-lifetime control. [Session lifecycle](https://supabase.com/docs/guides/auth/sessions)

## Email scope and configuration boundaries

The owner chose team-only testing. Built-in hosted SMTP currently sends only to pre-authorized project-team addresses, at **two messages/hour**, best effort with no delivery SLA. Verify actual membership and receipt separately; do not add outside testers to the project just to enable email. External users need an approved SMTP sender/provider setup later. No paid provider is selected. [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp)

Keep signup/reset responses generic for known and unknown accounts, without distinct account-existence status/body/timing paths. A successful reset request may send nothing for an unknown address. [Password recovery behavior](https://supabase.com/docs/guides/auth/passwords)

Handle provider `429` responses with bounded backoff/cooldown and safe retry guidance; add Worker IP/account throttles without exposing account existence. Check current project limits before functional testing; do not increase limits to get tests through. [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)

| Proposed configuration | Classification / future location |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Public backend configuration; future Worker variables. Public does not mean authorized: user token/RLS still enforce access. |
| `APP_ORIGIN`, `API_ORIGIN`, `ALLOWED_ORIGINS` | Public exact origins/routes, chosen when implementation exists. Callback entries follow [redirect rules](https://supabase.com/docs/guides/auth/redirect-urls). |
| `AUTH_COOKIE_KEY` | Future Worker secret for cookie protection, separate per environment; local ignored API `.dev.vars` only if needed. Generate/store privately during implementation, never now. |
| User password, access/refresh tokens, PKCE verifier | Sensitive transient input/session data; no Git, frontend build values, chat or logs. |
| SMTP credentials / future Google client secret | Later provider settings/password manager only; neither is needed now. |

No service-role/secret key, database password, management access token or `JWT_SECRET` is required by default for these user-auth flows. No real keys belong in this document or example files. Root ignores cover `.env*`/`.dev.vars*` everywhere; `git check-ignore` checks filenames without reading contents. Ignore rules do not remove already tracked secrets.

## Google later

Keep password accounts. Key application ownership by the stable Supabase user ID (`sub`), never email/provider name. Supabase documents automatic identity linking for matching emails with verification safeguards, and optional manual `linkIdentity()` for authenticated users, including different-email cases; manual linking is beta and was observed disabled. Do not create custom merges or promise every Google account maps to an existing password account. Later decide explicit linking UX, duplicate/different-email handling and unlink safeguards, then test identity continuity. [Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)

Future Google authorization should return through the same Worker PKCE/session boundary with purpose/state validation. Google's provider redirect to Supabase is separate from Supabase's allowlisted callback to this application. No Google IDs/secrets or provider setup now. UI locale and CV language remain separate preferences, independent of login identity/provider.

## Future checks after implementation

These checks are planned, **not run against nonexistent auth code**; use synthetic accounts and authorized team recipients only.

| Check | Expected result |
| --- | --- |
| Signup/confirmation | Unconfirmed user cannot access app; valid confirmation works; expired/replayed link fails safely; verify actual email receipt separately. |
| Login | Confirmed valid credentials work; wrong password/unknown account produce equivalent safe errors. |
| Recovery | Known/unknown addresses get generic responses; valid bound callback allows update; missing verifier, ordinary login/confirmation code, expired/replayed link and direct reset-page visit cannot. Old password fails after update; new login works. |
| Cookie/CSRF | JavaScript cannot read tokens; flags/host/path and local HTTPS behavior verified; forged origin/missing CSRF/tampered cookie rejected; callbacks/redacted logs contain no leaked credentials. |
| Refresh/logout | Rotated cookies persist, parallel refresh is safe, revoked/expired refresh fails closed, logout clears cookies; test remaining JWT lifetime rather than promising instant revocation. |
| Google later | Matching verified identity follows documented linking; different-email/manual cases follow approved UX; existing user ID/owned records and password access remain correct. |

Official references above checked 25 October 2026. No app tests, installs, migrations, schema changes, browser reconnects or hosted configuration changes were needed for this preparation.

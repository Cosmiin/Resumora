---
id: extension/auth-session
area: extension
files: ["apps/extension/src/auth.ts","apps/extension/src/auth.test.ts"]
depends_on: ["extension/storage","extension/environments","web-app/supabase"]
contract: false
checked_hash: 59c1a656
decisions: []
open: []
---
Maintain independent extension sign-in sessions for Local and Hosted.

- Auth clients are cached by EnvId and unavailable when the selected configuration is not configured. `apps/extension/src/auth.ts:28` -> `clients`; `apps/extension/src/auth.ts:32` -> `configured`
- Sessions use resumora-auth-<env> storage keys and the supplied storage adapter. `apps/extension/src/auth.ts:29` -> `resumora-auth-`; `apps/extension/src/auth.ts:38` -> `getItem`
- Sessions persist, scheduled automatic refresh is disabled, and URL session detection is disabled. `apps/extension/src/auth.ts:42` -> `storageKey`; `apps/extension/src/auth.ts:44` -> `autoRefreshToken: false`
- Access-token lookup calls Supabase getSession, which can renew an expired stored session on demand and persist renewed access and refresh tokens through the storage adapter before any API 401. `apps/extension/src/auth.ts:108` -> `client.auth.getSession()`; `apps/extension/src/auth.ts:39` -> `setItem`; `apps/extension/src/auth.ts:115` -> `data.session.access_token`
- Each auth fetch combines any caller signal with a 20-second timeout. `apps/extension/src/auth.ts:11` -> `AUTH_TIMEOUT_MS`; `apps/extension/src/auth.ts:49` -> `AbortSignal.timeout`
- Email display reads stored JSON directly without a network check; missing, malformed or non-string email returns null. `apps/extension/src/auth.ts:73` -> `async email`
- Sign-in calls signInWithPassword and converts returned or thrown errors to UI messages. `apps/extension/src/auth.ts:88` -> `signInWithPassword`
- Invalid credentials and unconfirmed email have specific messages; a retryable status-zero error gets environment-specific connection copy. `apps/extension/src/auth.ts:62` -> `signInError`
- Sign-out requests local scope and removes that environment's stored session in finally even if logout fails. `apps/extension/src/auth.ts:95` -> `async signOut`
- tested by `apps/extension/src/auth.test.ts:75` -> `environment sign-in`
- tested by `apps/extension/src/auth.test.ts:215` -> `restores and refreshes an expired stored session when getting its access token`

## Connections
- Saving obtains an access token through getSession before the first job POST, allowing on-demand session renewal before sending the API request. `apps/extension/src/save.ts:46` -> `deps.auth.accessToken`; `apps/extension/src/auth.ts:108` -> `client.auth.getSession()`; `apps/extension/src/save.ts:53` -> `post(access.token)`
- Separately, an unauthorized POST result triggers explicit refreshSession and one retry with the renewed token. `apps/extension/src/save.ts:54` -> `unauthorized`; `apps/extension/src/save.ts:55` -> `deps.auth.refresh`; `apps/extension/src/auth.ts:127` -> `client.auth.refreshSession()`; `apps/extension/src/save.ts:56` -> `post(token)`
- Popup credentials travel through the handler to this sign-in method. `apps/extension/src/popup/popup.ts:151` -> `signIn`; `apps/extension/src/handler.ts:27` -> `auth.signIn`; `apps/extension/src/auth.ts:88` -> `signInWithPassword`
- The web app creates its own Supabase client; extension clients explicitly use extension storage and environment-specific keys, with no web-session handoff in this setup. `apps/extension/src/auth.ts:35` -> `createClient`; `apps/extension/src/auth.ts:42` -> `storageKey`; `apps/web/src/lib/supabase.ts:10` -> `createClient`

## Assumptions
- Stored email is only a UI hint, not proof of authentication; actual API requests pass an access token to server verification. `apps/extension/src/auth.ts:78` -> `JSON.parse`; `apps/extension/src/api.ts:23` -> `Authorization`; `apps/api/src/app.ts:68` -> `verifyToken`
- The selected public Supabase configuration must correspond to the account system used by the selected API. `apps/extension/src/auth.ts:35` -> `config.supabaseUrl`; `apps/extension/src/save.ts:51` -> `env.apiUrl`

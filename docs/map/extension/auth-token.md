---
id: extension/auth-token
area: extension
files: ["apps/extension/src/auth.ts","apps/extension/src/auth.test.ts"]
depends_on: ["extension/auth-session","extension/storage","api-core/auth"]
contract: false
checked_hash: 59c1a656
cited: [85c8d4, 7781bb, 3223d3, d5bc2c, 391dbe, d60a23, 6f119b, dcc4d3, 6c0b2c, 85c8d4, 361705, 15f4f4, afa187, cfe3d6, f4325a, 827316, 0f61f1, 4f1c39]
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md"]
open: []
---
Resolve usable access tokens and distinguish offline, expired and missing sessions.

- accessToken returns null when no configured auth client exists. `apps/extension/src/auth.ts:102` -> `async accessToken`
- Session lookup races getSession against a 20-second timer and clears the timer when settled. `apps/extension/src/auth.ts:107` -> `Promise.race`
- A lookup timeout reports offline without removing storage; an available session returns its access_token. `apps/extension/src/auth.ts:113` -> `offline`
- Retryable auth errors report offline; other returned auth errors remove the environment session and report expired. `apps/extension/src/auth.ts:116` -> `if (error)`
- A lookup with neither session nor error returns null. `apps/extension/src/auth.ts:121` -> `return null`
- Explicit refresh returns the new access token or null on missing client, returned error or exception. `apps/extension/src/auth.ts:123` -> `async refresh`
- tested by `apps/extension/src/auth.test.ts:174` -> `request timeouts`
- tested by `apps/extension/src/auth.test.ts:214` -> `session refresh`

## Connections
- Save consumes missing/expired/offline/token results before posting. `apps/extension/src/save.ts:46` -> `accessToken`; `apps/extension/src/auth.ts:102` -> `async accessToken`
- An API 401 triggers explicit refresh and one retry; another unauthorized outcome triggers sign-out. `apps/extension/src/save.ts:54` -> `unauthorized`; `apps/extension/src/auth.ts:127` -> `refreshSession`; `apps/extension/src/auth.ts:95` -> `async signOut`
- Bearer tokens ultimately reach Supabase claim verification on the API. `apps/extension/src/api.ts:23` -> `Bearer`; `apps/api/src/app.ts:68` -> `verifyToken`; `apps/api/src/auth.ts:16` -> `getClaims`

## Assumptions
- A getSession result is used as the token source; server verification remains responsible for accepting it. `apps/extension/src/auth.ts:115` -> `data.session.access_token`; `apps/api/src/auth.ts:19` -> `return null`

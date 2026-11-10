---
id: web-app/api-client
area: web-app
files: ["apps/web/src/lib/api.ts","apps/web/src/lib/api-error.ts","apps/web/src/lib/api.test.ts"]
depends_on: ["web-app/supabase","shared/api-responses","api-core/auth","api-core/errors"]
contract: false
checked_hash: 1a5a2777
decisions: ["docs/decisions/0001-an-api-between-browser-and-database.md","docs/decisions/0002-the-api-acts-as-the-signed-in-user.md"]
open: []
---
Send authenticated browser requests, refresh sessions and validate JSON responses.

- ApiInit requires a response schema for apiFetch and replaces RequestInit.body with optional json or form inputs. `apps/web/src/lib/api.ts:10` -> `ApiInit`
- send copies headers, overwrites authorization when a token exists, and sets JSON content type only when json is defined. `apps/web/src/lib/api.ts:13` -> `Headers`
- FormData wins over serialized json for the body; the helper does not explicitly set multipart boundaries. Supplying both form and json would still set the JSON header. `apps/web/src/lib/api.ts:15` -> `content-type`; `apps/web/src/lib/api.ts:20` -> `init.form ??`
- Any fetch rejection, including an aborted fetch, becomes ApiClientError with status 0 and code network. `apps/web/src/lib/api.ts:22` -> `catch`
- authedFetch reads the current session for each call and can send a request with no session token. `apps/web/src/lib/api.ts:33` -> `getSession`
- Only an initial 401 triggers refreshSession; an AuthRetryableFetchError during refresh produces network without explicit sign-out. `apps/web/src/lib/api.ts:36` -> `res.status === 401`
- A refreshed token causes one repeat of the same request; an unresolved 401 signs out, including when refresh supplies no token. `apps/web/src/lib/api.ts:41` -> `access_token`
- Other response statuses are returned unchanged by authedFetch, for streaming and DELETE callers to inspect. `apps/web/src/lib/api.ts:45` -> `return res`
- errorOf accepts a shared error envelope's code/message; otherwise it generates http_<status> and a generic message. `apps/web/src/lib/api.ts:50` -> `ErrorBodySchema.safeParse`
- apiFetch maps unreadable JSON to null, throws ApiClientError on non-2xx, and schema-parses successful bodies; schema failures are not converted to ApiClientError. `apps/web/src/lib/api.ts:61` -> `res.json()`; `apps/web/src/lib/api.ts:66` -> `init.schema.parse`
- ApiClientError retains status, code and parsed body, while Error carries the message; body defaults to null. `apps/web/src/lib/api-error.ts:4` -> `readonly status`
- tested by `apps/web/src/lib/api.test.ts:40` -> `retries once after refresh`
- tested by `apps/web/src/lib/api.test.ts:57` -> `keeps the session`
## Connections
- The bearer header reaches the API's /v1 authentication middleware and claim verifier: `apps/web/src/lib/api.ts:14` -> `authorization`; `apps/api/src/app.ts:66` -> `authorization`; `apps/api/src/auth.ts:16` -> `getClaims`
- Used by the CV client and raw-response job deletion: `apps/web/src/cv/cv-api.ts:15` -> `apiFetch`; `apps/web/src/lib/api.ts:56` -> `apiFetch`; `apps/web/src/jobs/jobs-api.ts:51` -> `authedFetch`; `apps/web/src/lib/api.ts:32` -> `authedFetch`
## Assumptions
- The URL is trusted by callers: the helper attaches a session bearer token to the supplied path without an origin allowlist. `apps/web/src/lib/api.ts:14` -> `Bearer`; `apps/web/src/lib/api.ts:17` -> `fetch(path`
- A 401 retry reuses init and its body, so callers must supply replayable request data. `apps/web/src/lib/api.ts:42` -> `send(path, init, token)`

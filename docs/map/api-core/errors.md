---
id: api-core/errors
area: api-core
files: ["apps/api/src/errors.ts","apps/api/test/app.test.ts"]
depends_on: ["shared/api-responses"]
contract: true
checked_hash: ce37a0e0
decisions: []
open: []
---
Translate thrown errors into the API envelope and structured server logs.

- errorBody returns exactly error.code, error.message and error.requestId. `apps/api/src/errors.ts:18` -> `errorBody`
- ApiError passes its status, code and message through without logging, including if its status is 5xx. `apps/api/src/errors.ts:32` -> `ApiError`
- Zod failures become 400 invalid_content with only the first issue and its dotted path. `apps/api/src/errors.ts:35` -> `ZodError`
- Other thrown values log request id, path, String(err) and an Error stack. `apps/api/src/errors.ts:43` -> `ctx.log`
- Unknown failures return a generic 500 internal message instead of the thrown text. `apps/api/src/errors.ts:50` -> `return`
- tested by `apps/api/test/app.test.ts:31` -> `describe`

## Connections
- Hono forwards context to the translator: `apps/api/src/app.ts:126` -> `toErrorResponse` -> `apps/api/src/errors.ts:28` -> `toErrorResponse`.
- Voice unavailability is a concrete 503 ApiError that takes the unlogged branch: `apps/api/src/enrich/routes.ts:205` -> `ApiError` -> `apps/api/src/errors.ts:32` -> `ApiError`.
- Version conflicts reuse the envelope with an added current version: `apps/api/src/cv/routes.ts:32` -> `errorBody` -> `apps/api/src/errors.ts:18` -> `errorBody`.

## Assumptions
- The injected logger must not throw; the generic-error path calls it synchronously without a catch. `apps/api/src/errors.ts:43` -> `ctx.log`
- Raw error strings/stacks may contain details from dependencies; this layer performs no redaction before logging. `apps/api/src/errors.ts:47` -> `String(err)`

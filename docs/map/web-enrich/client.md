---
id: web-enrich/client
area: web-enrich
files: ["apps/web/src/cv/enrich/enrich-api.ts","apps/web/src/cv/enrich/enrich-api.test.ts"]
depends_on: ["web-enrich/client-focus","web-enrich/client-sections","web-enrich/stream","api-enrich/routes","api-enrich/score","shared/enrichment-score","shared/api-responses","api-core/auth"]
contract: true
checked_hash: a920472a
cited: [82af5b, f639d9, c88f16, e964a0, d5306d, f4c845, c64624, 4cf21b, c6ca9e, f639d9, 747e41, c88f16, 241ac4, c104c8, 72f45a, d6c40f, 4e7f79, 556064, f4325a, d2dc21, 6ddf92, d09660]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Validate score JSON responses and share authenticated enrichment error handling.

- GET scores unwraps `{items: RoleResult[]}`; POST score sends `{roleId, fingerprint}` and includes optional `fresh` only when truthy, parsing a bare RoleResult. `apps/web/src/cv/enrich/enrich-api.ts:23` -> `ScoresSchema`; `apps/web/src/cv/enrich/enrich-api.ts:27` -> `items`; `apps/web/src/cv/enrich/enrich-api.ts:35` -> `RoleResultSchema`
- RoleResult carries roleId, policy, fingerprint, nullable score, per-bullet grades/issues/tips/questions, nextStep, questions, roleQuestions and thin. `packages/shared/src/enrich.ts:82` -> `roleId`; `packages/shared/src/enrich.ts:89` -> `id`; `packages/shared/src/enrich.ts:101` -> `nextStep`
- JSON failures preserve HTTP status and server error code through ApiClientError; schema-invalid successful responses throw during parsing. This layer does not choose UI recovery for 502 ai_bad_answer or 503 ai_unavailable. `apps/web/src/lib/api.ts:60` -> `authedFetch`; `apps/web/src/lib/api.ts:64` -> `ApiClientError`; `apps/web/src/lib/api.ts:66` -> `parse`

## Connections

- Uses GET /v1/enrich/scores and POST /v1/enrich/score, mounted under /v1/enrich. `apps/web/src/cv/enrich/enrich-api.ts:27` -> `/v1/enrich/scores`; `apps/api/src/enrich/routes.ts:53` -> `app.get`; `apps/web/src/cv/enrich/enrich-api.ts:35` -> `/v1/enrich/score`; `apps/api/src/enrich/routes.ts:55` -> `app.post`; `apps/api/src/app.ts:80` -> `/v1/enrich`
- Uses authenticated fetch for JSON and streaming; authentication refresh retries a 401 once and signs out after a remaining 401. `apps/web/src/cv/enrich/enrich-api.ts:21` -> `authedFetch`; `apps/web/src/lib/api.ts:32` -> `authedFetch`; `apps/web/src/lib/api.ts:36` -> `401`

## Assumptions

- Identity comes from the authenticated transport and server middleware, not role IDs supplied by the browser. `apps/web/src/lib/api.ts:14` -> `authorization`; `apps/api/src/app.ts:68` -> `verifyToken`; `apps/api/src/enrich/routes.ts:58` -> `c.get("user")`
- Role generation reads saved content, so the supplied fingerprint must match the server's role; a mismatch raises 409 not_saved. `apps/api/src/enrich/score.ts:61` -> `deps.cv.get`; `apps/api/src/enrich/score.ts:69` -> `throw notSaved()`

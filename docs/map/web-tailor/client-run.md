---
id: web-tailor/client-run
area: web-tailor
files: ["apps/web/src/tailor/tailor-api.ts","apps/web/src/tailor/tailor-flow.test.tsx","apps/web/src/tailor/steering.test.tsx"]
depends_on: ["shared/tailoring","api-tailor/routes","api-tailor/start","api-tailor/steering","api-tailor/retailor","api-core/job-routes","api-core/auth","db/tailoring-runs"]
contract: true
checked_hash: 024db43a
decisions: []
open: []
---
Validate run, steering, tone-example and score HTTP responses.

- startTailoring POSTs Steering and validates {run, tailoredCvId, language}, although its declared return type exposes only run. `apps/web/src/tailor/tailor-api.ts:22` -> `startTailoring`
- getRun parses a bare TailorRun; dynamic run and job ids are URL-encoded. `apps/web/src/tailor/tailor-api.ts:8` -> `encodeURIComponent`; `apps/web/src/tailor/tailor-api.ts:29` -> `getRun`
- getScores validates nullable base and tailored MatchScores. `apps/web/src/tailor/tailor-api.ts:59` -> `getScores`
- Tone examples POSTs an empty object and validates nullable bullet plus nullable tone-to-string record. `apps/web/src/tailor/tailor-api.ts:66` -> `getToneExamples`
- Changing steering POSTs Steering and parses {run}; reading steering unwraps {steering: SteeringSchema}. `apps/web/src/tailor/tailor-api.ts:88` -> `changeSteering`; `apps/web/src/tailor/tailor-api.ts:94` -> `SteeringSchema`
- Response validation and HTTP failures are delegated to apiFetch, which throws ApiClientError on non-OK and parses successful JSON. `apps/web/src/tailor/tailor-api.ts:6` -> `apiFetch`; `apps/web/src/lib/api.ts:64` -> `ApiClientError`
- tested by `apps/web/src/tailor/tailor-flow.test.tsx:74` -> `it`
- tested by `apps/web/src/tailor/steering.test.tsx:35` -> `it`

## Connections

- Uses POST /v1/jobs/:id/tailor. `apps/web/src/tailor/tailor-api.ts:23` -> `/tailor`; `apps/api/src/tailor/routes.ts:36` -> `app.post`
- Uses GET /v1/tailor-runs/:id. `apps/web/src/tailor/tailor-api.ts:30` -> `apiFetch`; `apps/api/src/tailor/routes.ts:67` -> `app.get`
- Uses GET /v1/jobs/:id/score. `apps/web/src/tailor/tailor-api.ts:60` -> `/score`; `apps/api/src/jobs/routes.ts:90` -> `app.get`
- Uses POST /v1/jobs/:id/tone-examples. `apps/web/src/tailor/tailor-api.ts:67` -> `/tone-examples`; `apps/api/src/tailor/routes.ts:49` -> `app.post`
- Uses POST and GET /v1/tailor-runs/:id/steering. `apps/web/src/tailor/tailor-api.ts:89` -> `/steering`; `apps/api/src/tailor/routes.ts:133` -> `app.post`; `apps/web/src/tailor/tailor-api.ts:94` -> `/steering`; `apps/api/src/tailor/routes.ts:125` -> `app.get`

- Uses the /v1 run-route mount and /v1/jobs score-route mount. `apps/web/src/tailor/tailor-api.ts:8` -> `/v1/tailor-runs`; `apps/api/src/app.ts:95` -> `/v1`; `apps/web/src/tailor/tailor-api.ts:60` -> `/v1/jobs`; `apps/api/src/app.ts:82` -> `/v1/jobs`
- Run reads query by id and depend on tailor_runs owner RLS; the repository supplies the user's bearer token. `apps/api/src/tailor/routes.ts:60` -> `getRun`; `apps/api/src/tailor/supabase-repo.ts:170` -> `eq("id", id)`; `supabase/migrations/20261108000000_tailoring.sql:84` -> `auth.uid()`; `apps/api/src/tailor/supabase-repo.ts:18` -> `Authorization`

## Assumptions

- Ownership is enforced beyond this client: the transport supplies the bearer token and the app constructs the tailor repository from the authenticated user. `apps/web/src/lib/api.ts:14` -> `authorization`; `apps/api/src/app.ts:101` -> `c.get`

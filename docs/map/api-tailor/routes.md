---
id: api-tailor/routes
area: api-tailor
files: ["apps/api/src/tailor/routes.ts","apps/api/test/tailor-start.test.ts"]
depends_on: ["shared/tailoring","api-core/app","api-core/auth","api-core/errors","db/tailoring-runs","api-tailor/start","api-tailor/steering","api-tailor/retailor","api-tailor/section-routes"]
contract: true
checked_hash: 1ead7ce3
decisions: ["docs/decisions/0001-an-api-between-browser-and-database.md","docs/decisions/0002-the-api-acts-as-the-signed-in-user.md"]
open: []
---
Mount authenticated tailoring routes and handle start, run reads, tone examples and steering.

- POST job tailor parses SteeringSchema with invalid JSON falling back to {}, trims instruction and rejects non-UUID job IDs as 404 `apps/api/src/tailor/routes.ts:36` -> `/jobs/:id/tailor`; `apps/api/src/tailor/routes.ts:39` -> `SteeringSchema.parse`; `apps/api/src/tailor/routes.ts:40` -> `isUuid`; `apps/api/src/tailor/routes.ts:43` -> `instruction.trim()`.
- Tone examples require job existence but not ready status; they read current Base CV and call toneExamples `apps/api/src/tailor/routes.ts:49` -> `/tone-examples`; `apps/api/src/tailor/routes.ts:51` -> `deps.jobsFor(c).get`; `apps/api/src/tailor/routes.ts:54` -> `deps.cvFor(c).get`.
- Every run lookup checks UUID, run existence and parent job existence, collapsing failures to 404 job_not_found `apps/api/src/tailor/routes.ts:58` -> `runWithJob`; `apps/api/src/tailor/routes.ts:60` -> `isUuid`; `apps/api/src/tailor/routes.ts:63` -> `jobNotFound`.
- GET steering returns only stored merged steering; POST steering resets through restartWithSteering and returns a new run `apps/api/src/tailor/routes.ts:127` -> `getSteering`; `apps/api/src/tailor/routes.ts:129` -> `stored.steering`; `apps/api/src/tailor/routes.ts:136` -> `restartWithSteering`.
- tested by `apps/api/test/tailor-start.test.ts:140` -> `GET /v1/tailor-runs/:id`.

## Connections

- Mounted at /v1 behind bearer verification, with repositories selected from authenticated user `apps/api/src/app.ts:65` -> `app.use("/v1/*"`; `apps/api/src/app.ts:95` -> `"/v1"`; `apps/api/src/app.ts:96` -> `tailorRoutes`; `apps/api/src/tailor/routes.ts:26` -> `tailorRoutes`; `apps/api/src/app.ts:101` -> `c.get("user")`.
- Used by web start and tone URLs `apps/web/src/tailor/tailor-api.ts:23` -> `/tailor`; `apps/api/src/tailor/routes.ts:36` -> `/jobs/:id/tailor`; `apps/web/src/tailor/tailor-api.ts:67` -> `/tone-examples`; `apps/api/src/tailor/routes.ts:49` -> `/tone-examples`.
- Used by web run GET URL `apps/web/src/tailor/tailor-api.ts:8` -> `/v1/tailor-runs/`; `apps/web/src/tailor/tailor-api.ts:30` -> `apiFetch(run(id)`; `apps/api/src/tailor/routes.ts:67` -> `/tailor-runs/:id`.
- Used by web GET/POST steering URLs `apps/web/src/tailor/tailor-api.ts:94` -> `/steering`; `apps/api/src/tailor/routes.ts:125` -> `/steering`; `apps/web/src/tailor/tailor-api.ts:89` -> `/steering`; `apps/api/src/tailor/routes.ts:133` -> `/steering`.
- Uses run read RLS through repository ID lookup `apps/api/src/tailor/routes.ts:60` -> `getRun`; `apps/api/src/tailor/supabase-repo.ts:170` -> `from("tailor_runs")`; `supabase/migrations/20261108000000_tailoring.sql:83` -> `own tailor runs: read`; `supabase/migrations/20261108000000_tailoring.sql:84` -> `auth.uid()`.
- Hosts api-tailor/section-routes, whose handlers reuse runWithJob `apps/api/src/tailor/routes.ts:26` -> `tailorRoutes`; `apps/api/src/tailor/routes.ts:69` -> `/questions`; `apps/api/src/tailor/routes.ts:72` -> `runWithJob`; `apps/api/src/tailor/routes.ts:58` -> `runWithJob`.

## Assumptions

- Handlers rely on upstream authentication and user-scoped repositories, not explicit run.userId comparisons `apps/api/src/tailor/routes.ts:60` -> `deps.tailorFor(c)`; `apps/api/src/app.ts:68` -> `verifyToken`; `apps/api/src/app.ts:101` -> `c.get("user")`.

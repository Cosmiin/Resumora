---
id: web-app/jobs-client
area: web-app
files: ["apps/web/src/jobs/jobs-api.ts","apps/web/src/jobs/jobs-api.test.ts"]
depends_on: ["web-app/api-client","shared/jobs","shared/match-score","api-core/job-routes","db/jobs-repository","db/jobs","api-core/job-queue"]
contract: false
checked_hash: efc6281f
cited: [b51899, 889221, 73c317, 83e152, cb7207, 6de013, ee0bc4, b48a4d, e53712, 5f0792, 01368d, dd6e08, 01a1ad, f13403, 889221, 5e358a, 8a680e, a18282, c47b0d, cb7207, 14cb8f, 7cf99d, 80db86, b48a4d, 110495, 870c84, 5b4070, 41b18c, 498f4a, c6a1fc, 94fef5, fc9d94, f03be8, 83e152, b0bdfb, 81255a, 061512, 7a7534, 8eb8be, 6349e0, 5142bb, b48a4d, 870c84]
decisions: ["docs/decisions/0001-an-api-between-browser-and-database.md","docs/decisions/0002-the-api-acts-as-the-signed-in-user.md"]
open: []
---
Provide schema-checked job CRUD and score requests.

- List requests always use limit=50 and optionally URL-encode a cursor, validating JobListPageSchema. `apps/web/src/jobs/jobs-api.ts:14` -> `encodeURIComponent(cursor)`
- Job detail requests encode the ID and validate JobSchema. `apps/web/src/jobs/jobs-api.ts:19` -> `JobSchema`
- Create posts url and pageText; its local response schema defaults an omitted existing flag to false. `apps/web/src/jobs/jobs-api.ts:10` -> `default(false)`; `apps/web/src/jobs/jobs-api.ts:24` -> `json: { url, pageText }`
- GET and POST score calls validate nullable base and tailored MatchScore objects. `apps/web/src/jobs/jobs-api.ts:29` -> `/score`; `apps/web/src/jobs/jobs-api.ts:37` -> `MatchScoreSchema.nullable`
- patchJob always sends version and the full extracted job, then spreads optional userThoughts/applicationStatus changes. `apps/web/src/jobs/jobs-api.ts:42` -> `extracted: JobExtraction`; `apps/web/src/jobs/jobs-api.ts:46` -> `json: { version, extracted, ...changes }`
- DELETE accepts exactly 204 without JSON parsing; any other status becomes ApiClientError using the standard body/code mapping, even another 2xx. `apps/web/src/jobs/jobs-api.ts:52` -> `res.status === 204`
- tested by `apps/web/src/jobs/jobs-api.test.ts:112` -> `sends the version`
- tested by `apps/web/src/jobs/jobs-api.test.ts:136` -> `without reading a JSON body`
## Connections
- GET list and detail: `apps/web/src/jobs/jobs-api.ts:15` -> `/v1/jobs`; `apps/api/src/app.ts:82` -> `/v1/jobs`; `apps/api/src/jobs/routes.ts:72` -> `app.get`; `apps/web/src/jobs/jobs-api.ts:19` -> `/v1/jobs/`; `apps/api/src/jobs/routes.ts:83` -> `/:id`
- POST creation shares its endpoint with the extension: `apps/web/src/jobs/jobs-api.ts:23` -> `/v1/jobs`; `apps/extension/src/api.ts:21` -> `/v1/jobs`; `apps/api/src/jobs/routes.ts:29` -> `app.post`
- GET score and POST missing-score computation: `apps/web/src/jobs/jobs-api.ts:29` -> `/score`; `apps/api/src/jobs/routes.ts:90` -> `app.get`; `apps/web/src/jobs/jobs-api.ts:36` -> `/score`; `apps/api/src/jobs/routes.ts:99` -> `app.post`
- PATCH version/extraction validation and conflict response: `apps/web/src/jobs/jobs-api.ts:46` -> `PATCH`; `apps/api/src/jobs/routes.ts:115` -> `app.patch`; `apps/api/src/jobs/routes.ts:117` -> `JobPatchBodySchema`; `apps/api/src/jobs/routes.ts:121` -> `version_conflict`
- DELETE handler produces the client's required status: `apps/web/src/jobs/jobs-api.ts:51` -> `DELETE`; `apps/api/src/jobs/routes.ts:128` -> `app.delete`; `apps/api/src/jobs/routes.ts:131` -> `204`
- Uses the user-scoped repository and jobs ownership policies: `apps/api/src/jobs/supabase-repo.ts:42` -> `Authorization`; `supabase/migrations/20261107000000_jobs.sql:41` -> `auth.uid()`; `supabase/migrations/20261107000000_jobs.sql:45` -> `auth.uid()`
- Job creation queues the job ID consumed by background extraction; its ready result is what list/detail polling observes: `apps/web/src/jobs/jobs-api.ts:24` -> `POST`; `apps/api/src/jobs/routes.ts:64` -> `deps.queue.send`; `apps/api/src/jobs/consumer.ts:23` -> `msg.body.jobId`
- Job insertion invokes jobs_add_run, whose job_runs insertion invokes the daily-limit trigger: `apps/api/src/jobs/supabase-repo.ts:52` -> `.insert`; `supabase/migrations/20261107000000_jobs.sql:89` -> `jobs_add_run`; `supabase/migrations/20261107000000_jobs.sql:84` -> `insert into public.job_runs`; `supabase/migrations/20261107000000_jobs.sql:72` -> `job_runs_limit`; `supabase/migrations/20261107000000_jobs.sql:74` -> `check_job_limit`

## Assumptions
- Browser validation is on responses; the API must validate mutation inputs and enforce ownership/version checks. `apps/web/src/jobs/jobs-api.ts:46` -> `schema: JobSchema`; `apps/api/src/jobs/routes.ts:117` -> `JobPatchBodySchema.parse`

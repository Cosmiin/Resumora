---
id: api-core/job-routes
area: api-core
files: ["apps/api/src/jobs/routes.ts","apps/api/test/jobs.test.ts","apps/api/test/jobs-repo.test.ts","apps/api/test/supabase-repo.test.ts"]
depends_on: ["shared/jobs","shared/match-score","db/jobs","db/jobs-repository","db/match-scores-repository","api-core/job-queue","api-core/call-model"]
contract: true
checked_hash: 9d314d26
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Create, list, edit and delete captured jobs, and retrieve or fill missing match scores.

- Creation checks both declared and actual body bytes against 100 KiB; malformed JSON becomes schema-invalid input. `apps/api/src/jobs/routes.ts:12` -> `MAX_BODY_BYTES`, `apps/api/src/jobs/routes.ts:30` -> `content-length`
- URL errors become invalid_url; absent/short page text becomes text_too_short. `apps/api/src/jobs/routes.ts:39` -> `safeParse`, `apps/api/src/jobs/routes.ts:48` -> `tooShort`
- Normalized-URL duplicates return the existing id before quota checks; newly captured text is truncated to 30,000 characters, filtered to one JobPosting JSON-LD and stored with source extension even for web callers. `apps/api/src/jobs/routes.ts:51` -> `normalizeJobUrl`, `apps/api/src/jobs/routes.ts:58` -> `repo.create`
- A successful new insert sends {jobId,userId} and returns 202; enqueue failure removes the job then rethrows. `apps/api/src/jobs/routes.ts:62` -> `created.existing`
- Listing validates query and decoded cursor; response exposes nextCursor instead of the internal cursor object. `apps/api/src/jobs/routes.ts:74` -> `JobListQuerySchema`
- GET score verifies job existence and returns base/tailored scores; POST requires a ready extraction and only creates a missing base score. `apps/api/src/jobs/routes.ts:92` -> `isUuid`, `apps/api/src/jobs/routes.ts:103` -> `job.status`
- PATCH distinguishes missing, version conflict and wrong status, then rereads the updated job; DELETE returns 204 only after successful removal. `apps/api/src/jobs/routes.ts:117` -> `JobPatchBodySchema`, `apps/api/src/jobs/routes.ts:128` -> `app.delete`
- tested by `apps/api/test/jobs.test.ts:83` -> `job endpoints`, `apps/api/test/jobs.test.ts:85` -> `create`

## Connections
- Extension/web POST creation: `apps/extension/src/api.ts:21` -> `/v1/jobs` and `apps/web/src/jobs/jobs-api.ts:23` -> `/v1/jobs` -> `apps/api/src/jobs/routes.ts:29` -> `app.post`; mount `apps/api/src/app.ts:82` -> `/v1/jobs`.
- Web list/detail: `apps/web/src/jobs/jobs-api.ts:15` -> `/v1/jobs?limit=50` -> `apps/api/src/jobs/routes.ts:72` -> `app.get`; `apps/web/src/jobs/jobs-api.ts:19` -> `encodeURIComponent` -> `apps/api/src/jobs/routes.ts:83` -> `/:id`.
- Web score GET/POST: `apps/web/src/jobs/jobs-api.ts:29` -> `/score` -> `apps/api/src/jobs/routes.ts:90` -> `/:id/score`; `apps/web/src/jobs/jobs-api.ts:36` -> `/score` -> `apps/api/src/jobs/routes.ts:99` -> `/:id/score`. Tailor client also posts here: `apps/web/src/tailor/tailor-api.ts:60` -> `/score` -> `apps/api/src/jobs/routes.ts:99` -> `/:id/score`.
- Web PATCH/DELETE: `apps/web/src/jobs/jobs-api.ts:45` -> `encodeURIComponent` -> `apps/api/src/jobs/routes.ts:115` -> `app.patch`; `apps/web/src/jobs/jobs-api.ts:51` -> `DELETE` -> `apps/api/src/jobs/routes.ts:128` -> `app.delete`.
- Creation inserts through the repository and triggers quota accounting: `apps/api/src/jobs/routes.ts:58` -> `repo.create` -> `apps/api/src/jobs/supabase-repo.ts:52` -> `insert` -> `supabase/migrations/20261107000000_jobs.sql:89` -> `jobs_add_run` -> `supabase/migrations/20261107000000_jobs.sql:91` -> `add_job_run` -> `supabase/migrations/20261107000000_jobs.sql:77` -> `add_job_run`.
- Nested run insert triggers the serialized daily limit: `supabase/migrations/20261107000000_jobs.sql:84` -> `insert into public.job_runs` -> `supabase/migrations/20261107000000_jobs.sql:72` -> `job_runs_limit` -> `supabase/migrations/20261107000000_jobs.sql:74` -> `check_job_limit` -> `supabase/migrations/20261107000000_jobs.sql:56` -> `check_job_limit`.
- Queue producer and payload: `apps/api/src/jobs/routes.ts:64` -> `queue.send` -> `apps/api/src/jobs/repo.ts:5` -> `JobMessage` -> `apps/api/src/jobs/consumer.ts:23` -> `msg.body.jobId`.
- Missing-score computation: `apps/api/src/jobs/routes.ts:107` -> `scoreMatch` -> `apps/api/src/tailor/score.ts:46` -> `callModel`.

## Assumptions
- URL lookup/list/get/patch/delete trust user-scoped RLS instead of filtering user_id. `apps/api/src/jobs/supabase-repo.ts:42` -> `Authorization`, `apps/api/src/jobs/supabase-repo.ts:45` -> `url_normalized`, `apps/api/src/jobs/supabase-repo.ts:72` -> `jobs`, `apps/api/src/jobs/supabase-repo.ts:85` -> `jobs`, `apps/api/src/jobs/supabase-repo.ts:106` -> `eq`, `apps/api/src/jobs/supabase-repo.ts:115` -> `delete`
- Quota counts job_runs, so removing an enqueued job does not refund its recorded run; job deletion sets job_runs.job_id null. `apps/api/src/jobs/supabase-repo.ts:67` -> `job_runs`, `supabase/migrations/20261107000000_jobs.sql:30` -> `on delete set null`

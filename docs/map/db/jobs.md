---
id: db/jobs
area: db
files: ["supabase/migrations/20261107000000_jobs.sql","supabase/migrations/20261108000000_tailoring.sql","supabase/migrations/20261109200000_tailor_r2.sql","supabase/tests/database/jobs.test.sql","supabase/migrations/20261110130000_drop_job_thoughts.sql","supabase/tests/database/tailoring.test.sql"]
depends_on: ["db/jobs-repository","shared/jobs"]
contract: true
checked_hash: 0ec3ab30
cited: [cc3da5, 70ef19, 8d0942, 58667c, 54979d, c4f61e, b9bf88, a4742f, 99acd7, eb4574, ba4e12, e825a7, bdfbd3, 6349e0, 7e7db9, 8eb8be, 7a7534, 08482b, 8663c0, 89e3c5, 1df218, 554eb9, 061512, 7a7534, edf74a, 7e7db9, 8eb8be, 6349e0, 5142bb, e825a7, 0a73a1, fc9d94, 18fad5, 878197, 79f65c, 976a60, 373579, 2e0783, 99acd7, f03be8, f391ee]
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Store owned jobs and retain extraction quota usage even after a job is deleted.

- Jobs are unique by user_id/url_normalized, default to queued/version 1, restrict source/status/error enums, and cascade auth-user deletion. `supabase/migrations/20261107000000_jobs.sql:4` -> `user_id`, `supabase/migrations/20261107000000_jobs.sql:9` -> `status in`, `supabase/migrations/20261107000000_jobs.sql:23` -> `unique`
- job_runs survives job deletion with job_id set null; deleting the user cascades its runs. `supabase/migrations/20261107000000_jobs.sql:29` -> `user_id`, `supabase/migrations/20261107000000_jobs.sql:30` -> `on delete set null`
- Current original job policies allow owners SELECT/INSERT/UPDATE/DELETE; updates preserve ownership. `supabase/migrations/20261107000000_jobs.sql:40` -> `own jobs: read`, `supabase/migrations/20261107000000_jobs.sql:44` -> `own jobs: update`, `supabase/migrations/20261107000000_jobs.sql:46` -> `own jobs: delete`
- Current original job_runs policies permit owner SELECT/INSERT only; although table grants include UPDATE/DELETE, no policies permit those operations. Insert checks only user_id, not ownership of job_id. `supabase/migrations/20261107000000_jobs.sql:38` -> `grant select, insert, update, delete`, `supabase/migrations/20261107000000_jobs.sql:50` -> `own job runs: read`, `supabase/migrations/20261107000000_jobs.sql:53` -> `with check`
- Current original check_job_limit() locks per user and rejects a run when 30 already exist in the strict last 24 hours; original job_runs_limit executes it BEFORE INSERT. `supabase/migrations/20261107000000_jobs.sql:56` -> `check_job_limit`, `supabase/migrations/20261107000000_jobs.sql:63` -> `pg_advisory_xact_lock`, `supabase/migrations/20261107000000_jobs.sql:72` -> `job_runs_limit`
- Current original add_job_run() inserts a run for each new job through original AFTER INSERT jobs_add_run; failure in the nested run insert aborts the job insertion too. `supabase/migrations/20261107000000_jobs.sql:77` -> `add_job_run`, `supabase/migrations/20261107000000_jobs.sql:84` -> `insert into public.job_runs`, `supabase/migrations/20261107000000_jobs.sql:89` -> `jobs_add_run`
- Tailoring adds an enumerated application status defaulting to saved; round two adds nullable tone_examples JSONB. `supabase/migrations/20261108000000_tailoring.sql:4` -> `application_status`, `supabase/migrations/20261109200000_tailor_r2.sql:12` -> `tone_examples`
- tested by `supabase/tests/database/jobs.test.sql:104` -> `the rejected job insert leaves the job count unchanged`

- The new migration drops the job note column and its saved contents. `supabase/migrations/20261110130000_drop_job_thoughts.sql:1` -> `drop column if exists user_thoughts`; absence is tested by `supabase/tests/database/tailoring.test.sql:24` -> `hasnt_column`.

## Connections

- Job creation triggers quota accounting: `apps/api/src/jobs/supabase-repo.ts:51` -> `insert` -> `supabase/migrations/20261107000000_jobs.sql:89` -> `jobs_add_run`; trigger target `supabase/migrations/20261107000000_jobs.sql:91` -> `add_job_run` -> `supabase/migrations/20261107000000_jobs.sql:77` -> `add_job_run`.
- Run insertion invokes quota enforcement: `supabase/migrations/20261107000000_jobs.sql:84` -> `insert into public.job_runs` -> `supabase/migrations/20261107000000_jobs.sql:72` -> `job_runs_limit`; trigger target `supabase/migrations/20261107000000_jobs.sql:74` -> `check_job_limit` -> `supabase/migrations/20261107000000_jobs.sql:56` -> `check_job_limit`.
- User queries rely on separate job/run policies: `apps/api/src/jobs/supabase-repo.ts:84` -> `from("jobs")` -> `supabase/migrations/20261107000000_jobs.sql:41` -> `auth.uid()`; `apps/api/src/jobs/supabase-repo.ts:66` -> `from("job_runs")` -> `supabase/migrations/20261107000000_jobs.sql:51` -> `auth.uid()`.
- The SQL quota must stay synchronized with its TypeScript copy: `supabase/migrations/20261107000000_jobs.sql:65` -> `>= 30` matches `apps/api/src/jobs/repo.ts:4` -> `JOBS_PER_DAY`; the API checks it before create at `apps/api/src/jobs/routes.ts:55` -> `JOBS_PER_DAY`, and the fake enforces it at `apps/api/src/jobs/memory-repo.ts:35` -> `JOBS_PER_DAY`.

## Assumptions

- Direct owner writes can alter job status, extraction and version because RLS checks identity, not the repository's ready/version workflow. `supabase/migrations/20261107000000_jobs.sql:38` -> `grant select, insert, update, delete`, `supabase/migrations/20261107000000_jobs.sql:45` -> `with check`, `apps/api/src/jobs/supabase-repo.ts:104` -> `eq("status", "ready")`

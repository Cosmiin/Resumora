---
id: extension/api
area: extension
files: ["apps/extension/src/api.ts","apps/extension/src/api.test.ts"]
depends_on: ["shared/jobs","shared/api-responses","api-core/job-routes","api-core/auth","api-core/job-queue","db/jobs-repository","db/jobs"]
contract: false
checked_hash: a9098836
decisions: ["docs/decisions/0001-an-api-between-browser-and-database.md","docs/decisions/0002-the-api-acts-as-the-signed-in-user.md"]
open: []
---
POST captured page data and translate HTTP outcomes into save results.

- postJob strips trailing API-base slashes and POSTs JSON to /v1/jobs with a Bearer token. `apps/extension/src/api.ts:21` -> `/v1/jobs`
- The injected fetch is detached into send before invocation. `apps/extension/src/api.ts:17` -> `fetch: send`
- 401 maps immediately to unauthorized without reading JSON. `apps/extension/src/api.ts:27` -> `401`
- A string id plus 202 means saved; 200 means existing only when existing is exactly true. `apps/extension/src/api.ts:29` -> `"id" in body`
- Other responses are failed; malformed JSON becomes null and error envelopes are validated with ErrorBodySchema. `apps/extension/src/api.ts:28` -> `response.json`; `apps/extension/src/api.ts:40` -> `ErrorBodySchema`
- A missing error-body requestId is filled from x-request-id; otherwise the body field is retained before validation. `apps/extension/src/api.ts:35` -> `x-request-id`
- The default 20-second timeout aborts the request and resolves network; thrown requests also become network, and the timer is cleared. `apps/extension/src/api.ts:50` -> `Promise.race`; `apps/extension/src/api.ts:56` -> `20_000`; `apps/extension/src/api.ts:59` -> `catch`
- tested by `apps/extension/src/api.test.ts:9` -> `postJob`

## Connections
- Caller and API route: postJob POSTs to the /v1/jobs mount and its root POST handler. `apps/extension/src/api.ts:21` -> `/v1/jobs`; `apps/api/src/app.ts:82` -> `/v1/jobs`; `apps/api/src/jobs/routes.ts:29` -> `app.post`
- Save supplies validated shared input to postJob. `apps/extension/src/save.ts:50` -> `postJob`; `apps/extension/src/api.ts:10` -> `postJob`; `packages/shared/src/jobs.ts:40` -> `CreateJobBodySchema`
- Duplicate and newly queued API responses match the client's existing/saved branches. `apps/extension/src/api.ts:30` -> `202`; `apps/api/src/jobs/routes.ts:53` -> `existing: true`; `apps/api/src/jobs/routes.ts:69` -> `202`
- Duplicate identity uses normalizeJobUrl: recognized LinkedIn job ids become a canonical job URL; other URLs lose fragments, utm_ parameters and named tracking parameters, sort remaining parameters and drop a trailing path slash. `apps/api/src/jobs/routes.ts:51` -> `normalizeJobUrl`; `packages/shared/src/jobs.ts:98` -> `https://www.linkedin.com/jobs/view/`; `packages/shared/src/jobs.ts:104` -> `url.searchParams.delete`; `packages/shared/src/jobs.ts:108` -> `base.replace`
- URL lookup has no status filter, and the route returns an existing id before insertion or queueing; recapturing a failed job therefore returns its existing id without updating captured text or restarting extraction. `apps/extension/src/api.ts:31` -> `existing`; `apps/api/src/jobs/routes.ts:52` -> `repo.findByUrl`; `apps/api/src/jobs/supabase-repo.ts:45` -> `eq("url_normalized", urlNormalized)`; `apps/api/src/jobs/routes.ts:53` -> `existing: true`; `apps/api/src/jobs/routes.ts:58` -> `repo.create`; `apps/api/src/jobs/routes.ts:64` -> `queue.send`
- An insertion collision with code 23505 repeats the normalized-URL lookup and returns the existing id when found; the route also returns this duplicate before sending a queue message. `apps/api/src/jobs/routes.ts:58` -> `repo.create`; `apps/api/src/jobs/supabase-repo.ts:58` -> `23505`; `apps/api/src/jobs/supabase-repo.ts:59` -> `findByUrl`; `apps/api/src/jobs/routes.ts:62` -> `created.existing`; `apps/api/src/jobs/routes.ts:64` -> `queue.send`
- Downstream queue messages carry jobId and userId; the consumer starts work using jobId. `apps/api/src/jobs/routes.ts:64` -> `queue.send`; `apps/api/src/jobs/consumer.ts:23` -> `msg.body.jobId`
- Downstream insertion triggers jobs_add_run, which invokes add_job_run and inserts quota history. `apps/api/src/jobs/supabase-repo.ts:52` -> `insert`; `supabase/migrations/20261107000000_jobs.sql:89` -> `jobs_add_run`; `supabase/migrations/20261107000000_jobs.sql:91` -> `add_job_run`; `supabase/migrations/20261107000000_jobs.sql:84` -> `insert into public.job_runs`
- That history insert triggers job_runs_limit and check_job_limit. `supabase/migrations/20261107000000_jobs.sql:84` -> `insert into public.job_runs`; `supabase/migrations/20261107000000_jobs.sql:72` -> `job_runs_limit`; `supabase/migrations/20261107000000_jobs.sql:74` -> `check_job_limit`
- User-scoped repository access is coupled to ownership RLS on job reads/inserts and quota-history reads. `apps/api/src/jobs/supabase-repo.ts:42` -> `Authorization`; `apps/api/src/jobs/supabase-repo.ts:45` -> `from("jobs")`; `supabase/migrations/20261107000000_jobs.sql:41` -> `auth.uid()`; `supabase/migrations/20261107000000_jobs.sql:43` -> `auth.uid()`; `apps/api/src/jobs/supabase-repo.ts:67` -> `job_runs`; `supabase/migrations/20261107000000_jobs.sql:51` -> `auth.uid()`

## Assumptions
- The client trusts string ids, without UUID validation; server routes supply ids and the save layer embeds them into web URLs. `apps/extension/src/api.ts:29` -> `typeof body.id === "string"`; `apps/extension/src/save.ts:65` -> `outcome.id`
- Ownership depends on API verification and RLS, not an extension-supplied user id. `apps/extension/src/api.ts:23` -> `Authorization`; `apps/api/src/app.ts:68` -> `verifyToken`; `apps/api/src/jobs/supabase-repo.ts:42` -> `Authorization`; `supabase/migrations/20261107000000_jobs.sql:43` -> `auth.uid()`

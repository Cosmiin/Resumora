---
id: api-core/auth
area: api-core
files: ["apps/api/src/auth.ts","apps/api/test/auth.test.ts"]
depends_on: ["db/cv-repository","db/imports-repository","db/jobs-repository","db/insights","db/tailoring-repository","db/tailoring-tables","api-core/errors"]
contract: true
checked_hash: 0c9943fc
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md"]
open: []
---
Verify access tokens and preserve user identity across database access.

- The verifier uses the anonymous client with persistence and refresh disabled, then calls getClaims with the supplied token. `apps/api/src/auth.ts:11` -> `supabaseVerifier`
- Invalid claims or a non-string subject yield null; successful verification preserves both subject and original token. `apps/api/src/auth.ts:18` -> `sub`
- Retryable auth fetch errors and HTTP 5xx throw instead of returning null, keeping outages distinct from invalid sessions. `apps/api/src/auth.ts:17` -> `isOutage`, `apps/api/src/auth.ts:25` -> `isAuthRetryableFetchError`
- Browser requests forward a session token and refresh once on 401; a retryable refresh error throws a network error. A refreshed token triggers a second request; without one, the original 401 remains and causes sign-out. With a second request, sign-out occurs if that response is 401. `apps/web/src/lib/api.ts:14` -> `authorization`, `apps/web/src/lib/api.ts:36` -> `401`, `apps/web/src/lib/api.ts:38` -> `isAuthRetryableFetchError`, `apps/web/src/lib/api.ts:41` -> `token`, `apps/web/src/lib/api.ts:42` -> `if (token)`, `apps/web/src/lib/api.ts:43` -> `signOut`
- Request-time AI logging uses the user's client and log_ai_call RPC, not the service-role key. `apps/api/src/enrich/supabase-repo.ts:100` -> `supabaseAiCallLogger`, `apps/api/src/enrich/supabase-repo.ts:9` -> `createClient`
- tested by `apps/api/test/auth.test.ts:16` -> `describe`

## Connections
- Verification caller and implementation: `apps/api/src/app.ts:68` -> `deps.verifyToken` -> `apps/api/src/auth.ts:16` -> `getClaims`.
- Web and extension bearer headers reach middleware: `apps/web/src/lib/api.ts:14` -> `authorization` and `apps/extension/src/api.ts:23` -> `Authorization` -> `apps/api/src/app.ts:66` -> `authorization`.
- CV get/history queries omit user filters and use owner policies: `apps/api/src/cv/supabase-repo.ts:35` -> `base_cvs` -> `supabase/migrations/20261104000000_baseline.sql:52` -> `own cv: read`; `apps/api/src/cv/supabase-repo.ts:70` -> `base_cv_versions` and `apps/api/src/cv/supabase-repo.ts:82` -> `base_cv_versions` -> `supabase/migrations/20261104000000_baseline.sql:59` -> `own history: read`.
- Import get/count omit user filters: `apps/api/src/imports/supabase-repo.ts:66` -> `cv_imports` and `apps/api/src/imports/supabase-repo.ts:72` -> `cv_imports` -> `supabase/migrations/20261105000000_imports.sql:26` -> `own imports: read`.
- Job URL lookup/list/get omit user filters: `apps/api/src/jobs/supabase-repo.ts:45` -> `url_normalized`, `apps/api/src/jobs/supabase-repo.ts:72` -> `jobs`, `apps/api/src/jobs/supabase-repo.ts:85` -> `jobs` -> `supabase/migrations/20261107000000_jobs.sql:40` -> `own jobs: read`.
- Job count/update/delete rely on owner policies: `apps/api/src/jobs/supabase-repo.ts:67` -> `job_runs` -> `supabase/migrations/20261107000000_jobs.sql:50` -> `own job runs: read`; `apps/api/src/jobs/supabase-repo.ts:106` -> `eq` -> `supabase/migrations/20261107000000_jobs.sql:44` -> `own jobs: update`; `apps/api/src/jobs/supabase-repo.ts:115` -> `delete` -> `supabase/migrations/20261107000000_jobs.sql:46` -> `own jobs: delete`.
- Insights list/get/pending reads omit user filters: `apps/api/src/enrich/supabase-repo.ts:36` -> `cv_insights`, `apps/api/src/enrich/supabase-repo.ts:42` -> `cv_insights`, `apps/api/src/enrich/supabase-repo.ts:64` -> `pending`, `apps/api/src/enrich/supabase-repo.ts:70` -> `pending` -> `supabase/migrations/20261106000000_enrichment.sql:21` -> `own insights: read`.
- Insights pending update and role deletion rely on RLS: `apps/api/src/enrich/supabase-repo.ts:77` -> `update` -> `supabase/migrations/20261106000000_enrichment.sql:25` -> `own insights: update`; `apps/api/src/enrich/supabase-repo.ts:83` -> `delete` -> `supabase/migrations/20261106000000_enrichment.sql:27` -> `own insights: delete`.
- Tailoring score lookup and document reads rely on RLS: `apps/api/src/tailor/supabase-repo.ts:32` -> `match_scores` -> `supabase/migrations/20261108000000_tailoring.sql:106` -> `own match scores: read`; document queries at `apps/api/src/tailor/supabase-repo.ts:42` -> `tailored_cvs`, `apps/api/src/tailor/supabase-repo.ts:47` -> `tailored_cvs`, `apps/api/src/tailor/supabase-repo.ts:74` -> `tailored_cvs`, `apps/api/src/tailor/supabase-repo.ts:87` -> `tailored_cvs`, `apps/api/src/tailor/supabase-repo.ts:94` -> `tailored_cvs`, `apps/api/src/tailor/supabase-repo.ts:110` -> `tailored_cvs`, `apps/api/src/tailor/supabase-repo.ts:122` -> `tailored_cvs` -> `supabase/migrations/20261108000000_tailoring.sql:68` -> `own tailored cvs: read`.
- Tailored settings/proposals/content/translation/template/letter updates filter by id or version, not user: `apps/api/src/tailor/supabase-repo.ts:57` -> `tailored_cvs`, `apps/api/src/tailor/supabase-repo.ts:79` -> `update`, `apps/api/src/tailor/supabase-repo.ts:106` -> `update`, `apps/api/src/tailor/supabase-repo.ts:127` -> `update`, `apps/api/src/tailor/supabase-repo.ts:143` -> `update`, `apps/api/src/tailor/supabase-repo.ts:149` -> `update` -> `supabase/migrations/20261108000000_tailoring.sql:75` -> `own tailored cvs: update`.
- Run reads and updates omit user filters: `apps/api/src/tailor/supabase-repo.ts:155` -> `tailor_runs` and `apps/api/src/tailor/supabase-repo.ts:170` -> `tailor_runs` -> `supabase/migrations/20261108000000_tailoring.sql:83` -> `own tailor runs: read`; `apps/api/src/tailor/supabase-repo.ts:183` -> `update` -> `supabase/migrations/20261108000000_tailoring.sql:94` -> `own tailor runs: update`.
- Job tone cache read/update omit user filters: `apps/api/src/tailor/supabase-repo.ts:188` -> `tone_examples` -> `supabase/migrations/20261107000000_jobs.sql:40` -> `own jobs: read`; `apps/api/src/tailor/supabase-repo.ts:194` -> `update` -> `supabase/migrations/20261107000000_jobs.sql:44` -> `own jobs: update`.

- A failed job update's status reread also relies on owner RLS: `apps/api/src/jobs/supabase-repo.ts:109` -> `jobs` -> `supabase/migrations/20261107000000_jobs.sql:40` -> `own jobs: read`.
- Inserts rely on owner and parent checks, even where user_id is supplied: `apps/api/src/enrich/supabase-repo.ts:49` -> `upsert` -> `supabase/migrations/20261106000000_enrichment.sql:23` -> `own insights: create`; `apps/api/src/tailor/supabase-repo.ts:22` -> `insert` -> `supabase/migrations/20261108000000_tailoring.sql:108` -> `own match scores: create`; `apps/api/src/tailor/supabase-repo.ts:64` -> `insert` and `apps/api/src/tailor/supabase-repo.ts:133` -> `insert` -> `supabase/migrations/20261108000000_tailoring.sql:70` -> `own tailored cvs: create`; `apps/api/src/tailor/supabase-repo.ts:161` -> `insert` -> `supabase/migrations/20261108000000_tailoring.sql:85` -> `own tailor runs: create`.

## Assumptions
- A string subject is sufficient for this layer; validity and verification are delegated to Supabase getClaims. `apps/api/src/auth.ts:16` -> `getClaims`
- RLS is the ownership boundary because request repositories forward the JWT instead of adding user filters. `apps/api/src/cv/supabase-repo.ts:23` -> `Authorization`, `apps/api/src/imports/supabase-repo.ts:44` -> `Authorization`, `apps/api/src/jobs/supabase-repo.ts:42` -> `Authorization`, `apps/api/src/enrich/supabase-repo.ts:11` -> `Authorization`, `apps/api/src/tailor/supabase-repo.ts:18` -> `Authorization`

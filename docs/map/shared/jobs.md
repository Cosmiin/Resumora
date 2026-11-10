---
id: shared/jobs
area: shared
files: ["packages/shared/src/jobs.ts","packages/shared/src/jobs.test.ts"]
depends_on: []
contract: true
checked_hash: e11b3709
decisions: ["docs/decisions/0003-one-shared-description-of-a-cv.md"]
open: []
---
Share job extraction, creation, editing and listing contracts with web, API and extension.

- JobExtraction allows nullable company/location/salary, enumerated work/employment/seniority values and a nullable ISO apply-by date. `packages/shared/src/jobs.ts:3` -> `JobExtractionSchema`, `packages/shared/src/jobs.ts:24` -> `applyBy:`
- Extraction caps responsibilities at 40, requirements at 60 and benefits at 30, each text at 500 characters; requirements distinguish must/nice and six categories. `packages/shared/src/jobs.ts:17` -> `responsibilities:`
- Job statuses include needs_text in addition to queue/processing/ready/failure; sources are link or extension, and errors are fetch_blocked, page_empty, not_a_job or ai_failed. `packages/shared/src/jobs.ts:29` -> `JobStatusSchema`, `packages/shared/src/jobs.ts:35` -> `JobErrorCodeSchema`
- CreateJobBody requires an HTTP(S) URL up to 2,048 characters; optional pageText is trimmed and must contain 200–60,000 characters, and jsonLd allows 20 unknown values. `packages/shared/src/jobs.ts:40` -> `CreateJobBodySchema`
- JobPatch requires positive version and a trimmed nonempty extraction title; optional thoughts cap at 2,000 and application status is enumerated. JobPatchSchema aliases JobPatchBodySchema. `packages/shared/src/jobs.ts:47` -> `JobPatchBodySchema`, `packages/shared/src/jobs.ts:54` -> `JobPatchSchema`, `packages/shared/src/jobs.ts:38` -> `applicationStatus`
- List query coerces limit to integer 1–100 with default 50 and caps cursor at 200 characters. `packages/shared/src/jobs.ts:57` -> `JobListQuerySchema`
- List items permit nullable title/company/location/error, and pages require a nullable nextCursor. `packages/shared/src/jobs.ts:63` -> `JobListItemSchema`, `packages/shared/src/jobs.ts:76` -> `JobListPageSchema`
- Full jobs extend list items with nullable raw text/extraction, edit state, thoughts, application status, positive version and string updatedAt. `packages/shared/src/jobs.ts:82` -> `JobSchema`
- LinkedIn URLs collapse recognized job paths or numeric currentJobId to a canonical HTTPS job URL. `packages/shared/src/jobs.ts:93` -> `normalizeJobUrl`
- Other normalized URLs lose hash, known tracking parameters, utm_ parameters and one trailing slash; remaining query parameters sort by name. `packages/shared/src/jobs.ts:101` -> `url.hash`
- findJobPosting returns the first object or immediate @graph member whose @type equals or includes JobPosting; nested arrays and deeper graphs are not recursively searched. `packages/shared/src/jobs.ts:111` -> `findJobPosting`
- tested by `packages/shared/src/jobs.test.ts:53` -> `CreateJobBodySchema`

## Connections

- Used by extension validation and request typing: `apps/extension/src/save.ts:44` -> `CreateJobBodySchema`, `apps/extension/src/api.ts:1` -> `CreateJobBody` -> `packages/shared/src/jobs.ts:40` -> `CreateJobBodySchema`. Extension POST URL `apps/extension/src/api.ts:21` -> `/v1/jobs` -> `apps/api/src/jobs/routes.ts:29` -> `app.post`, mounted at `apps/api/src/app.ts:82` -> `/v1/jobs`.
- Used by API create/edit/query validation and URL/JSON-LD handling: `apps/api/src/jobs/routes.ts:3` -> `CreateJobBodySchema` -> `packages/shared/src/jobs.ts:40` -> `CreateJobBodySchema`, `packages/shared/src/jobs.ts:47` -> `JobPatchBodySchema`, `packages/shared/src/jobs.ts:57` -> `JobListQuerySchema`, `packages/shared/src/jobs.ts:93` -> `normalizeJobUrl`, `packages/shared/src/jobs.ts:111` -> `findJobPosting`.
- Used by web list/detail/create/edit/delete URLs: `apps/web/src/jobs/jobs-api.ts:15` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:19` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:23` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:45` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:51` -> `/v1/jobs` -> `apps/api/src/jobs/routes.ts:72` -> `app.get`, `apps/api/src/jobs/routes.ts:83` -> `/:id`, `apps/api/src/jobs/routes.ts:29` -> `app.post`, `apps/api/src/jobs/routes.ts:115` -> `app.patch`, `apps/api/src/jobs/routes.ts:128` -> `app.delete`.
- Used by web response parsing and API row decoding: `apps/web/src/jobs/jobs-api.ts:15` -> `JobListPageSchema`, `apps/web/src/jobs/jobs-api.ts:19` -> `JobSchema`, `apps/api/src/jobs/supabase-repo.ts:29` -> `JobListItemSchema`, `apps/api/src/jobs/supabase-repo.ts:89` -> `JobSchema` -> `packages/shared/src/jobs.ts:63` -> `JobListItemSchema`, `packages/shared/src/jobs.ts:76` -> `JobListPageSchema`, `packages/shared/src/jobs.ts:82` -> `JobSchema`.
- Used by API extraction and web job display: `apps/api/src/jobs/process.ts:15` -> `JobExtractionSchema`, `apps/web/src/jobs/JobAd.tsx:1` -> `JobExtraction` -> `packages/shared/src/jobs.ts:3` -> `JobExtractionSchema`. Prompt link `apps/api/src/jobs/process.ts:16` -> `jobExtractPrompt` -> `apps/api/src/jobs/prompts.ts:3` -> `jobExtractPrompt`.
- Used by web editing with copied limits: changing the shared extraction bounds leaves save's 500-character check, responsibility/benefit truncation to 40/30, and the 60-requirement button cap unchanged. `apps/web/src/jobs/JobEditForm.tsx:38` -> `500`, `apps/web/src/jobs/JobEditForm.tsx:49` -> `lines`, `apps/web/src/jobs/JobEditForm.tsx:135` -> `60` -> `packages/shared/src/jobs.ts:17` -> `responsibilities:`, `packages/shared/src/jobs.ts:19` -> `500`, `packages/shared/src/jobs.ts:22` -> `60`, `packages/shared/src/jobs.ts:23` -> `benefits:`.
- User thoughts have separate 2,000-character web and SQL limits, so changing the shared patch schema alone does not change input or storage capacity: `apps/web/src/jobs/JobThoughts.tsx:85` -> `maxLength`, `supabase/migrations/20261108000000_tailoring.sql:3` -> `user_thoughts` -> `packages/shared/src/jobs.ts:50` -> `userThoughts`.
- Used by API repository error/source/edit types: `apps/api/src/jobs/repo.ts:1` -> `JobErrorCode` -> `packages/shared/src/jobs.ts:36` -> `JobErrorCode`, `packages/shared/src/jobs.ts:33` -> `JobSource`, `packages/shared/src/jobs.ts:53` -> `JobPatchBody`. Web status/error reads arrive through Job: `apps/web/src/jobs/jobs-api.ts:19` -> `JobSchema` -> `packages/shared/src/jobs.ts:65` -> `JobStatusSchema`, `packages/shared/src/jobs.ts:66` -> `JobErrorCodeSchema`.
- Queue creation and consumption connect by jobId: `apps/api/src/jobs/routes.ts:64` -> `deps.queue.send` -> `apps/api/src/jobs/consumer.ts:23` -> `msg.body.jobId`; message lives outside shared at `apps/api/src/jobs/repo.ts:5` -> `JobMessage`, producing extracted data via `apps/api/src/jobs/consumer.ts:28` -> `processJob` -> `packages/shared/src/jobs.ts:3` -> `JobExtractionSchema`.
- Job insertion invokes jobs_add_run and its job_runs_limit trigger: `apps/api/src/jobs/supabase-repo.ts:52` -> `insert` -> `supabase/migrations/20261107000000_jobs.sql:89` -> `jobs_add_run`, `supabase/migrations/20261107000000_jobs.sql:91` -> `add_job_run`, `supabase/migrations/20261107000000_jobs.sql:72` -> `job_runs_limit`, `supabase/migrations/20261107000000_jobs.sql:74` -> `check_job_limit`.
- Job and run lookups rely on RLS: `apps/api/src/jobs/supabase-repo.ts:85` -> `jobs`, `apps/api/src/jobs/supabase-repo.ts:67` -> `job_runs` -> `supabase/migrations/20261107000000_jobs.sql:41` -> `auth.uid`, `supabase/migrations/20261107000000_jobs.sql:51` -> `auth.uid`.

## Assumptions

- HTTP(S) URL validation is not a network destination allowlist; normalization itself directly constructs URL and can throw for invalid input. `packages/shared/src/jobs.ts:41` -> `z.url`, `packages/shared/src/jobs.ts:94` -> `new URL`.
- jsonLd input remains unknown until findJobPosting checks object shape; a matching @type alone does not validate a complete job posting. `packages/shared/src/jobs.ts:43` -> `z.unknown`, `packages/shared/src/jobs.ts:120` -> `JobPosting`.

---
id: shared/jobs
area: shared
files: ["packages/shared/src/jobs.ts","packages/shared/src/jobs.test.ts"]
depends_on: []
contract: true
checked_hash: a8955cce
cited: [9c570f, 8fe35b, a5f61f, cf7fd0, 0d619d, 3a702b, e160ff, 029016, 4fc0cd, dbe57f, 5887ed, f59fc0, 3b69b8, 34b38a, d449ae, ea270c, 0113b1, 6c1ac6, f4181c, 117ea3, 02d1d6, 099ced, 91af91, 4fc0cd, a18282, c47b0d, 01a1ad, e9ae87, 4fc0cd, dbe57f, 3b69b8, 0113b1, f4181c, dd6e08, 889221, 8a680e, f91af1, 41b18c, f13403, 5e358a, c47b0d, 110495, 498f4a, dd6e08, 889221, d01d44, d74b7f, 34b38a, d449ae, ea270c, 13ab6b, aedf8b, 9c570f, ddebb1, dd5a08, 34eebb, a23e56, fe4ebd, 3a702b, 02c320, efefee, b28896, 3155ef, 284aa1, 722063, 6f671c, 889221, aada7a, dd7059, b0bdfb, 81255a, 01bf61, 91a6bc, 9c570f, 061512, 7a7534, edf74a, 6349e0, 5142bb, 0a73a1, 18fad5, fc9d94, 878197, 630fce, 35c625, 63b1ef, f5905b]
decisions: ["docs/decisions/0003-one-shared-description-of-a-cv.md"]
open: []
---
Share job extraction, creation, editing and listing contracts with web, API and extension.

- JobExtraction allows nullable company/location/salary, enumerated work/employment/seniority values and a nullable ISO apply-by date. `packages/shared/src/jobs.ts:3` -> `JobExtractionSchema`, `packages/shared/src/jobs.ts:24` -> `applyBy:`
- positionClosed is an optional boolean; missing means open, so older stored extractions and typed fixtures still work without the field. Full-job reading and PATCH validation reuse this shared schema. `packages/shared/src/jobs.ts:26` -> `positionClosed`, `packages/shared/src/jobs.ts:50` -> `JobExtractionSchema.extend`, `packages/shared/src/jobs.ts:84` -> `JobExtractionSchema.nullable`
- Extraction caps responsibilities at 40, requirements at 60 and benefits at 30, each text at 500 characters; requirements distinguish must/nice and six categories. `packages/shared/src/jobs.ts:17` -> `responsibilities:`
- Job statuses include needs_text in addition to queue/processing/ready/failure; sources are link or extension, and errors are fetch_blocked, page_empty, not_a_job or ai_failed. `packages/shared/src/jobs.ts:30` -> `JobStatusSchema`, `packages/shared/src/jobs.ts:36` -> `JobErrorCodeSchema`
- CreateJobBody requires an HTTP(S) URL up to 2,048 characters; optional pageText is trimmed and must contain 200–60,000 characters, and jsonLd allows 20 unknown values. `packages/shared/src/jobs.ts:41` -> `CreateJobBodySchema`
- JobPatch requires positive version and a trimmed nonempty extraction title; optional application status is enumerated and unknown keys are stripped. JobPatchSchema aliases JobPatchBodySchema. `packages/shared/src/jobs.ts:48` -> `JobPatchBodySchema`, `packages/shared/src/jobs.ts:54` -> `JobPatchSchema`, `packages/shared/src/jobs.ts:39` -> `applicationStatus`
- List query coerces limit to integer 1–100 with default 50 and caps cursor at 200 characters. `packages/shared/src/jobs.ts:57` -> `JobListQuerySchema`
- List items permit nullable title/company/location/error, and pages require a nullable nextCursor. `packages/shared/src/jobs.ts:63` -> `JobListItemSchema`, `packages/shared/src/jobs.ts:76` -> `JobListPageSchema`
- Full jobs extend list items with nullable raw text/extraction, edit state, application status, positive version and string updatedAt. `packages/shared/src/jobs.ts:82` -> `JobSchema`
- LinkedIn URLs collapse recognized job paths or numeric currentJobId to a canonical HTTPS job URL. `packages/shared/src/jobs.ts:92` -> `normalizeJobUrl`
- Other normalized URLs lose hash, known tracking parameters, utm_ parameters and one trailing slash; remaining query parameters sort by name. `packages/shared/src/jobs.ts:100` -> `url.hash`
- findJobPosting returns the first object or immediate @graph member whose @type equals or includes JobPosting; nested arrays and deeper graphs are not recursively searched. `packages/shared/src/jobs.ts:110` -> `findJobPosting`
- tested by `packages/shared/src/jobs.test.ts:53` -> `CreateJobBodySchema`

- Old-tab note fields are ignored as unknown keys, tested by `packages/shared/src/jobs.test.ts:138` -> `ignores old thoughts and other unknown fields`.

## Connections

- Used by extension validation and request typing: `apps/extension/src/save.ts:44` -> `CreateJobBodySchema`, `apps/extension/src/api.ts:1` -> `CreateJobBody` -> `packages/shared/src/jobs.ts:41` -> `CreateJobBodySchema`. Extension POST URL `apps/extension/src/api.ts:21` -> `/v1/jobs` -> `apps/api/src/jobs/routes.ts:29` -> `app.post`, mounted at `apps/api/src/app.ts:82` -> `/v1/jobs`.
- Used by API create/edit/query validation and URL/JSON-LD handling: `apps/api/src/jobs/routes.ts:3` -> `CreateJobBodySchema` -> `packages/shared/src/jobs.ts:41` -> `CreateJobBodySchema`, `packages/shared/src/jobs.ts:48` -> `JobPatchBodySchema`, `packages/shared/src/jobs.ts:57` -> `JobListQuerySchema`, `packages/shared/src/jobs.ts:92` -> `normalizeJobUrl`, `packages/shared/src/jobs.ts:110` -> `findJobPosting`.
- Used by web list/detail/create/edit/delete URLs: `apps/web/src/jobs/jobs-api.ts:15` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:19` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:23` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:45` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:51` -> `/v1/jobs` -> `apps/api/src/jobs/routes.ts:72` -> `app.get`, `apps/api/src/jobs/routes.ts:83` -> `/:id`, `apps/api/src/jobs/routes.ts:29` -> `app.post`, `apps/api/src/jobs/routes.ts:115` -> `app.patch`, `apps/api/src/jobs/routes.ts:128` -> `app.delete`.
- Used by web response parsing and API row decoding: `apps/web/src/jobs/jobs-api.ts:15` -> `JobListPageSchema`, `apps/web/src/jobs/jobs-api.ts:19` -> `JobSchema`, `apps/api/src/jobs/supabase-repo.ts:28` -> `JobListItemSchema`, `apps/api/src/jobs/supabase-repo.ts:88` -> `JobSchema` -> `packages/shared/src/jobs.ts:63` -> `JobListItemSchema`, `packages/shared/src/jobs.ts:76` -> `JobListPageSchema`, `packages/shared/src/jobs.ts:82` -> `JobSchema`.
- Used by API extraction and web job display; only processJob extends the schema to require positionClosed for model output: `apps/api/src/jobs/process.ts:16` -> `JobExtractionSchema.extend`, `apps/web/src/jobs/JobAd.tsx:1` -> `JobExtraction` -> `packages/shared/src/jobs.ts:3` -> `JobExtractionSchema`. Prompt link `apps/api/src/jobs/process.ts:17` -> `jobExtractPrompt` -> `apps/api/src/jobs/prompts.ts:3` -> `jobExtractPrompt`.
- Used by web editing with copied limits: changing the shared extraction bounds leaves save's 500-character check, responsibility/benefit truncation to 40/30, and the 60-requirement button cap unchanged. `apps/web/src/jobs/JobEditForm.tsx:38` -> `500`, `apps/web/src/jobs/JobEditForm.tsx:49` -> `lines`, `apps/web/src/jobs/JobEditForm.tsx:135` -> `60` -> `packages/shared/src/jobs.ts:17` -> `responsibilities:`, `packages/shared/src/jobs.ts:19` -> `500`, `packages/shared/src/jobs.ts:22` -> `60`, `packages/shared/src/jobs.ts:23` -> `benefits:`.
- Used by API repository error/source/edit types: `apps/api/src/jobs/repo.ts:1` -> `JobErrorCode` -> `packages/shared/src/jobs.ts:37` -> `JobErrorCode`, `packages/shared/src/jobs.ts:34` -> `JobSource`, `packages/shared/src/jobs.ts:53` -> `JobPatchBody`. Web status/error reads arrive through Job: `apps/web/src/jobs/jobs-api.ts:19` -> `JobSchema` -> `packages/shared/src/jobs.ts:65` -> `JobStatusSchema`, `packages/shared/src/jobs.ts:66` -> `JobErrorCodeSchema`.
- Queue creation and consumption connect by jobId: `apps/api/src/jobs/routes.ts:64` -> `deps.queue.send` -> `apps/api/src/jobs/consumer.ts:23` -> `msg.body.jobId`; message lives outside shared at `apps/api/src/jobs/repo.ts:5` -> `JobMessage`, producing extracted data via `apps/api/src/jobs/consumer.ts:28` -> `processJob` -> `packages/shared/src/jobs.ts:3` -> `JobExtractionSchema`.
- Job insertion invokes jobs_add_run and its job_runs_limit trigger: `apps/api/src/jobs/supabase-repo.ts:51` -> `insert` -> `supabase/migrations/20261107000000_jobs.sql:89` -> `jobs_add_run`, `supabase/migrations/20261107000000_jobs.sql:91` -> `add_job_run`, `supabase/migrations/20261107000000_jobs.sql:72` -> `job_runs_limit`, `supabase/migrations/20261107000000_jobs.sql:74` -> `check_job_limit`.
- Job and run lookups rely on RLS: `apps/api/src/jobs/supabase-repo.ts:84` -> `jobs`, `apps/api/src/jobs/supabase-repo.ts:66` -> `job_runs` -> `supabase/migrations/20261107000000_jobs.sql:41` -> `auth.uid`, `supabase/migrations/20261107000000_jobs.sql:51` -> `auth.uid`.

## Assumptions

- HTTP(S) URL validation is not a network destination allowlist; normalization itself directly constructs URL and can throw for invalid input. `packages/shared/src/jobs.ts:42` -> `z.url`, `packages/shared/src/jobs.ts:93` -> `new URL`.
- jsonLd input remains unknown until findJobPosting checks object shape; a matching @type alone does not validate a complete job posting. `packages/shared/src/jobs.ts:44` -> `z.unknown`, `packages/shared/src/jobs.ts:119` -> `JobPosting`.

---
id: db/jobs-repository
area: db
files: ["apps/api/src/jobs/repo.ts","apps/api/src/jobs/supabase-repo.ts","apps/api/src/jobs/memory-repo.ts"]
depends_on: ["db/jobs","db/tailoring-tables","db/ai-log","shared/jobs","db/local-config"]
contract: false
checked_hash: 0bfc61b5
cited: [ecd987, 718ce0, c8e294, cc0bd0, b0719a, 8ab36b, d74b7f, 0fa58d, 7d209c, f391ee, 5e3f35, 99eebf, 750ab6, 3f658f, 843b70, 0e414b, 9641f6, a857c2, 2e0783, 82de92, 0ccfff, 2d7331, 77d0d0, b39d02, 8ab36b, c8e294, d2e178, cdea93, aa84d2, 347f97, 5ad61f, 0a73a1, d74b7f, 60abd6, 0a73a1, fc9d94, 18fad5, 878197, 01bf61, b0bdfb, 81255a, 0b57c4, 32d037, ddebb1, dd5a08, ae1dad, 5ba0ee, e936d0, 4303fc, 8a680e, a18282, c47b0d, 01a1ad, dd6e08, 889221, f91af1, 41b18c, f13403, 5e358a, 110495, 498f4a, 783f56, b0719a, 8ab36b, d74b7f, 60abd6, 7643b0, 40485a, 78b998, 99acd7, f03be8, f391ee, dd67a2, d36037, 0b57c4]
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Expose job creation, pagination, version-checked editing and worker updates through real and fake repositories.

- Repository create maps job_limit to HTTP 429 and recovers a unique violation by finding an existing normalized URL. `apps/api/src/jobs/supabase-repo.ts:54` -> `job_limit`, `apps/api/src/jobs/supabase-repo.ts:57` -> `23505`
- Cursor decoding accepts only a round-trippable UTC timestamp and UUID; list orders by descending created_at then ID, requests one extra row, and applies the same pair to the continuation filter. `apps/api/src/jobs/repo.ts:18` -> `createdAt`, `apps/api/src/jobs/repo.ts:20` -> `id`, `apps/api/src/jobs/supabase-repo.ts:72` -> `order`, `apps/api/src/jobs/supabase-repo.ts:74` -> `query.or`
- Stored job responses are parsed by shared schemas, so a database row allowed by the loose SQL JSON columns may still fail API reading. `apps/api/src/jobs/supabase-repo.ts:88` -> `JobSchema.safeParse`, `apps/api/src/jobs/supabase-repo.ts:93` -> `throw new Error`, `supabase/migrations/20261107000000_jobs.sql:17` -> `extracted`
- patch requires matching version and ready status, increments version, and distinguishes not_found/wrong_status/conflict with a follow-up read. `apps/api/src/jobs/supabase-repo.ts:104` -> `eq("version"`, `apps/api/src/jobs/supabase-repo.ts:107` -> `const current`
- Status patches still resend extraction fields but do not set edited_by_user or updated_at; only extraction-only edits change that timestamp. `apps/api/src/jobs/supabase-repo.ts:98` -> `extractionEdit`, `apps/api/src/jobs/supabase-repo.ts:101` -> `extracted`, `apps/api/src/jobs/supabase-repo.ts:103` -> `updated_at`
- Worker start conditionally matches old attempts and queued/processing status; losing that update returns null. Worker finish/fail update by ID without a version bump. `apps/api/src/jobs/supabase-repo.ts:137` -> `eq("attempts"`, `apps/api/src/jobs/supabase-repo.ts:139` -> `return null`, `apps/api/src/jobs/supabase-repo.ts:143` -> `await update`, `apps/api/src/jobs/supabase-repo.ts:146` -> `await update`
- The fake models quota, duplicate URL, job-delete run retention and conditional start; it does not enforce SQL UUID/foreign-key/check constraints or parse returned jobs. `apps/api/src/jobs/memory-repo.ts:35` -> `runs.filter`, `apps/api/src/jobs/memory-repo.ts:39` -> `rows.set`, `apps/api/src/jobs/memory-repo.ts:66` -> `return`, `apps/api/src/jobs/memory-repo.ts:91` -> `run.jobId = null`, `apps/api/src/jobs/memory-repo.ts:102` -> `row.attempts !== attempts`
- Fake pagination compares timestamp strings, while SQL compares timestamptz values; equivalent timestamps with different accepted UTC formatting can produce different fake page boundaries. `apps/api/src/jobs/memory-repo.ts:56` -> `row.createdAt < after.createdAt`, `apps/api/src/jobs/supabase-repo.ts:74` -> `created_at.lt`, `apps/api/src/jobs/repo.ts:18` -> `00:00`
- Fake job removal has no link to the separate tailoring store, whereas SQL job foreign keys cascade tailored documents, runs and scores. `apps/api/src/jobs/memory-repo.ts:90` -> `rows.delete`, `supabase/migrations/20261108000000_tailoring.sql:10` -> `on delete cascade`, `supabase/migrations/20261108000000_tailoring.sql:32` -> `on delete cascade`, `supabase/migrations/20261108000000_tailoring.sql:49` -> `on delete cascade`

- Both repositories hand-map rows to Job; a new required field needs the Supabase COLUMNS select list and snake_case-to-camelCase mapping plus the memory mapping updated together. `apps/api/src/jobs/supabase-repo.ts:25` -> `COLUMNS`, `apps/api/src/jobs/supabase-repo.ts:84` -> `select(COLUMNS)`, `apps/api/src/jobs/supabase-repo.ts:88` -> `JobSchema.safeParse`, `apps/api/src/jobs/memory-repo.ts:67` -> `...toListItem(row)`

## Connections

- User queries rely on separate job/run policies: `apps/api/src/jobs/supabase-repo.ts:84` -> `from("jobs")` -> `supabase/migrations/20261107000000_jobs.sql:41` -> `auth.uid()`; `apps/api/src/jobs/supabase-repo.ts:66` -> `from("job_runs")` -> `supabase/migrations/20261107000000_jobs.sql:51` -> `auth.uid()`.
- Queue message type/producer/consumer connect by jobId: `apps/api/src/jobs/repo.ts:5` -> `JobMessage`, `apps/api/src/jobs/routes.ts:64` -> `queue.send` -> `apps/api/src/jobs/consumer.ts:23` -> `msg.body.jobId`; consumer uses admin start at `apps/api/src/jobs/consumer.ts:25` -> `admin.start` -> `apps/api/src/jobs/supabase-repo.ts:131` -> `start`.
- Worker extraction uses prompt templates before finish writes the job: `apps/api/src/jobs/process.ts:17` -> `jobExtractPrompt` -> `apps/api/src/jobs/prompts.ts:3` -> `jobExtractPrompt`; `apps/api/src/jobs/process.ts:18` -> `buildJobUserPrompt` -> `apps/api/src/jobs/prompts.ts:19` -> `buildJobUserPrompt`; `apps/api/src/jobs/consumer.ts:30` -> `admin.finish` -> `apps/api/src/jobs/supabase-repo.ts:142` -> `finish`.
- Web and extension create URLs reach the mounted POST handler: `apps/web/src/jobs/jobs-api.ts:23` -> `/v1/jobs`, `apps/extension/src/api.ts:21` -> `/v1/jobs` -> `apps/api/src/jobs/routes.ts:29` -> `app.post`, `apps/api/src/app.ts:82` -> `/v1/jobs`.
- Web list/read/patch/delete URLs reach corresponding handlers: `apps/web/src/jobs/jobs-api.ts:15` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:19` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:45` -> `/v1/jobs`, `apps/web/src/jobs/jobs-api.ts:51` -> `/v1/jobs` -> `apps/api/src/jobs/routes.ts:72` -> `app.get`, `apps/api/src/jobs/routes.ts:83` -> `/:id`, `apps/api/src/jobs/routes.ts:115` -> `app.patch`, `apps/api/src/jobs/routes.ts:128` -> `app.delete`.

- list() uses keyset pagination (created_at and ID) with an explicit page limit because the local Data API silently caps an unbounded select at 1000 rows: `supabase/config.toml:18` -> `max_rows = 1000` -> `apps/api/src/jobs/supabase-repo.ts:72` -> `limit(limit + 1)`, with the continuation filter at `apps/api/src/jobs/supabase-repo.ts:74` -> `query.or`.

- A required Job field must also be added to the web Job test fixtures alongside both repository mappings: `apps/api/src/jobs/supabase-repo.ts:88` -> `JobSchema.safeParse`, `apps/api/src/jobs/memory-repo.ts:67` -> `...toListItem(row)` -> `apps/web/src/jobs/job-edit.test.tsx:24` -> `const job: Job`, `apps/web/src/jobs/job-page.test.tsx:24` -> `const job: Job`, `apps/web/src/jobs/jobs-api.test.ts:41` -> `const job: Job`.

## Assumptions

- Direct owner writes can alter job status, extraction and version because RLS checks identity, not the repository's ready/version workflow. `supabase/migrations/20261107000000_jobs.sql:38` -> `grant select, insert, update, delete`, `supabase/migrations/20261107000000_jobs.sql:45` -> `with check`, `apps/api/src/jobs/supabase-repo.ts:104` -> `eq("status", "ready")`
- Queue worker access is privileged and reads ownership from the job row; message userId is not used to scope admin.start. `apps/api/src/jobs/supabase-repo.ts:122` -> `createClient`, `apps/api/src/jobs/supabase-repo.ts:140` -> `data.user_id`, `apps/api/src/jobs/consumer.ts:25` -> `admin.start(id)`

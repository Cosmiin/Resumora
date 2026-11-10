---
id: api-core/worker
area: api-core
files: ["apps/api/src/index.ts","apps/api/test/jobs-consumer.test.ts","apps/api/test/supabase-repo.test.ts"]
depends_on: ["api-core/app","api-core/auth","api-core/call-model","api-core/import-queue","api-core/job-queue","api-core/config","api-core/environment","db/imports","db/jobs","db/tailoring-repository","db/ai-log","db/match-scores-repository"]
contract: true
checked_hash: 20ce72df
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md","docs/decisions/0004-imports-go-through-a-queue.md"]
open: []
---
Bind HTTP requests, queue deliveries and scheduled cleanup to real dependencies.

- Each fetch constructs real dependencies and a new Hono app. `apps/api/src/index.ts:62` -> `fetch`
- Request repositories are built from the verified user; model and voice logs use supabaseAiCallLogger with that same user. `apps/api/src/index.ts:40` -> `cvRepo`, `apps/api/src/index.ts:48` -> `supabaseAiCallLogger`, `apps/api/src/index.ts:53` -> `supabaseAiCallLogger`
- Dispatch uses exact queue names and awaits messages sequentially; unknown queue batches are logged and acknowledged wholesale. `apps/api/src/index.ts:26` -> `batch.queue`
- The scheduled handler runs only stale-import cleanup. `apps/api/src/index.ts:67` -> `scheduled`
- Import worker and scheduled cleanup construct supabaseImportAdmin; its privileged client accesses import rows, storage and AI logs. `apps/api/src/index.ts:68` -> `supabaseImportAdmin`, `apps/api/src/index.ts:79` -> `supabaseImportAdmin`, `apps/api/src/imports/supabase-repo.ts:88` -> `SUPABASE_SERVICE_ROLE_KEY`, `apps/api/src/imports/supabase-repo.ts:130` -> `ai_calls`
- Job worker constructs supabaseJobAdmin for job state and AI logs, and supabaseTailorAdmin for base-CV reads and score storage: all three production service-role constructors bypass RLS. `apps/api/src/index.ts:74` -> `supabaseJobAdmin`, `apps/api/src/index.ts:76` -> `supabaseTailorAdmin`, `apps/api/src/jobs/supabase-repo.ts:124` -> `SUPABASE_SERVICE_ROLE_KEY`, `apps/api/src/tailor/supabase-repo.ts:214` -> `SUPABASE_SERVICE_ROLE_KEY`
- AuthUser carries id and token; SupabaseEnv deliberately exposes only URL and anonymous key to request repository constructors. `apps/api/src/env.ts:21` -> `AuthUser`, `apps/api/src/env.ts:24` -> `SupabaseEnv`
- tested by `apps/api/test/jobs-consumer.test.ts:191` -> `queue dispatch`
- Privileged test setup creates users through the admin API without user authorization, tested by `apps/api/test/supabase-repo.test.ts:109` -> `createClient`, `apps/api/test/supabase-repo.test.ts:112` -> `auth.admin.createUser`; job-admin construction is tested by `apps/api/test/supabase-repo.test.ts:96` -> `supabaseJobAdmin`.
- The privileged import test directly starts, downloads, finishes and deletes an import file, asserting the returned owner in the test; these admin methods accept ids or stored paths without user authorization. `apps/api/src/imports/supabase-repo.ts:98` -> `eq("id", id)`, `apps/api/src/imports/supabase-repo.ts:105` -> `job.storagePath`, `apps/api/src/imports/supabase-repo.ts:110` -> `update`, `apps/api/src/imports/supabase-repo.ts:116` -> `job.storagePath`; tested by `apps/api/test/supabase-repo.test.ts:180` -> `supabaseImportAdmin`, `apps/api/test/supabase-repo.test.ts:181` -> `admin.start`, `apps/api/test/supabase-repo.test.ts:182` -> `userId`, `apps/api/test/supabase-repo.test.ts:183` -> `admin.download`, `apps/api/test/supabase-repo.test.ts:184` -> `admin.finish`, `apps/api/test/supabase-repo.test.ts:185` -> `admin.deleteFile`.

## Connections
- Import admin ownership boundary: queue processing at `apps/api/src/index.ts:79` -> `supabaseImportAdmin` and global cleanup at `apps/api/src/index.ts:68` -> `supabaseImportAdmin` share `apps/api/src/imports/supabase-repo.ts:88` -> `createClient`; processing takes the stored owner at `apps/api/src/imports/consumer.ts:27` -> `job.userId` from `apps/api/src/imports/supabase-repo.ts:102` -> `data.user_id`; cleanup calls `apps/api/src/imports/consumer.ts:54` -> `expireStale` -> `apps/api/src/imports/supabase-repo.ts:119` -> `expireStale`.
- Job scoring passes the stored owner to both dependencies: `apps/api/src/jobs/consumer.ts:32` -> `tailorRepo` and `apps/api/src/jobs/consumer.ts:34` -> `baseCv` receive their implementation through `apps/api/src/index.ts:76` -> `supabaseTailorAdmin` -> `apps/api/src/tailor/supabase-repo.ts:213` -> `supabaseTailorAdmin`.

- Import producer binding: `apps/api/src/index.ts:55` -> `env.IMPORTS.send` -> `apps/api/wrangler.jsonc:11` -> `IMPORTS`; consumer `apps/api/src/index.ts:81` -> `handleImportMessage` -> `apps/api/src/imports/consumer.ts:17` -> `handleImportMessage`.
- Job producer binding: `apps/api/src/index.ts:56` -> `env.JOBS.send` -> `apps/api/wrangler.jsonc:12` -> `JOBS`; consumer `apps/api/src/index.ts:76` -> `handleJobMessage` -> `apps/api/src/jobs/consumer.ts:11` -> `handleJobMessage`.
- Cron connects configuration to cleanup: `apps/api/wrangler.jsonc:8` -> `crons` -> `apps/api/src/index.ts:67` -> `scheduled` -> `apps/api/src/imports/consumer.ts:52` -> `sweepStaleImports`.
- Request log RPC: `apps/api/src/index.ts:48` -> `supabaseAiCallLogger` -> `apps/api/src/enrich/supabase-repo.ts:103` -> `log_ai_call` -> `supabase/migrations/20261109220000_enrich_item_lines.sql:7` -> `log_ai_call`.
- Privileged queue logs use direct inserts: `apps/api/src/index.ts:75` -> `admin.logCall` -> `apps/api/src/jobs/supabase-repo.ts:151` -> `ai_calls`; `apps/api/src/index.ts:80` -> `admin.logCall` -> `apps/api/src/imports/supabase-repo.ts:130` -> `ai_calls`.

## Assumptions
- Import admin bypasses RLS without re-authenticating users: state writes filter only by id, stale-row selection spans owners, and logs accept caller-supplied userId. `apps/api/src/imports/supabase-repo.ts:88` -> `createClient`, `apps/api/src/imports/supabase-repo.ts:92` -> `update`, `apps/api/src/imports/supabase-repo.ts:119` -> `expireStale`, `apps/api/src/imports/supabase-repo.ts:125` -> `user_id`, `apps/api/src/imports/supabase-repo.ts:131` -> `user_id`
- Job admin bypasses RLS for id-only state writes and caller-attributed logs; scoring relies on the stored owner passed to supabaseTailorAdmin, whose internal ownership checks belong to the DB repository area. `apps/api/src/jobs/supabase-repo.ts:124` -> `createClient`, `apps/api/src/jobs/supabase-repo.ts:128` -> `update`, `apps/api/src/jobs/supabase-repo.ts:152` -> `user_id`, `apps/api/src/jobs/consumer.ts:32` -> `work.userId`, `apps/api/src/jobs/consumer.ts:34` -> `work.userId`, `apps/api/src/index.ts:76` -> `supabaseTailorAdmin`, `apps/api/src/tailor/supabase-repo.ts:219` -> `user_id`, `apps/api/src/tailor/supabase-repo.ts:227` -> `user_id`

- Queue payloads are cast by queue name without runtime schema validation; consumers must obtain ownership from the stored row. `apps/api/src/index.ts:27` -> `as Message<JobMessage>`, `apps/api/src/index.ts:29` -> `as Message<ImportMessage>`
- Privileged base-CV and match-score reads explicitly filter user_id, unlike request repositories. `apps/api/src/tailor/supabase-repo.ts:219` -> `user_id`, `apps/api/src/tailor/supabase-repo.ts:227` -> `user_id`

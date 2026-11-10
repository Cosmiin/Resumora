---
id: api-core/import-queue
area: api-core
files: ["apps/api/src/imports/consumer.ts","apps/api/test/imports.test.ts"]
depends_on: ["api-core/import-processing","db/imports-repository","db/imports-apply","api-core/config"]
contract: true
checked_hash: c50bfe54
cited: [1f5195, 7943e0, 844e13, 7943e0, 02c68f, a5e507, f228b4, 647286, f27eec, 1f011a, 4e41c4, bf2c73, 6534dc, e2eb94, 25490e, e63f8c, a2ad11, 1d8b1c, 73983b, e6272e, a34147, d06a1e, cd14f5, d523fd, df9988, dc4ff9, 934b19, 604221, 0e8422, f3e409, e64f8e, 7943e0, b9d0c9, 8968cd, 844e13, 6f500b, 4a6da2, f180dc, 131cee, e63f8c, a2ad11, 73983b, 1d8b1c, 7943e0, 20021b, 559aea, 20021b, 2df0c3]
decisions: ["docs/decisions/0004-imports-go-through-a-queue.md"]
open: []
---
Consume import messages and expire uploads whose work never finishes.

- The message shape is {importId:string,userId:string}; start uses importId and processing uses the row's userId, not the message's userId. `apps/api/src/imports/repo.ts:11` -> `ImportMessage`, `apps/api/src/imports/consumer.ts:22` -> `admin.start`, `apps/api/src/imports/consumer.ts:27` -> `job.userId`
- A missing or terminal row is acknowledged; start occurs outside the try block, so its failures escape local retry handling. `apps/api/src/imports/consumer.ts:22` -> `admin.start`
- Success downloads, processes, marks ready, attempts file deletion, then acknowledges. `apps/api/src/imports/consumer.ts:26` -> `admin.download`
- ImportFailure is final: record its code, clean up and acknowledge without queue retry. `apps/api/src/imports/consumer.ts:32` -> `ImportFailure`
- Other processing errors log details and retry after ten seconds before delivery three; delivery three records internal failure, cleans up and acknowledges. `apps/api/src/imports/consumer.ts:8` -> `MAX_ATTEMPTS`, `apps/api/src/imports/consumer.ts:37` -> `deps.log`
- Cleanup failure is logged and swallowed, so successful/final imports can retain files without a retry. `apps/api/src/imports/consumer.ts:61` -> `deleteFile`
- The sweeper expires queued/processing rows by created_at older than fifteen minutes, then cleans up returned files. `apps/api/src/imports/consumer.ts:46` -> `STALE_AFTER_MS`, `apps/api/src/imports/consumer.ts:53` -> `before`, `apps/api/src/imports/supabase-repo.ts:123` -> `in("status"`
- Consumer and sweeper behavior with a memory repository is tested by `apps/api/test/imports.test.ts:231` -> `handleImportMessage`, `apps/api/test/imports.test.ts:287` -> `sweepStaleImports`. These tests use the in-memory expiry implementation, not the production Supabase expiry query. `apps/api/src/imports/memory-repo.ts:89` -> `expireStale`, `apps/api/src/imports/supabase-repo.ts:119` -> `expireStale`

## Connections
- Late completion writes ready through an id-only update: `apps/api/src/imports/consumer.ts:28` -> `admin.finish` -> `apps/api/src/imports/supabase-repo.ts:110` -> `ready` -> `apps/api/src/imports/supabase-repo.ts:92` -> `update`. Already-running work can overwrite expiry from `apps/api/src/imports/supabase-repo.ts:122` -> `failed`, or duplicate work can reopen an applied import; the route gates on the status it reads at `apps/api/src/imports/routes.ts:65` -> `found.status`, then `apps/api/src/imports/routes.ts:74` -> `repo.apply` -> `apps/api/src/imports/supabase-repo.ts:78` -> `apply_import` -> `supabase/migrations/20261106010000_apply_import_content.sql:61` -> `applied`.

- Producer -> binding -> dispatch -> consumer: `apps/api/src/imports/routes.ts:47` -> `queue.send` -> `apps/api/src/index.ts:55` -> `env.IMPORTS.send` -> `apps/api/src/index.ts:29` -> `deps.imports` -> `apps/api/src/index.ts:81` -> `handleImportMessage` -> `apps/api/src/imports/consumer.ts:17` -> `handleImportMessage`.
- Queue config provides batch size one and max_retries three; local MAX_ATTEMPTS counts deliveries, and start errors escape it: `apps/api/wrangler.jsonc:15` -> `max_retries` -> `apps/api/src/imports/consumer.ts:38` -> `msg.attempts`, `apps/api/src/imports/consumer.ts:22` -> `admin.start`.
- Worker supplies privileged admin: `apps/api/src/index.ts:79` -> `supabaseImportAdmin` -> `apps/api/src/imports/supabase-repo.ts:88` -> `SUPABASE_SERVICE_ROLE_KEY`.
- Consumer calls pipeline: `apps/api/src/imports/consumer.ts:27` -> `processImport` -> `apps/api/src/imports/process.ts:40` -> `processImport`.
- Scheduled cleanup call: `apps/api/src/index.ts:68` -> `sweepStaleImports` -> `apps/api/src/imports/consumer.ts:52` -> `sweepStaleImports`; database expiry `apps/api/src/imports/consumer.ts:54` -> `expireStale` -> `apps/api/src/imports/supabase-repo.ts:119` -> `expireStale`.

## Assumptions
- Completion does not recheck status or version, so expiry and application do not stop a worker that already started from setting the row back to ready. `apps/api/src/imports/consumer.ts:28` -> `admin.finish`, `apps/api/src/imports/supabase-repo.ts:92` -> `eq("id", id)`, `apps/api/src/imports/supabase-repo.ts:110` -> `ready`

- The queue is trusted infrastructure: its id is used with a service-role client; stored ownership and storage path determine what gets processed. `apps/api/src/imports/consumer.ts:22` -> `msg.body.importId`, `apps/api/src/imports/supabase-repo.ts:98` -> `select`, `apps/api/src/imports/supabase-repo.ts:102` -> `data.user_id`
- Import start is a read followed by an unconditional id update, not an atomic exclusive claim; duplicate concurrent work is not prevented here. `apps/api/src/imports/supabase-repo.ts:98` -> `select`, `apps/api/src/imports/supabase-repo.ts:101` -> `update`

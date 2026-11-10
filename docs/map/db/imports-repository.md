---
id: db/imports-repository
area: db
files: ["apps/api/src/imports/repo.ts","apps/api/src/imports/supabase-repo.ts","apps/api/src/imports/memory-repo.ts"]
depends_on: ["db/imports","db/imports-apply","db/ai-log","shared/imports","shared/api-responses"]
contract: false
checked_hash: a0f1ebd2
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0004-imports-go-through-a-queue.md", "docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Create and read import jobs, then let the worker finish or expire them and delete their files.

- create writes the row before uploading the file; an upload failure leaves the queued row for later cleanup. This reverses the order suggested by the interface comment. `apps/api/src/imports/supabase-repo.ts:53` -> `insert`, `apps/api/src/imports/supabase-repo.ts:60` -> `upload`
- Stored import results are parsed, unknown error codes become internal, and responses expose result only while ready. `apps/api/src/imports/supabase-repo.ts:27` -> `ImportResultSchema`, `apps/api/src/imports/supabase-repo.ts:29` -> `internal`, `apps/api/src/imports/memory-repo.ts:27` -> `row.status === "ready"`
- Admin start accepts queued or processing and separately updates attempts without a conditional comparison; duplicate concurrent starts are not excluded. Stale expiration uses created_at, not updated_at. `apps/api/src/imports/supabase-repo.ts:98` -> `select`, `apps/api/src/imports/supabase-repo.ts:101` -> `await update`, `apps/api/src/imports/supabase-repo.ts:124` -> `created_at`
- The fake creates file/row without SQL quota, filename, UUID, bucket or result constraints and overwrites duplicate IDs; database insertion/upload can fail where the fake succeeds. `apps/api/src/imports/memory-repo.ts:45` -> `files.set`, `apps/api/src/imports/memory-repo.ts:47` -> `rows.set`, `supabase/migrations/20261105000000_imports.sql:5` -> `primary key`, `supabase/migrations/20261105010000_import_limit.sql:12` -> `>= 10`
- Fake admin logging is a no-op; the SQL admin inserts ai_calls and throws when insertion fails. `apps/api/src/imports/memory-repo.ts:88` -> `logCall`, `apps/api/src/imports/supabase-repo.ts:130` -> `from("ai_calls").insert`, `apps/api/src/imports/supabase-repo.ts:134` -> `throw new Error`

- formatOf treats only a lowercase .docx suffix as DOCX and every other path as PDF; the stored path therefore decides the parser used by the consumer. `apps/api/src/imports/repo.ts:18` -> `path.endsWith(".docx")`, `apps/api/src/imports/consumer.ts:27` -> `formatOf(job.storagePath)`, `apps/api/src/imports/process.ts:44` -> `extractText(input.bytes, input.format)`

## Connections

- Uses row and Storage policies: `apps/api/src/imports/supabase-repo.ts:66` -> `cv_imports` -> `supabase/migrations/20261105000000_imports.sql:27` -> `auth.uid()`; `apps/api/src/imports/supabase-repo.ts:60` -> `upload` -> `supabase/migrations/20261105000000_imports.sql:41` -> `storage.foldername`.
- Queue producer and consumer share ImportMessage: `apps/api/src/imports/routes.ts:47` -> `queue.send` -> `apps/api/src/imports/repo.ts:11` -> `ImportMessage` -> `apps/api/src/imports/consumer.ts:22` -> `msg.body.importId`; consumer persists the result at `apps/api/src/imports/consumer.ts:28` -> `admin.finish` -> `apps/api/src/imports/supabase-repo.ts:110` -> `status: "ready"`.
- Stored results originate from admission/extraction prompt templates: `apps/api/src/imports/process.ts:54` -> `admitPrompt` -> `apps/api/src/imports/prompts.ts:18` -> `admitPrompt`; `apps/api/src/imports/process.ts:67` -> `extractPrompt` -> `apps/api/src/imports/prompts.ts:91` -> `extractPrompt`.
- Web upload/read/apply URLs reach import handlers: `apps/web/src/imports/imports-api.ts:7` -> `/v1/imports`, `apps/web/src/imports/imports-api.ts:11` -> `/v1/imports`, `apps/web/src/imports/imports-api.ts:15` -> `/apply` -> `apps/api/src/imports/routes.ts:27` -> `app.post`, `apps/api/src/imports/routes.ts:51` -> `app.get`, `apps/api/src/imports/routes.ts:58` -> `/:id/apply`; mount `apps/api/src/app.ts:76` -> `/v1/imports`.
- Cleanup uses admin deletion, which owners cannot do through the import policies: `apps/api/src/imports/consumer.ts:61` -> `admin.deleteFile` -> `apps/api/src/imports/supabase-repo.ts:116` -> `remove`; stale sweep `apps/api/src/imports/consumer.ts:54` -> `expireStale` -> `apps/api/src/imports/supabase-repo.ts:119` -> `expireStale`.

- The consumer passes the stored path through formatOf into import processing: `apps/api/src/imports/consumer.ts:27` -> `formatOf(job.storagePath)` -> `apps/api/src/imports/repo.ts:17` -> `formatOf`; processing uses that format at `apps/api/src/imports/process.ts:44` -> `extractText(input.bytes, input.format)`.

## Assumptions

- Admin bypasses RLS and trusts database ownership/path values; the consumer uses the owner returned by start, not the message's userId. `apps/api/src/imports/supabase-repo.ts:88` -> `createClient`, `apps/api/src/imports/supabase-repo.ts:102` -> `data.user_id`, `apps/api/src/imports/consumer.ts:27` -> `job.userId`
- Storage folder policy does not validate cv_imports.storage_path; normal API writes generate it using the authenticated user ID. `supabase/migrations/20261105000000_imports.sql:8` -> `storage_path text not null`, `apps/api/src/imports/supabase-repo.ts:50` -> `storagePath(user.id`, `apps/api/src/imports/repo.ts:15` -> `${userId}`

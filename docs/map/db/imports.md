---
id: db/imports
area: db
files: ["supabase/migrations/20261105000000_imports.sql","supabase/migrations/20261105010000_import_limit.sql","supabase/tests/database/imports.test.sql"]
depends_on: ["db/imports-repository","db/imports-apply","shared/imports"]
contract: true
checked_hash: 4922a82c
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0004-imports-go-through-a-queue.md", "docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Store queued imports and private uploads with owner access, upload limits and a daily quota.

- cv_imports defaults user_id from auth.uid, cascades user deletion, and restricts status to queued, processing, ready, failed or applied. `supabase/migrations/20261105000000_imports.sql:6` -> `user_id`, `supabase/migrations/20261105000000_imports.sql:10` -> `status in`
- Import rows cap file_name at 255 characters and allow only null or object results up to 524288 bytes. `supabase/migrations/20261105000000_imports.sql:7` -> `char_length(file_name) <= 255`, `supabase/migrations/20261105000000_imports.sql:12` -> `result`
- Current original import policies allow authenticated owners to select and insert only; column grants limit inserts to id/file_name/storage_path, and no owner update/delete permission is granted. `supabase/migrations/20261105000000_imports.sql:23` -> `grant select`, `supabase/migrations/20261105000000_imports.sql:24` -> `grant insert`, `supabase/migrations/20261105000000_imports.sql:26` -> `own imports: read`
- cv-imports is private, limited to 5242880 bytes and PDF/DOCX MIME types; current original object policies allow authenticated upload/read in the caller's first path folder, with no import-file update/delete policy. `supabase/migrations/20261105000000_imports.sql:35` -> `cv-imports`, `supabase/migrations/20261105000000_imports.sql:39` -> `own import files: upload`, `supabase/migrations/20261105000000_imports.sql:42` -> `own import files: read`
- Current original check_import_limit() serializes inserts per user and rejects the eleventh row in a strict rolling 24-hour window; current original cv_imports_limit is a BEFORE INSERT trigger. `supabase/migrations/20261105010000_import_limit.sql:3` -> `check_import_limit`, `supabase/migrations/20261105010000_import_limit.sql:10` -> `pg_advisory_xact_lock`, `supabase/migrations/20261105010000_import_limit.sql:19` -> `cv_imports_limit`
- tested by `supabase/tests/database/imports.test.sql:102` -> `results_eq`

## Connections

- Insert invokes the quota trigger/function: `apps/api/src/imports/supabase-repo.ts:53` -> `insert` -> `supabase/migrations/20261105010000_import_limit.sql:19` -> `cv_imports_limit`, `supabase/migrations/20261105010000_import_limit.sql:21` -> `check_import_limit` -> `supabase/migrations/20261105010000_import_limit.sql:3` -> `check_import_limit`.
- Uses row and Storage policies: `apps/api/src/imports/supabase-repo.ts:66` -> `cv_imports` -> `supabase/migrations/20261105000000_imports.sql:27` -> `auth.uid()`; `apps/api/src/imports/supabase-repo.ts:60` -> `upload` -> `supabase/migrations/20261105000000_imports.sql:41` -> `storage.foldername`.
- Upload bytes must stay synchronized: SQL bucket limit `supabase/migrations/20261105000000_imports.sql:35` -> `5242880` matches `apps/api/src/imports/repo.ts:7` -> `MAX_UPLOAD_BYTES`, enforced before creation at `apps/api/src/imports/routes.ts:33` -> `file.size > MAX_UPLOAD_BYTES`.
- Upload MIME types must stay synchronized: the bucket allowlist `supabase/migrations/20261105000000_imports.sql:36` -> `application/pdf` matches `apps/api/src/imports/supabase-repo.ts:11` -> `CONTENT_TYPES`, used by `apps/api/src/imports/supabase-repo.ts:60` -> `contentType: CONTENT_TYPES[format]`.
- Filename limits must stay synchronized: `supabase/migrations/20261105000000_imports.sql:7` -> `<= 255` matches API truncation at `apps/api/src/imports/routes.ts:46` -> `slice(0, 255)`.
- Daily quotas must stay synchronized: SQL rejects at ten rows `supabase/migrations/20261105010000_import_limit.sql:12` -> `>= 10`, matching `apps/api/src/imports/repo.ts:8` -> `IMPORTS_PER_DAY` used by the precheck at `apps/api/src/imports/routes.ts:41` -> `IMPORTS_PER_DAY`.
- Quota error translation matches the message, not SQLSTATE: `supabase/migrations/20261105010000_import_limit.sql:13` -> `P0001` raises import_limit; `apps/api/src/imports/supabase-repo.ts:56` -> `error?.message === "import_limit"` turns it into HTTP 429 at `apps/api/src/imports/supabase-repo.ts:57` -> `ApiError(429`.
- Scheduled cleanup needs no queue message: `apps/api/src/index.ts:68` -> `sweepStaleImports` calls `apps/api/src/imports/consumer.ts:54` -> `expireStale`; `apps/api/src/imports/supabase-repo.ts:124` -> `created_at` selects old queued/processing rows and returns their paths at `apps/api/src/imports/supabase-repo.ts:127` -> `storagePath`. The sweep invokes `apps/api/src/imports/consumer.ts:55` -> `cleanUp`, which calls `apps/api/src/imports/consumer.ts:61` -> `admin.deleteFile`, implemented at `apps/api/src/imports/supabase-repo.ts:116` -> `remove([job.storagePath])`.

## Assumptions

- The INSERT column grant lets an authenticated caller choose storage_path, including another user's known import path; the row INSERT policy checks user_id only and no constraint checks that storage_path is in that user's folder. The service-role sweep removes job.storagePath without a folder check. `supabase/migrations/20261105000000_imports.sql:24` -> `grant insert (id, file_name, storage_path)`, `supabase/migrations/20261105000000_imports.sql:29` -> `with check (user_id = auth.uid())`, `supabase/migrations/20261105000000_imports.sql:8` -> `storage_path text not null`, `apps/api/src/imports/supabase-repo.ts:88` -> `createClient`, `apps/api/src/imports/supabase-repo.ts:116` -> `remove([job.storagePath])`

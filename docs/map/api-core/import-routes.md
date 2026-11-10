---
id: api-core/import-routes
area: api-core
files: ["apps/api/src/imports/routes.ts","apps/api/test/imports.test.ts","apps/api/test/supabase-repo.test.ts"]
depends_on: ["api-core/import-files","api-core/import-queue","api-core/cv-routes","db/imports","db/imports-repository","db/imports-apply","shared/imports","shared/notes"]
contract: true
checked_hash: 7f532582
cited: [acb606, e8ddeb, 07ec59, e463aa, ed80ae, dfdde5, 2cdb6a, 67c652, 3d8f4a, 43f166, d8f46a, 26a573, 9a1ea5, fb1c80, 2409e3, ae16b4, 2fa953, 91fccc, ba9436, 8f5709, 43ff12, df9988, 1f5195, 7943e0, d06a1e, cd14f5, 5a696b, 2cdb6a, dbbaa5, 23ffed, dbbaa5, ff7036, 202242, 187ad8, 23ffed, 80eef3, a054fd, fdf517, acb606, e8ddeb, e463aa, 43ef46, 841c79, e3b4ca, 10d980, 42f52c, a7050b]
decisions: ["docs/decisions/0004-imports-go-through-a-queue.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Accept uploads, poll import results and apply reviewed content to My CV.

- Before parsing multipart data, only declared Content-Length is checked against the file limit plus 64 KiB; an absent header becomes zero. After parsing, the selected file must be a File, satisfy its own size limit, and pass signature sniffing. `apps/api/src/imports/routes.ts:29` -> `content-length`, `apps/api/src/imports/routes.ts:30` -> `formData`, `apps/api/src/imports/routes.ts:32` -> `File`, `apps/api/src/imports/routes.ts:33` -> `file.size`, `apps/api/src/imports/routes.ts:36` -> `sniffFormat`
- Upload checks the previous 24 hours against IMPORTS_PER_DAY before creating a UUID and storing the import. `apps/api/src/imports/routes.ts:40` -> `since`
- Creation happens before queue send; a send failure leaves the stored import for scheduled expiry rather than rolling it back. `apps/api/src/imports/routes.ts:46` -> `repo.create`
- POST returns the repository's import response with 202; polling invalid UUIDs and missing imports returns 404. `apps/api/src/imports/routes.ts:48` -> `202`, `apps/api/src/imports/routes.ts:53` -> `isUuid`
- Apply accepts a nonnegative version and requires ready status; stale/already-used imports return 409 import_not_ready. `apps/api/src/imports/routes.ts:60` -> `ApplyBody.parse`, `apps/api/src/imports/routes.ts:64` -> `notReady`
- Apply carries notes from an existing CV; if the carried result fails schema validation it leaves content undefined so the repository uses the import result. `apps/api/src/imports/routes.ts:69` -> `found.result`
- tested by `apps/api/test/imports.test.ts:70` -> `import endpoints`, `apps/api/test/imports.test.ts:72` -> `upload`

## Connections
- Web upload/poll/apply URLs: `apps/web/src/imports/imports-api.ts:7` -> `/v1/imports` -> `apps/api/src/imports/routes.ts:27` -> `app.post`; `apps/web/src/imports/imports-api.ts:11` -> `encodeURIComponent` -> `apps/api/src/imports/routes.ts:51` -> `/:id`; `apps/web/src/imports/imports-api.ts:15` -> `/apply` -> `apps/api/src/imports/routes.ts:58` -> `/:id/apply`; mount `apps/api/src/app.ts:76` -> `/v1/imports`.
- Queue producer and consumer use {importId:string,userId:string}: `apps/api/src/imports/routes.ts:47` -> `queue.send` -> `apps/api/src/imports/repo.ts:11` -> `ImportMessage` -> `apps/api/src/imports/consumer.ts:22` -> `msg.body.importId`.
- Apply RPC: `apps/api/src/imports/routes.ts:74` -> `repo.apply` -> `apps/api/src/imports/supabase-repo.ts:78` -> `apply_import` -> `supabase/migrations/20261106010000_apply_import_content.sql:10` -> `apply_import`.
- Import creation inserts a row before uploading storage bytes: `apps/api/src/imports/routes.ts:46` -> `repo.create` -> `apps/api/src/imports/supabase-repo.ts:53` -> `insert`, `apps/api/src/imports/supabase-repo.ts:60` -> `upload`.
- Row insertion invokes the database quota trigger: `apps/api/src/imports/supabase-repo.ts:53` -> `insert` -> `supabase/migrations/20261105010000_import_limit.sql:19` -> `cv_imports_limit` -> `supabase/migrations/20261105010000_import_limit.sql:21` -> `check_import_limit` -> `supabase/migrations/20261105010000_import_limit.sql:3` -> `check_import_limit`.
- User-scoped upload uses owner-folder storage policy: `apps/api/src/imports/supabase-repo.ts:60` -> `upload` -> `supabase/migrations/20261105000000_imports.sql:39` -> `own import files: upload`.
- Note carry helper: `apps/api/src/imports/routes.ts:71` -> `carryNotes` -> `packages/shared/src/notes.ts:35` -> `carryNotes`.

## Assumptions
- With no Content-Length header, this route does not bound actual multipart overhead: formData parses the request before the selected file size is checked. `apps/api/src/imports/routes.ts:29` -> `content-length`, `apps/api/src/imports/routes.ts:30` -> `formData`, `apps/api/src/imports/routes.ts:33` -> `file.size`

- Polling/counting do not add user filters; the JWT client and owner read policy must restrict them. `apps/api/src/imports/supabase-repo.ts:44` -> `Authorization`, `apps/api/src/imports/supabase-repo.ts:66` -> `eq("id", id)`, `apps/api/src/imports/supabase-repo.ts:72` -> `gte`, `supabase/migrations/20261105000000_imports.sql:27` -> `auth.uid()`
- Apply runs as a definer and must enforce ownership/status itself; it locks the ready import belonging to auth.uid. `supabase/migrations/20261106010000_apply_import_content.sql:13` -> `security definer`, `supabase/migrations/20261106010000_apply_import_content.sql:28` -> `i.user_id = v_user`

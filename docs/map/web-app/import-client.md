---
id: web-app/import-client
area: web-app
files: ["apps/web/src/imports/imports-api.ts"]
depends_on: ["web-app/api-client","shared/imports","shared/api-responses","api-core/import-routes","web-editor/cv-api","api-core/import-queue","db/imports-repository","db/imports-apply","db/imports"]
contract: false
checked_hash: c92ad69d
decisions: ["docs/decisions/0001-an-api-between-browser-and-database.md","docs/decisions/0002-the-api-acts-as-the-signed-in-user.md","docs/decisions/0004-imports-go-through-a-queue.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Expose upload, polling and version-checked application of an import.

- startImport puts the File under the multipart field name file. `apps/web/src/imports/imports-api.ts:5` -> `FormData`
- Upload uses POST /v1/imports and validates ImportResponseSchema. `apps/web/src/imports/imports-api.ts:7` -> `ImportResponseSchema`
- Polling uses an encoded import ID and the same response schema. `apps/web/src/imports/imports-api.ts:11` -> `encodeURIComponent`
- Applying sends only a version in JSON and parses SaveResponseSchema; it does not send reviewed CV content. `apps/web/src/imports/imports-api.ts:15` -> `json: { version }`
- The apply method returns SaveResponse, so locally moved content requires a subsequent CV save by the review screen. `apps/web/src/imports/imports-api.ts:14` -> `Promise<SaveResponse>`; `apps/web/src/imports/ImportScreen.tsx:92` -> `saveCv`
## Connections
- POST /v1/imports: `apps/web/src/imports/imports-api.ts:7` -> `/v1/imports`; mount `apps/api/src/app.ts:76` -> `/v1/imports`; handler `apps/api/src/imports/routes.ts:27` -> `app.post`
- GET /v1/imports/:id: `apps/web/src/imports/imports-api.ts:11` -> `/v1/imports/`; `apps/api/src/imports/routes.ts:51` -> `app.get`
- POST /v1/imports/:id/apply: `apps/web/src/imports/imports-api.ts:15` -> `/apply`; `apps/api/src/imports/routes.ts:58` -> `/:id/apply`
- Used by upload and review: `apps/web/src/imports/ImportButton.tsx:24` -> `startImport`; `apps/web/src/imports/imports-api.ts:4` -> `startImport`; `apps/web/src/imports/ImportScreen.tsx:87` -> `applyImport`; `apps/web/src/imports/imports-api.ts:14` -> `applyImport`
- Upload returns before queue processing; the import ID connects enqueueing to consumption: `apps/web/src/imports/imports-api.ts:7` -> `POST`; `apps/api/src/imports/routes.ts:47` -> `deps.queue.send`; `apps/api/src/imports/consumer.ts:22` -> `msg.body.importId`
- Apply reaches the version-checked database RPC: `apps/api/src/imports/routes.ts:74` -> `repo.apply`; `apps/api/src/imports/supabase-repo.ts:78` -> `db.rpc("apply_import"`; `supabase/migrations/20261106010000_apply_import_content.sql:10` -> `public.apply_import`
- Import reads rely on ownership RLS rather than a repository user filter: `apps/api/src/imports/supabase-repo.ts:66` -> `eq("id", id)`; `supabase/migrations/20261105000000_imports.sql:27` -> `user_id = auth.uid()`
- Upload storage paths are checked by the storage upload policy: `apps/api/src/imports/supabase-repo.ts:60` -> `upload(path, bytes`; `supabase/migrations/20261105000000_imports.sql:41` -> `storage.foldername(name)`
- Import row creation invokes the database daily-limit trigger: `apps/api/src/imports/supabase-repo.ts:53` -> `.insert`; `supabase/migrations/20261105010000_import_limit.sql:19` -> `cv_imports_limit`; `supabase/migrations/20261105010000_import_limit.sql:21` -> `check_import_limit`

## Assumptions
- Import ownership is enforced server-side; the client supplies an import ID/version, while the API constructs repositories using the user bearer token. `apps/web/src/imports/imports-api.ts:15` -> `version`; `apps/api/src/imports/supabase-repo.ts:44` -> `Authorization`

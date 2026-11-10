---
id: api-core/cv-routes
area: api-core
files: ["apps/api/src/cv/routes.ts","apps/api/test/cv.test.ts","apps/api/test/cv-history.test.ts","apps/api/test/cv-notes.test.ts","apps/api/test/supabase-repo.test.ts"]
depends_on: ["api-core/errors","db/cv-repository","db/base-cv","db/cv-history","db/job-notes","shared/cv","shared/notes","shared/api-responses","shared/stored-cv"]
contract: true
checked_hash: 8c5373af
decisions: ["docs/decisions/0005-one-cv-per-user-with-history.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Read, save and restore the signed-in user's base CV with version conflicts.

- readJson checks declared size and actual UTF-8 bytes against MAX_CV_BYTES, and turns invalid JSON into 400 invalid_json. `apps/api/src/cv/routes.ts:12` -> `readJson`
- Save requires validated CV content and a nonnegative integer version. `apps/api/src/cv/routes.ts:8` -> `SaveBody`, `apps/api/src/cv/routes.ts:45` -> `SaveBody.parse`
- Conflicts return 409 version_conflict plus current.version/current.updatedAt; successful saves return the new version/time. `apps/api/src/cv/routes.ts:28` -> `saveResponse`
- History lookup and restore report 404 for absent entries. `apps/api/src/cv/routes.ts:51` -> `app.get`, `apps/api/src/cv/routes.ts:61` -> `getHistory`
- Restore merges newer notes from the current CV before validating, size-checking and passing content with the client's version to restore. `apps/api/src/cv/routes.ts:63` -> `repo.get`
- tested by `apps/api/test/cv.test.ts:50` -> `My CV`, `apps/api/test/cv.test.ts:105` -> `history`, `apps/api/test/cv-history.test.ts:49` -> `history restore keeps newer notes`, `apps/api/test/cv.test.ts:52` -> `get`

## Connections
- Web GET/PUT CV: `apps/web/src/cv/cv-api.ts:15` -> `/v1/cv` -> `apps/api/src/cv/routes.ts:42` -> `app.get`; `apps/web/src/cv/cv-api.ts:38` -> `/v1/cv` -> `apps/api/src/cv/routes.ts:44` -> `app.put`; mount `apps/api/src/app.ts:74` -> `/v1/cv`.
- Web history list/detail/restore: `apps/web/src/cv/cv-api.ts:22` -> `/v1/cv/history` -> `apps/api/src/cv/routes.ts:49` -> `/history`; `apps/web/src/cv/cv-api.ts:26` -> `encodeURIComponent` -> `apps/api/src/cv/routes.ts:51` -> `/history/:id`; `apps/web/src/cv/cv-api.ts:30` -> `/restore` -> `apps/api/src/cv/routes.ts:57` -> `/history/:id/restore`.
- Save RPC: `apps/api/src/cv/routes.ts:46` -> `save` -> `apps/api/src/cv/supabase-repo.ts:48` -> `save_base_cv` -> `supabase/migrations/20261104000000_baseline.sql:73` -> `save_base_cv`.
- Restore RPC: `apps/api/src/cv/routes.ts:66` -> `repo.restore` -> `apps/api/src/cv/supabase-repo.ts:91` -> `restore_base_cv` -> `supabase/migrations/20261108010000_restore_keeps_notes.sql:4` -> `restore_base_cv`.
- Notes helper: `apps/api/src/cv/routes.ts:64` -> `mergeNewerNotes` -> `packages/shared/src/notes.ts:50` -> `mergeNewerNotes`; notes-only persistence RPC `apps/api/src/cv/supabase-repo.ts:57` -> `add_job_notes` -> `supabase/migrations/20261109230000_job_notes_projects.sql:3` -> `add_job_notes`.
- CV/history reads trust RLS: `apps/api/src/cv/supabase-repo.ts:35` -> `base_cvs` -> `supabase/migrations/20261104000000_baseline.sql:52` -> `own cv: read`; `apps/api/src/cv/supabase-repo.ts:82` -> `base_cv_versions` -> `supabase/migrations/20261104000000_baseline.sql:59` -> `own history: read`.

## Assumptions
- The route has no owner filter; its repository must be bound to the context user. `apps/api/src/app.ts:74` -> `deps.cvRepo`
- Restore's merged content is computed before the database write; the supplied version must protect that write against concurrent changes. `apps/api/src/cv/routes.ts:63` -> `repo.get`, `apps/api/src/cv/routes.ts:66` -> `repo.restore`

---
id: db/cv-repository
area: db
files: ["apps/api/src/cv/repo.ts", "apps/api/src/cv/supabase-repo.ts", "apps/api/src/cv/memory-repo.ts", "apps/api/src/enrich/repo.test.ts"]
depends_on: ["db/base-cv", "db/cv-history", "db/job-notes", "shared/cv", "shared/api-responses", "shared/stored-cv", "shared/notes"]
contract: false
checked_hash: cf364301
cited: [00f6d3, 131285, 90cc8f, 3a862b, 2b8a5e, 0b28ea, 50158f, 599268, 91581c, f1fa48, 919b08, 90296a, fed4f6, 9a5efd, 58b945, 83f003, ee178c, c58746, 56fa38, 50158f, 5ffd7d, a48089, 4e2e12, 40571f, 13b5c0, 121c13, c590fc, e5d885, e7c939, 5be7b7, 006c86, 19b510, c568e8, 07c9a0, 9590d0, 88a6e4, cfd773, 6d3223, 81cfca, c329ae, e15887, 666166, 374d76, a352da, 086796, 78cdb8, 9ec6a7, 13fe6b, feecaa, ac30fe, 5ffd7d, ca3538, 40571f, 13b5c0, 121c13, 4e2e12, a48089, 073a4c, 55e01a, ccc7d4, 2b8a5e, a20565, ac74c9, 3d023c]
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Expose current CV, history and note writes through a user-scoped repository and its test fake.

- SaveResult carries ok plus version/time; restore can additionally return null, and note appends have no expected-version parameter. `apps/api/src/cv/repo.ts:9` -> `SaveResult`, `apps/api/src/cv/repo.ts:17` -> `addJobNotes`, `apps/api/src/cv/repo.ts:22` -> `restore`
- Supabase uses the user's bearer token; get selects without a user filter and returns empty content/version zero/epoch when no row is visible. `apps/api/src/cv/supabase-repo.ts:23` -> `Authorization`, `apps/api/src/cv/supabase-repo.ts:35` -> `base_cvs`, `apps/api/src/cv/supabase-repo.ts:39` -> `emptyCv`
- Stored content is parsed through StoredCvSchema; malformed content throws a server error rather than becoming an empty CV. `apps/api/src/cv/supabase-repo.ts:11` -> `StoredCvSchema`, `apps/api/src/cv/supabase-repo.ts:14` -> `throw new Error`
- Save requires an RPC result row and inverts conflict into ok; restore instead maps no rows to null. `apps/api/src/cv/supabase-repo.ts:28` -> `save function returned no row`, `apps/api/src/cv/supabase-repo.ts:98` -> `rows.length`
- History lists only ID/reason/time, descending by created_at, limited to 50; fetching one snapshot parses its content. `apps/api/src/cv/supabase-repo.ts:71` -> `select`, `apps/api/src/cv/supabase-repo.ts:87` -> `storedCv`
- Note RPC P0002 becomes role_not_found; the specific size error becomes HTTP 413; other errors stay generic. `apps/api/src/cv/supabase-repo.ts:58` -> `P0002`, `apps/api/src/cv/supabase-repo.ts:59` -> `54000`
- The fake is one CV per repository instance, not a multi-user store; it clones save input and returned current content. `apps/api/src/cv/memory-repo.ts:10` -> `let row`, `apps/api/src/cv/memory-repo.ts:34` -> `structuredClone`, `apps/api/src/cv/memory-repo.ts:37` -> `structuredClone`
- Fake save/restore do not perform SQL object/size checks or stored-schema parsing, so runtime-invalid content may pass fake calls but fail database writes or subsequent reads. `apps/api/src/cv/memory-repo.ts:28` -> `row =`, `supabase/migrations/20261104010000_cv_content_checks.sql:7` -> `check`, `apps/api/src/cv/supabase-repo.ts:11` -> `StoredCvSchema`
- GET /v1/cv/history/not-a-uuid returns 404 with memory storage but 500 with Supabase: the route passes the ID without UUID validation; the fake finds no matching string, while the UUID database lookup errors and the adapter throws. `apps/api/src/cv/routes.ts:52` -> `getHistory(c.req.param("id"))`, `apps/api/src/cv/routes.ts:53` -> `ApiError(404`, `apps/api/src/cv/memory-repo.ts:63` -> `null`, `supabase/migrations/20261104000000_baseline.sql:16` -> `uuid`, `apps/api/src/cv/supabase-repo.ts:86` -> `throw new Error`, `apps/api/src/errors.ts:51` -> `status: 500`
- Fake AI snapshots always insert, whereas the current SQL suppresses an identical newest copy. `apps/api/src/cv/memory-repo.ts:71` -> `snapshot(row.content, reason)`, `supabase/migrations/20261106030000_snapshot_skip_same.sql:25` -> `is distinct from`
- The fake's note limit measures compact JSON.stringify bytes; SQL measures JSONB text, so near-limit payloads can pass the fake and fail SQL's larger serialization. `apps/api/src/cv/memory-repo.ts:52` -> `JSON.stringify`, `supabase/migrations/20261109230000_job_notes_projects.sql:44` -> `octet_length`
- tested by `apps/api/src/enrich/repo.test.ts:104` -> `memoryCvRepo.snapshot`

## Connections

- Uses RPC contracts: `apps/api/src/cv/supabase-repo.ts:48` -> `rpc("save_base_cv"` -> `supabase/migrations/20261104000000_baseline.sql:73` -> `save_base_cv`; `apps/api/src/cv/supabase-repo.ts:91` -> `rpc("restore_base_cv"` -> `supabase/migrations/20261108010000_restore_keeps_notes.sql:4` -> `restore_base_cv`.
- Uses note and snapshot RPCs: `apps/api/src/cv/supabase-repo.ts:57` -> `rpc("add_job_notes"` -> `supabase/migrations/20261109230000_job_notes_projects.sql:3` -> `add_job_notes`; `apps/api/src/cv/supabase-repo.ts:102` -> `rpc("snapshot_base_cv"` -> `supabase/migrations/20261106030000_snapshot_skip_same.sql:5` -> `snapshot_base_cv`.
- Used by web read/save URLs and API handlers: `apps/web/src/cv/cv-api.ts:15` -> `/v1/cv`, `apps/web/src/cv/cv-api.ts:38` -> `/v1/cv` -> `apps/api/src/cv/routes.ts:42` -> `app.get`, `apps/api/src/cv/routes.ts:44` -> `app.put`; mounted at `apps/api/src/app.ts:74` -> `/v1/cv`.
- Used by web history/list/restore URLs: `apps/web/src/cv/cv-api.ts:22` -> `/v1/cv/history`, `apps/web/src/cv/cv-api.ts:26` -> `/v1/cv/history`, `apps/web/src/cv/cv-api.ts:30` -> `/restore` -> `apps/api/src/cv/routes.ts:49` -> `/history`, `apps/api/src/cv/routes.ts:51` -> `/history/:id`, `apps/api/src/cv/routes.ts:57` -> `/history/:id/restore`.
- History ID errors flow from the unvalidated route to the UUID filter and generic error response: `apps/api/src/cv/routes.ts:52` -> `getHistory` -> `apps/api/src/cv/supabase-repo.ts:84` -> `eq("id", id)` -> `supabase/migrations/20261104000000_baseline.sql:16` -> `uuid`; the throw at `apps/api/src/cv/supabase-repo.ts:86` -> `throw new Error` becomes `apps/api/src/errors.ts:51` -> `status: 500`. The fake instead returns null at `apps/api/src/cv/memory-repo.ts:63` -> `null`, handled by `apps/api/src/cv/routes.ts:53` -> `ApiError(404`.

- CvRepo method changes also require updating the hand-written rawRepo fake used by route tests, outside the repository modules: `apps/api/src/cv/repo.ts:12` -> `CvRepo` -> `apps/api/test/cv.test.ts:175` -> `function rawRepo`, built at `apps/api/test/cv.test.ts:176` -> `return {`.

## Assumptions

- get and listHistory require RLS to scope rows; no user predicate is added by these queries. `apps/api/src/cv/supabase-repo.ts:35` -> `base_cvs`, `supabase/migrations/20261104000000_baseline.sql:53` -> `auth.uid`, `apps/api/src/cv/supabase-repo.ts:70` -> `base_cv_versions`, `supabase/migrations/20261104000000_baseline.sql:60` -> `auth.uid`

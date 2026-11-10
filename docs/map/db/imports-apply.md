---
id: db/imports-apply
area: db
files: ["supabase/migrations/20261106010000_apply_import_content.sql","apps/api/src/imports/repo.ts","apps/api/src/imports/supabase-repo.ts","apps/api/src/imports/memory-repo.ts","supabase/tests/database/imports.test.sql"]
depends_on: ["db/imports","db/base-cv","shared/cv","shared/notes","shared/api-responses"]
contract: true
checked_hash: b6bf9577
cited: [58a735, 5a696b, e24103, 42f52c, 4251d5, a7050b, 12bba6, a76caf, 6c6968, 2b1103, d523fd, f6aaed, a22242, d523fd, 1963d7, 56fa38, e34a89, ee178c, a22242, 184b29, cd14f5, 5a696b, 168b2b, 5716bd, ba9436, 8f5709, cd14f5, 5a696b, a7050b, 12bba6, 56fa38]
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0004-imports-go-through-a-queue.md", "docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Apply a ready import atomically to the current CV while preserving a replacement history copy.

- Current apply_import(uuid,int,jsonb default null) replaces imports.sql's two-argument function, which is explicitly dropped; the default supports omitted content without keeping an overload. `supabase/migrations/20261106010000_apply_import_content.sql:8` -> `drop function`, `supabase/migrations/20261106010000_apply_import_content.sql:10` -> `apply_import`, `supabase/migrations/20261105000000_imports.sql:53` -> `apply_import`
- Apply runs as definer, rejects missing auth.uid, locks only the caller's ready import, and returns no row for absent/non-ready imports or SQL-null stored content. Supplied content overrides the stored result only after these checks. `supabase/migrations/20261106010000_apply_import_content.sql:13` -> `security definer`, `supabase/migrations/20261106010000_apply_import_content.sql:22` -> `v_user is null`, `supabase/migrations/20261106010000_apply_import_content.sql:28` -> `i.user_id = v_user`, `supabase/migrations/20261106010000_apply_import_content.sql:35` -> `coalesce`
- Apply locks the current CV; non-NULL expected versions must be zero for creation or match the existing version for replacement, otherwise it returns conflict before marking applied. SQL NULL bypasses both <> checks. `supabase/migrations/20261106010000_apply_import_content.sql:37` -> `for update`, `supabase/migrations/20261106010000_apply_import_content.sql:40` -> `p_expected_version <> 0`, `supabase/migrations/20261106010000_apply_import_content.sql:48` -> `v_row.version <> p_expected_version`, `supabase/migrations/20261106010000_apply_import_content.sql:61` -> `status = 'applied'`
- Replacement always saves an import history copy, increments the CV version, trims history, then marks the import applied within the same function; creation has no history copy. `supabase/migrations/20261106010000_apply_import_content.sql:44` -> `insert into public.base_cvs`, `supabase/migrations/20261106010000_apply_import_content.sql:53` -> `base_cv_versions`, `supabase/migrations/20261106010000_apply_import_content.sql:61` -> `status = 'applied'`
- Apply's current execute grants exclude public/anon; content shape/size enforcement comes from base table constraints rather than a full shared-schema check inside the function. `supabase/migrations/20261106010000_apply_import_content.sql:66` -> `revoke execute`, `supabase/migrations/20261104010000_cv_content_checks.sql:7` -> `check`
- Fake apply delegates to CvRepo.save, using autosave history timing/reason instead of SQL's unconditional import copy. `apps/api/src/imports/memory-repo.ts:60` -> `.save`, `apps/api/src/cv/memory-repo.ts:37` -> `autosave`, `supabase/migrations/20261106010000_apply_import_content.sql:53` -> `'import'`
- tested by `supabase/tests/database/imports.test.sql:102` -> `results_eq`

## Connections

- Used by ImportRepo.apply RPC: `apps/api/src/imports/supabase-repo.ts:78` -> `rpc("apply_import"` -> `supabase/migrations/20261106010000_apply_import_content.sql:10` -> `apply_import`; uses trimming at `supabase/migrations/20261106010000_apply_import_content.sql:58` -> `trim_cv_history` -> `supabase/migrations/20261104000000_baseline.sql:170` -> `trim_cv_history`.
- Used by the web apply URL and route: `apps/web/src/imports/imports-api.ts:15` -> `/apply` reaches `apps/api/src/imports/routes.ts:58` -> `/:id/apply`; the repository invokes `apps/api/src/imports/supabase-repo.ts:78` -> `rpc("apply_import"` -> `supabase/migrations/20261106010000_apply_import_content.sql:10` -> `apply_import`.

## Assumptions

- Supplied content need not equal the stored extraction: the function accepts p_content after checking the owned ready row and stored content, while table constraints enforce only object shape and size. `supabase/migrations/20261106010000_apply_import_content.sql:28` -> `i.user_id = v_user`, `supabase/migrations/20261106010000_apply_import_content.sql:35` -> `coalesce`, `supabase/migrations/20261104010000_cv_content_checks.sql:7` -> `check`

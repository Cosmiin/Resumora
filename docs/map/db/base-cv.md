---
id: db/base-cv
area: db
files: ["supabase/migrations/20261104000000_baseline.sql", "supabase/migrations/20261104010000_cv_content_checks.sql", "supabase/tests/database/baseline.test.sql", "supabase/tests/database/content-checks.test.sql"]
depends_on: ["shared/cv", "shared/stored-cv"]
contract: true
checked_hash: eab10acd
decisions: ["docs/decisions/0002-the-api-acts-as-the-signed-in-user.md", "docs/decisions/0005-one-cv-per-user-with-history.md", "docs/decisions/0006-last-save-wins-with-a-version-check.md", "docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Store one current CV per account and bounded historical copies, with atomic version-checked saves.

- The current CV is keyed by user, has a positive version, and disappears when its auth user is deleted; history has independent UUIDs and the same user-delete cascade. `supabase/migrations/20261104000000_baseline.sql:9` -> `user_id`, `supabase/migrations/20261104000000_baseline.sql:17` -> `user_id`
- Current content constraints require JSON objects of at most 524288 bytes in both tables; these are shape/size checks, not the shared CV schema. `supabase/migrations/20261104010000_cv_content_checks.sql:7` -> `jsonb_typeof`, `supabase/migrations/20261104010000_cv_content_checks.sql:11` -> `jsonb_typeof`
- Current, original baseline policies allow authenticated owners to select/insert/update base_cvs, with ownership checked before and after update; there is no authenticated delete grant or policy. `supabase/migrations/20261104000000_baseline.sql:48` -> `grant select, insert, update`, `supabase/migrations/20261104000000_baseline.sql:52` -> `own cv: read`, `supabase/migrations/20261104000000_baseline.sql:56` -> `own cv: update`
- Current, original baseline history policies allow authenticated owners to select/insert/delete, but not update; accepted reasons are autosave, restore, import and ai. `supabase/migrations/20261104000000_baseline.sql:49` -> `grant select, insert, delete`, `supabase/migrations/20261104000000_baseline.sql:59` -> `own history: read`, `supabase/migrations/20261104000000_baseline.sql:63` -> `own history: trim`, `supabase/migrations/20261104000000_baseline.sql:20` -> `reason`
- save_base_cv(jsonb,int) is still its original baseline definition, runs as invoker with an empty search path, and rejects a missing authenticated user. `supabase/migrations/20261104000000_baseline.sql:73` -> `save_base_cv`, `supabase/migrations/20261104000000_baseline.sql:84` -> `v_user is null`
- A first save accepts expected version zero or SQL NULL because the check uses <>; a simultaneous first insert returns the winner's version as a conflict rather than overwriting it. `supabase/migrations/20261104000000_baseline.sql:91` -> `p_expected_version <> 0`, `supabase/migrations/20261104000000_baseline.sql:97` -> `on conflict`, `supabase/migrations/20261104000000_baseline.sql:101` -> `v_row.version`
- Existing rows are locked before comparison; stale saves return current version/time without a write. Successful saves increment version even when content is unchanged. `supabase/migrations/20261104000000_baseline.sql:88` -> `for update`, `supabase/migrations/20261104000000_baseline.sql:108` -> `p_expected_version`, `supabase/migrations/20261104000000_baseline.sql:122` -> `version = b.version + 1`
- Autosave copies the pre-save content only if no history row of any reason was created in the last ten minutes. `supabase/migrations/20261104000000_baseline.sql:114` -> `if not exists`
- trim_cv_history(uuid) is still its original baseline invoker function: it deletes everything except the newest 50 by created_at, without a secondary tie-breaker. `supabase/migrations/20261104000000_baseline.sql:170` -> `trim_cv_history`, `supabase/migrations/20261104000000_baseline.sql:181` -> `order by h2.created_at desc`
- save_base_cv and trim_cv_history execution is granted to authenticated and revoked from public/anon. `supabase/migrations/20261104000000_baseline.sql:186` -> `revoke execute`, `supabase/migrations/20261104000000_baseline.sql:188` -> `grant execute`
- tested by `supabase/tests/database/baseline.test.sql:27` -> `results_eq`
- tested by `supabase/tests/database/content-checks.test.sql:10` -> `throws_ok`

## Connections

- Used by CvRepo.save through RPC: `apps/api/src/cv/supabase-repo.ts:48` -> `rpc("save_base_cv"` -> `supabase/migrations/20261104000000_baseline.sql:73` -> `save_base_cv`.
- Uses history trimming after save; no repository invokes trim directly: `supabase/migrations/20261104000000_baseline.sql:126` -> `trim_cv_history` -> `supabase/migrations/20261104000000_baseline.sql:170` -> `trim_cv_history`.
- Unfiltered current-CV reads depend on the owner policy: `apps/api/src/cv/supabase-repo.ts:35` -> `base_cvs` -> `supabase/migrations/20261104000000_baseline.sql:53` -> `auth.uid`.
- History reads depend on the separate history policy: `apps/api/src/cv/supabase-repo.ts:70` -> `base_cv_versions` -> `supabase/migrations/20261104000000_baseline.sql:60` -> `auth.uid`.
- Uses application validation for detailed content: `apps/api/src/cv/routes.ts:45` -> `SaveBody.parse` -> `apps/api/src/cv/routes.ts:8` -> `CvContentSchema`; database reads additionally parse stored shapes at `apps/api/src/cv/supabase-repo.ts:11` -> `StoredCvSchema`.
- Autosave timing must stay synchronized between SQL and the fake: `supabase/migrations/20261104000000_baseline.sql:116` -> `10 minutes` matches `apps/api/src/cv/repo.ts:6` -> `SNAPSHOT_INTERVAL_MS`, used at `apps/api/src/cv/memory-repo.ts:25` -> `SNAPSHOT_INTERVAL_MS`.
- History retention and read limits must stay synchronized: SQL trimming at `supabase/migrations/20261104000000_baseline.sql:182` -> `limit 50` matches `apps/api/src/cv/repo.ts:4` -> `HISTORY_LIMIT` and the adapter read cap at `apps/api/src/cv/supabase-repo.ts:73` -> `limit(50)`.

## Assumptions

- Versioning and history creation rely on callers choosing the RPC: table grants also permit direct owner writes that bypass that workflow. `supabase/migrations/20261104000000_baseline.sql:48` -> `grant select, insert, update`, `supabase/migrations/20261104000000_baseline.sql:121` -> `update public.base_cvs`
- trim_cv_history accepts a user argument rather than checking auth.uid itself; invoker execution and history RLS restrict which rows can be deleted. `supabase/migrations/20261104000000_baseline.sql:173` -> `security invoker`, `supabase/migrations/20261104000000_baseline.sql:64` -> `auth.uid`

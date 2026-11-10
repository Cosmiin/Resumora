---
id: db/cv-history
area: db
files: ["supabase/migrations/20261104000000_baseline.sql", "supabase/migrations/20261106000000_enrichment.sql", "supabase/migrations/20261106030000_snapshot_skip_same.sql", "supabase/migrations/20261108010000_restore_keeps_notes.sql", "supabase/tests/database/baseline.test.sql", "supabase/tests/database/enrichment.test.sql"]
depends_on: ["db/base-cv", "shared/notes"]
contract: true
checked_hash: 61a0ab92
cited: [fb1cb9, 9590d0, cc42a6, b1d66b, 4bf5ad, 43abe0, bc3596, bb8bcf, 56fa38, 81cfca, 812d3c, c0defa, cde008, 856309, 85db3a, 298637, bb85fb, e5d885, 298637, 27081d, 624131, a8766d, 3c49a6, 07c9a0, 9590d0, 6d3223, 81cfca, 647891, 298637, 5716bd, 263c88, 1e4695, bb8bcf, 4bf5ad, bb8bcf, 263c88, e5d885, c590fc]
decisions: ["docs/decisions/0005-one-cv-per-user-with-history.md", "docs/decisions/0006-last-save-wins-with-a-version-check.md", "docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Restore caller-prepared content and copy the current CV before AI changes.

- Current restore_base_cv(uuid,int,jsonb) replaces the baseline two-argument function; that old signature is explicitly dropped, so it is not a surviving overload. `supabase/migrations/20261108010000_restore_keeps_notes.sql:2` -> `drop function`, `supabase/migrations/20261108010000_restore_keeps_notes.sql:4` -> `restore_base_cv`, `supabase/migrations/20261104000000_baseline.sql:132` -> `restore_base_cv`
- Restore runs as invoker, returns no row if the history ID is absent for auth.uid, then locks the current CV and returns a conflict when it is missing or stale. `supabase/migrations/20261108010000_restore_keeps_notes.sql:7` -> `security invoker`, `supabase/migrations/20261108010000_restore_keeps_notes.sql:17` -> `h.user_id = v_user`, `supabase/migrations/20261108010000_restore_keeps_notes.sql:22` -> `for update`
- Restore requires an object payload, copies the old current CV with reason restore, then saves the supplied payload rather than reading the snapshot content. The table constraint supplies the size limit. `supabase/migrations/20261108010000_restore_keeps_notes.sql:28` -> `jsonb_typeof`, `supabase/migrations/20261108010000_restore_keeps_notes.sql:35` -> `content = p_content`, `supabase/migrations/20261104010000_cv_content_checks.sql:7` -> `524288`
- Current snapshot_base_cv(text) is the snapshot_skip_same replacement of enrichment's original definition; the signature is unchanged, not an overload. `supabase/migrations/20261106030000_snapshot_skip_same.sql:5` -> `snapshot_base_cv`, `supabase/migrations/20261106000000_enrichment.sql:34` -> `snapshot_base_cv`
- Snapshot runs as definer, requires auth.uid and exactly the ai reason, and inserts nothing when there is no current CV; it still trims excess history. `supabase/migrations/20261106030000_snapshot_skip_same.sql:8` -> `security definer`, `supabase/migrations/20261106030000_snapshot_skip_same.sql:14` -> `v_user is null`, `supabase/migrations/20261106030000_snapshot_skip_same.sql:17` -> `is distinct from 'ai'`, `supabase/migrations/20261106030000_snapshot_skip_same.sql:21` -> `insert into`, `supabase/migrations/20261106030000_snapshot_skip_same.sql:33` -> `trim_cv_history`, `supabase/migrations/20261104000000_baseline.sql:176` -> `delete from`
- Snapshot compares current JSONB with the newest history content regardless of reason; an identical newest copy suppresses insertion, and trimming still runs. `supabase/migrations/20261106030000_snapshot_skip_same.sql:25` -> `is distinct from`, `supabase/migrations/20261106030000_snapshot_skip_same.sql:33` -> `trim_cv_history`
- Both current functions revoke public/anon execution and grant authenticated execution. `supabase/migrations/20261108010000_restore_keeps_notes.sql:44` -> `revoke execute`, `supabase/migrations/20261106030000_snapshot_skip_same.sql:37` -> `revoke execute`
- tested by `supabase/tests/database/baseline.test.sql:47` -> `results_eq`
- tested by `supabase/tests/database/enrichment.test.sql:85` -> `two copies of the same CV leave one row`

## Connections

- Used by CvRepo.restore RPC: `apps/api/src/cv/supabase-repo.ts:91` -> `rpc("restore_base_cv"` -> `supabase/migrations/20261108010000_restore_keeps_notes.sql:4` -> `restore_base_cv`.
- Used by CvRepo.snapshot RPC: `apps/api/src/cv/supabase-repo.ts:102` -> `rpc("snapshot_base_cv"` -> `supabase/migrations/20261106030000_snapshot_skip_same.sql:5` -> `snapshot_base_cv`.
- Uses shared history trimming in both workflows: `supabase/migrations/20261108010000_restore_keeps_notes.sql:39` -> `trim_cv_history`, `supabase/migrations/20261106030000_snapshot_skip_same.sql:33` -> `trim_cv_history` -> `supabase/migrations/20261104000000_baseline.sql:170` -> `trim_cv_history`.
- Uses API-prepared notes merge: `apps/api/src/cv/routes.ts:64` -> `mergeNewerNotes`, `apps/api/src/cv/routes.ts:66` -> `repo.restore` -> `supabase/migrations/20261108010000_restore_keeps_notes.sql:35` -> `content = p_content`.

## Assumptions

- Restore authenticates ownership of a history ID but does not prove supplied content came from it; the route supplies and validates that content. `supabase/migrations/20261108010000_restore_keeps_notes.sql:17` -> `h.user_id = v_user`, `supabase/migrations/20261108010000_restore_keeps_notes.sql:35` -> `content = p_content`, `apps/api/src/cv/routes.ts:64` -> `CvContentSchema.parse`
- Snapshot deduplication compares JSONB values in SQL; the fake always adds a copy and therefore cannot verify this rule. `supabase/migrations/20261106030000_snapshot_skip_same.sql:25` -> `is distinct from`, `apps/api/src/cv/memory-repo.ts:71` -> `snapshot(row.content, reason)`

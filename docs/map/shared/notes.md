---
id: shared/notes
area: shared
files: ["packages/shared/src/notes.ts","packages/shared/src/notes.test.ts"]
depends_on: ["shared/cv"]
contract: true
checked_hash: c49a582b
cited: [ef3e5a, 735688, c59b27, e92900, fdf517, 05c03b, 1b9cd5, 215f7b, 17c679, 76392f, 35379f, 1b740f, ffe344, a054fd, fdf517, 263c88, 7f5390, 3f3726, 60b46f, 76392f, f1da0c, 03ad9f, 947a64, 0ec58b, 07c9a0, 9590d0, 88a6e4, cfd773, 947a64, 0d6e05, c28a52, 5be7b7, 6d3223, 81cfca, 01539e, 716a7f, 1b9cd5, dece1f]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Preserve role notes and facts across imports, restores and concurrent note-only saves.

- Import matching uses lowercased, trimmed company/title pairs with collapsed whitespace, separated by a null character. `packages/shared/src/notes.ts:3` -> `function key`
- Only keys occurring once on each side match; ambiguous same-company/title roles are skipped. `packages/shared/src/notes.ts:16` -> `list.length === 1`, `packages/shared/src/notes.ts:43` -> `after.get`
- Merging deduplicates by note ID with the second input winning, retains the newest 25 notes per job/non-job group, then returns survivors in original merged order. `packages/shared/src/notes.ts:20` -> `function merge`
- carryNotes affects experience only; incoming non-null facts win, otherwise old facts are retained. `packages/shared/src/notes.ts:35` -> `carryNotes`, `packages/shared/src/notes.ts:44` -> `facts:`
- mergeNewerNotes matches IDs across experience, projects and volunteering; current notes win duplicate IDs and facts replace target facts only when absent or strictly newer. `packages/shared/src/notes.ts:53` -> `currentRoles`, `packages/shared/src/notes.ts:59` -> `const facts`, `packages/shared/src/notes.ts:64` -> `result.experience`
- onlyNotesDiffer ignores role notes/facts in all three scored lists, sorts object keys for comparison, and retains array order. It also returns true for identical CVs. `packages/shared/src/notes.ts:71` -> `onlyNotesDiffer`, `packages/shared/src/notes.ts:78` -> `!Array.isArray`, `packages/shared/src/notes.ts:83` -> `comparable(a)`
- tested by `packages/shared/src/notes.test.ts:36` -> `carryNotes`

## Connections

- Used by API import apply: `apps/api/src/imports/routes.ts:71` -> `carryNotes` -> `packages/shared/src/notes.ts:35` -> `carryNotes`.
- Used by API restore to determine restored content and web autosave to decide whether a conflict can recover automatically: `apps/api/src/cv/routes.ts:64` -> `mergeNewerNotes`, `apps/web/src/cv/useAutosave.ts:83` -> `onlyNotesDiffer`, `apps/web/src/cv/useAutosave.ts:84` -> `mergeNewerNotes` -> `packages/shared/src/notes.ts:50` -> `mergeNewerNotes`, `packages/shared/src/notes.ts:71` -> `onlyNotesDiffer`.
- Uses shared note bounds and Note shape: `packages/shared/src/notes.ts:1` -> `MAX_JOB_NOTES` -> `packages/shared/src/cv.ts:14` -> `MAX_NOTES`, `packages/shared/src/cv.ts:15` -> `MAX_JOB_NOTES`, `packages/shared/src/cv.ts:215` -> `Note`.
- Restore writes merged content through RPC: `apps/api/src/cv/supabase-repo.ts:91` -> `restore_base_cv` -> `supabase/migrations/20261108010000_restore_keeps_notes.sql:4` -> `restore_base_cv`.
- Job-note RPC duplicates the 25-note and byte limits in SQL: `apps/api/src/cv/supabase-repo.ts:57` -> `add_job_notes` -> `supabase/migrations/20261109230000_job_notes_projects.sql:3` -> `add_job_notes`; `packages/shared/src/cv.ts:15` -> `MAX_JOB_NOTES` -> `supabase/migrations/20261109230000_job_notes_projects.sql:40` -> `25`; `packages/shared/src/cv.ts:5` -> `MAX_CV_BYTES` -> `supabase/migrations/20261109230000_job_notes_projects.sql:44` -> `262144`.
- History snapshots are another note-carrying persistence boundary: `apps/api/src/cv/supabase-repo.ts:102` -> `snapshot_base_cv` -> `supabase/migrations/20261106030000_snapshot_skip_same.sql:5` -> `snapshot_base_cv`.

## Assumptions

- Note and fact timestamps must be parseable for newest selection; helpers use Date.parse without validating their arguments. `packages/shared/src/notes.ts:22` -> `Date.parse`, `packages/shared/src/notes.ts:60` -> `Date.parse`.
- ID matching across all scored lists assumes stable IDs; duplicate IDs are resolved by the last entry in the combined current-role map. `packages/shared/src/notes.ts:53` -> `new Map`, `packages/shared/src/notes.ts:57` -> `currentRoles.get`.

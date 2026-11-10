---
id: db/job-notes
area: db
files: ["supabase/migrations/20261108020000_add_job_notes.sql", "supabase/migrations/20261109230000_job_notes_projects.sql", "supabase/tests/database/job_notes_projects.test.sql", "supabase/tests/database/tailoring.test.sql"]
depends_on: ["db/base-cv", "shared/cv", "shared/notes"]
contract: true
checked_hash: c7ab23e2
cited: [cfd773, 263336, 8a90b7, 4901e4, b5047d, 73da61, 263336, 11a8c6, 15f7af, 0d6e05, 8b9c7d, 5be7b7, c3f0ab, 7d4ba9, 2204df, d361fe, f2c276, 88a6e4, cfd773, 8a94de, d841d0, fcdeb7, e48a51, 66e105, 254135, 964e15, 263336, 0d6e05, 15f7af, fb5708, 763aab, 5be7b7, e7c939]
decisions: ["docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Append job answers to the latest saved role or project without creating history.

- Current add_job_notes(text,jsonb) replaces the same signature from add_job_notes.sql, adding projects between experience and volunteering; it creates no extra overload. `supabase/migrations/20261109230000_job_notes_projects.sql:3` -> `add_job_notes`, `supabase/migrations/20261109230000_job_notes_projects.sql:20` -> `foreach`, `supabase/migrations/20261108020000_add_job_notes.sql:19` -> `foreach`
- This invoker function locks the row belonging to auth.uid; missing CV or item raises P0002/role_not_found, and there is no caller-supplied expected version. `supabase/migrations/20261109230000_job_notes_projects.sql:6` -> `security invoker`, `supabase/migrations/20261109230000_job_notes_projects.sql:15` -> `for update`, `supabase/migrations/20261109230000_job_notes_projects.sql:27` -> `P0002`
- It searches sections in order and stops at the first section containing the ID. `supabase/migrations/20261109230000_job_notes_projects.sql:20` -> `array['experience', 'projects', 'volunteering']`
- Incoming notes are concatenated with existing notes; notes containing a jobId key are ranked by askedAt descending and later array position, retaining the newest 25 while keeping every note without that key. `supabase/migrations/20261109230000_job_notes_projects.sql:30` -> `v_notes :=`, `supabase/migrations/20261109230000_job_notes_projects.sql:35` -> `partition by`, `supabase/migrations/20261109230000_job_notes_projects.sql:40` -> `note_rank <= 25`
- Retained notes preserve original array order, not ranking order. `supabase/migrations/20261109230000_job_notes_projects.sql:32` -> `jsonb_agg(note order by ordinality)`
- The next-version content envelope must fit 262144 bytes as JSONB text or the function raises 54000/content_too_large before updating. `supabase/migrations/20261109230000_job_notes_projects.sql:44` -> `octet_length`
- Successful calls update content, version and updated_at with no history insertion, including calls with an empty notes array. `supabase/migrations/20261109230000_job_notes_projects.sql:48` -> `update public.base_cvs`
- Execution is restricted to authenticated by the current migration's grants. `supabase/migrations/20261109230000_job_notes_projects.sql:57` -> `revoke execute`
- tested by `supabase/tests/database/job_notes_projects.test.sql:13` -> `results_eq`
- tested by `supabase/tests/database/tailoring.test.sql:228` -> `results_eq`
- tested by `supabase/tests/database/tailoring.test.sql:278` -> `throws_ok`

## Connections

- Used by CvRepo.addJobNotes: `apps/api/src/cv/supabase-repo.ts:57` -> `rpc("add_job_notes"` -> `supabase/migrations/20261109230000_job_notes_projects.sql:3` -> `add_job_notes`.
- Used by tailoring answer and acceptance flows: `apps/api/src/tailor/questions.ts:175` -> `deps.cv.addJobNotes`, `apps/api/src/tailor/accept.ts:182` -> `deps.cv.addJobNotes` -> `apps/api/src/cv/supabase-repo.ts:56` -> `addJobNotes`.
- Uses owner-scoped base CV access: `supabase/migrations/20261109230000_job_notes_projects.sql:51` -> `auth.uid()` -> `supabase/migrations/20261104000000_baseline.sql:57` -> `auth.uid()`.
- Mirrored by fake item selection and pruning: `apps/api/src/cv/memory-repo.ts:43` -> `content.projects`, `apps/api/src/cv/memory-repo.ts:49` -> `MAX_JOB_NOTES` -> `supabase/migrations/20261109230000_job_notes_projects.sql:20` -> `projects`, `supabase/migrations/20261109230000_job_notes_projects.sql:40` -> `25`.

## Assumptions

- Notes must already have usable timestamp strings and object shapes: SQL casts askedAt to timestamptz and distinguishes job notes by key presence, while the fake checks jobId !== undefined. `supabase/migrations/20261109230000_job_notes_projects.sql:35` -> `note ? 'jobId'`, `supabase/migrations/20261109230000_job_notes_projects.sql:36` -> `timestamptz`, `apps/api/src/cv/memory-repo.ts:47` -> `note.jobId !== undefined`
- SQL measures a different serialization than the fake, so their 256 KB acceptance boundary can differ. `supabase/migrations/20261109230000_job_notes_projects.sql:44` -> `::text`, `apps/api/src/cv/memory-repo.ts:52` -> `JSON.stringify`

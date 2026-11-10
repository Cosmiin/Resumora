---
id: api-tailor/accept-save
area: api-tailor
files: ["apps/api/src/tailor/accept.ts","apps/api/test/tailor-accept.test.ts"]
depends_on: ["shared/tailoring","db/tailoring-repository","db/tailoring-runs","db/match-scores-repository","db/job-notes","db/jobs-repository","api-tailor/score","api-tailor/answers"]
contract: false
checked_hash: dc7f97e0
cited: [ce153f, f68084, 0aee73, 3240a7, 2966ed, bb9db8, d841d0, 40d80f, e1c864, 2966ed, d48b51, bb9db8, 40d80f, fc71e6, cd6f77, 8f46b7, f0e100, da24cd, bf227a, f2dce7, 2966ed, 6742c1, c0e086, bb9db8, b656f2, d841d0, 88a6e4, cfd773, 3240a7, da18a0, 48b76c, d8fcc2, 838056, 77d89f, 569300]
decisions: ["docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Recompute Score 2, save the document and notes, then advance the run and job status.

- Preserves other roles' review entries and scores content with hidden items removed; kept inferred review text counts even if it was never explicitly reviewed `apps/api/src/tailor/accept.ts:159` -> `Object.fromEntries`; `apps/api/src/tailor/accept.ts:163` -> `item.inferred && item.kept`; `apps/api/src/tailor/accept.ts:166` -> `withoutHidden`.
- Ordering is score computation, version-checked document save, score-history insert, job-note writes, run advance, then job application-status update; these are separate writes `apps/api/src/tailor/accept.ts:164` -> `scoreMatch`; `apps/api/src/tailor/accept.ts:168` -> `saveTailoredCv`; `apps/api/src/tailor/accept.ts:171` -> `saveScore`; `apps/api/src/tailor/accept.ts:182` -> `addJobNotes`; `apps/api/src/tailor/accept.ts:191` -> `updateRun`; `apps/api/src/tailor/accept.ts:195` -> `markTailored`.
- Version conflict returns 409 after model scoring and before later writes; a later storage failure can leave an already-saved document with an unadvanced run `apps/api/src/tailor/accept.ts:168` -> `saveTailoredCv`; `apps/api/src/tailor/accept.ts:169` -> `version_conflict`; `apps/api/src/tailor/accept.ts:171` -> `saveScore`; `apps/api/src/tailor/accept.ts:191` -> `updateRun`.
- Redo acceptance returns without advancing. Normal acceptance uses stored role order filtered to current content, then next section; exhaustion sets done/currentSection null `apps/api/src/tailor/accept.ts:185` -> `input.redo`; `apps/api/src/tailor/accept.ts:187` -> `stepOrder`; `apps/api/src/tailor/accept.ts:192` -> `"done"`.
- Only saved jobs become tailored; concurrent job edits get at most two patch attempts, and two conflicts return without throwing `apps/api/src/tailor/accept.ts:201` -> `attempt < 2`; `apps/api/src/tailor/accept.ts:203` -> `"saved"`; `apps/api/src/tailor/accept.ts:204` -> `jobs.patch`.
- tested by `apps/api/test/tailor-accept.test.ts:95` -> `accept section`.

## Connections

- Uses version-checked document storage and owner RLS `apps/api/src/tailor/accept.ts:168` -> `saveTailoredCv`; `apps/api/src/tailor/supabase-repo.ts:82` -> `eq("version", expectedVersion)`; `supabase/migrations/20261108000000_tailoring.sql:75` -> `own tailored cvs: update`.
- Uses append-only score writes and note RPC `apps/api/src/tailor/accept.ts:171` -> `saveScore`; `apps/api/src/tailor/supabase-repo.ts:22` -> `from("match_scores").insert`; `apps/api/src/tailor/accept.ts:182` -> `addJobNotes`; `apps/api/src/cv/supabase-repo.ts:57` -> `rpc("add_job_notes"`; `supabase/migrations/20261109230000_job_notes_projects.sql:3` -> `add_job_notes`.
- Uses api-tailor/score for Score 2 and api-tailor/answers for note placement `apps/api/src/tailor/accept.ts:164` -> `scoreMatch`; `apps/api/src/tailor/score.ts:39` -> `scoreMatch`; `apps/api/src/tailor/accept.ts:176` -> `newestRole`; `apps/api/src/tailor/questions.ts:38` -> `newestRole`.

## Assumptions

- The run write has no version check; sequential repeated acceptance after advancement fails, but simultaneous requests may race through separate document reads `apps/api/src/tailor/accept.ts:94` -> `run.currentSection`; `apps/api/src/tailor/accept.ts:99` -> `getTailoredCv`; `apps/api/src/tailor/supabase-repo.ts:183` -> `eq("id", id)`.

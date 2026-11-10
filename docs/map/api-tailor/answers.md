---
id: api-tailor/answers
area: api-tailor
files: ["apps/api/src/tailor/questions.ts","apps/api/test/tailor-questions.test.ts"]
depends_on: ["shared/notes","db/job-notes","db/tailoring-runs","api-tailor/section-routes"]
contract: false
checked_hash: 9722e18f
decisions: []
open: []
---
Persist run answers and copy eligible user evidence into Base CV job notes.

- Answers naming a question outside the run fail 400. Repeated identical value/via does not add another note; skip, blank and flag answers also create no note `apps/api/src/tailor/questions.ts:149` -> `questions`; `apps/api/src/tailor/questions.ts:151` -> `invalid_content`; `apps/api/src/tailor/questions.ts:160` -> `before?.value`; `apps/api/src/tailor/questions.ts:163` -> `"flag"`.
- Confirmed skills attach notes to all valid selected scored items; otherwise notes go to the question's item or newest experience role. Unknown target IDs are dropped `apps/api/src/tailor/questions.ts:155` -> `roleIds`; `apps/api/src/tailor/questions.ts:165` -> `usedIn`; `apps/api/src/tailor/questions.ts:167` -> `targets`.
- Newest role means current first, then descending end-or-start date and start date; role notes are written before run answers, so failure between writes can leave notes without recorded answers `apps/api/src/tailor/questions.ts:38` -> `roles].sort`; `apps/api/src/tailor/questions.ts:175` -> `addJobNotes`; `apps/api/src/tailor/questions.ts:177` -> `updateRun`.
- tested by `apps/api/test/tailor-questions.test.ts:201` -> `answers`.
- Run answers merge by questionId after note writes; skipped submissions are stored and untouched answers survive `apps/api/src/tailor/questions.ts:153` -> `stored`; `apps/api/src/tailor/questions.ts:176` -> `stored.set`.

## Connections

- Uses add_job_notes RPC through CvRepo, whose current SQL definition supports projects as well as experience and volunteering `apps/api/src/tailor/questions.ts:175` -> `addJobNotes`; `apps/api/src/cv/supabase-repo.ts:57` -> `rpc("add_job_notes"`; `supabase/migrations/20261109230000_job_notes_projects.sql:3` -> `add_job_notes`.
- Used by browser answer URL through api-tailor/section-routes `apps/web/src/tailor/tailor-api.ts:41` -> `/answers`; `apps/api/src/tailor/routes.ts:140` -> `/answers`; `apps/api/src/tailor/routes.ts:143` -> `saveAnswers`; `apps/api/src/tailor/questions.ts:144` -> `saveAnswers`.

## Assumptions

- Answer values are treated as user evidence without comparing to question options; question membership is checked, but typed claims are not independently verified `apps/api/src/tailor/questions.ts:150` -> `questions.has`; `apps/api/src/tailor/questions.ts:168` -> `answer.value.trim()`.

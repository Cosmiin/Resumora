---
id: api-tailor/answers
area: api-tailor
files: ["apps/api/src/tailor/questions.ts","apps/api/test/tailor-questions.test.ts"]
depends_on: ["shared/notes","db/job-notes","db/tailoring-runs","api-tailor/section-routes"]
contract: false
checked_hash: 7f38b72e
cited: [0c3957, aa5b1b, 4263e7, af2419, 119873, 77b68a, 5ee81e, 7afc66, 8a94de, 0c3957, 67e978, 60defa, fb662d, 8a94de, 88a6e4, cfd773, 10e202, 614648, 262678, 5a22fa, 9dcd11, 4866b7]
decisions: []
open: []
---
Persist run answers and copy eligible user evidence into Base CV job notes.

- Answers naming a question outside the run fail 400. Repeated identical value/via does not add another note; skip, blank and flag answers also create no note `apps/api/src/tailor/questions.ts:152` -> `questions`; `apps/api/src/tailor/questions.ts:167` -> `invalid_content`; `apps/api/src/tailor/questions.ts:176` -> `before?.value`; `apps/api/src/tailor/questions.ts:50` -> `"flag"`.
- Confirmed skills attach notes to all valid selected scored items; otherwise notes go to the question's item or newest experience role. Unknown target IDs are dropped `apps/api/src/tailor/questions.ts:158` -> `roleIds`; `apps/api/src/tailor/questions.ts:181` -> `usedIn`; `apps/api/src/tailor/questions.ts:183` -> `targets`.
- Newest role means current first, then descending end-or-start date and start date; role notes are written before run answers, so failure between writes can leave notes without recorded answers `apps/api/src/tailor/questions.ts:39` -> `roles].sort`; `apps/api/src/tailor/questions.ts:191` -> `addJobNotes`; `apps/api/src/tailor/questions.ts:155` -> `updateRun`.
- tested by `apps/api/test/tailor-questions.test.ts:92` -> `answers`.
- Run answers merge by questionId after note writes; skipped submissions are stored and untouched answers survive `apps/api/src/tailor/questions.ts:63` -> `stored`; `apps/api/src/tailor/questions.ts:192` -> `stored.set`.

## Connections

- Uses add_job_notes RPC through CvRepo, whose current SQL definition supports projects as well as experience and volunteering `apps/api/src/tailor/questions.ts:191` -> `addJobNotes`; `apps/api/src/cv/supabase-repo.ts:57` -> `rpc("add_job_notes"`; `supabase/migrations/20261109230000_job_notes_projects.sql:3` -> `add_job_notes`.
- Used by browser answer URL through api-tailor/section-routes `apps/web/src/tailor/tailor-api.ts:41` -> `/answers`; `apps/api/src/tailor/routes.ts:140` -> `/answers`; `apps/api/src/tailor/routes.ts:143` -> `saveAnswers`; `apps/api/src/tailor/questions.ts:160` -> `saveAnswers`.

## Assumptions

- Answer values are treated as user evidence without comparing to question options; question membership is checked, but typed claims are not independently verified `apps/api/src/tailor/questions.ts:166` -> `questions.has`; `apps/api/src/tailor/questions.ts:184` -> `answer.value.trim()`.

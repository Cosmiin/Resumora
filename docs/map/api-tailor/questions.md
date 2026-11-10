---
id: api-tailor/questions
area: api-tailor
files: ["apps/api/src/tailor/questions.ts","apps/api/test/tailor-questions.test.ts"]
depends_on: ["shared/tailoring","db/tailoring-runs","db/match-scores-repository","api-tailor/section-pass","api-tailor/question-prompts","api-tailor/answers","api-tailor/section-routes"]
contract: true
checked_hash: 9722e18f
decisions: []
open: []
---
Select eligible gaps and enforce per-item and run-wide question budgets.

- Courses, publications and interests immediately return no questions; role sections also return none when the current item is absent `apps/api/src/tailor/questions.ts:70` -> `isLightTailorSection`; `apps/api/src/tailor/questions.ts:74` -> `!role`.
- Each role gets five questions; non-role sections share eight, with skills capped at five. Flag questions do not count `apps/api/src/tailor/questions.ts:16` -> `MAX_RUN_QUESTIONS`; `apps/api/src/tailor/questions.ts:77` -> `jobQuestions`; `apps/api/src/tailor/questions.ts:79` -> `runLeft`.
- Gaps come from base score labels that are not met or are inferred. Each role asks a gap once; elsewhere answered gaps close and unanswered gaps may appear in fewer than two distinct sections `apps/api/src/tailor/questions.ts:84` -> `getScore`; `apps/api/src/tailor/questions.ts:91` -> `entry.asks.add`; `apps/api/src/tailor/questions.ts:97` -> `const open`; `apps/api/src/tailor/questions.ts:99` -> `gaps`.
- Existing job-specific notes and non-flag run answers supply answered context; question text deduplication trims, lowercases and collapses whitespace `apps/api/src/tailor/questions.ts:34` -> `const same`; `apps/api/src/tailor/questions.ts:52` -> `notes`; `apps/api/src/tailor/questions.ts:124` -> `seen`.
- A second questions request may generate more questions up to caps; these functions do not require waiting_user or reject done runs, and currentRole checks only role identity `apps/api/src/tailor/questions.ts:71` -> `currentRole`; `apps/api/src/tailor/questions.ts:80` -> `const max`; `apps/api/src/tailor/section-pass.ts:31` -> `run.currentRoleId`.
- tested by `apps/api/test/tailor-questions.test.ts:90` -> `job questions`.

## Connections

- Used by browser questions URL through api-tailor/section-routes `apps/web/src/tailor/tailor-api.ts:34` -> `/questions`; `apps/api/src/tailor/routes.ts:69` -> `/questions`; `apps/api/src/tailor/routes.ts:74` -> `askQuestions`; `apps/api/src/tailor/questions.ts:65` -> `askQuestions`.
- Uses api-tailor/question-prompts after selecting gaps; api-tailor/answers stores answers used on later requests `apps/api/src/tailor/questions.ts:112` -> `questionUserMessage`; `apps/api/src/tailor/question-prompts.ts:20` -> `questionUserMessage`; `apps/api/src/tailor/questions.ts:86` -> `input.run.answers`; `apps/api/src/tailor/questions.ts:177` -> `answers:`.

## Assumptions

- Budgets use the supplied run snapshot; concurrent question appends can overwrite one another without a version check `apps/api/src/tailor/questions.ts:75` -> `input.run.questions`; `apps/api/src/tailor/questions.ts:139` -> `updateRun`; `apps/api/src/tailor/supabase-repo.ts:183` -> `eq("id", id)`.

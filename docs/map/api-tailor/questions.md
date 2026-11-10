---
id: api-tailor/questions
area: api-tailor
files: ["apps/api/src/tailor/questions.ts","apps/api/test/tailor-questions.test.ts"]
depends_on: ["shared/tailoring","db/tailoring-runs","db/match-scores-repository","api-tailor/section-pass","api-tailor/question-prompts","api-tailor/answers","api-tailor/section-routes"]
contract: true
checked_hash: 9722e18f
cited: [93f103, 1120d8, 87015c, d2844e, eb5682, 45665e, 37130d, c9d37b, 769e42, c4a084, 35b5b3, 45665e, 93a7bb, a958e4, 5179ab, 3962d7, 8a6920, eb5682, bfca10, 14bc06, d90b23, fccb29, 510e15, 98b2d8, 5c971a, 4bff98, 733722, 81b993, 522cde, 8465bd, 569300]
decisions: []
open: []
---
Select eligible gaps and enforce per-item and run-wide question budgets.

- Courses, publications and interests immediately return no questions; role sections also return none when the current item is absent `apps/api/src/tailor/questions.ts:70` -> `isLightTailorSection`; `apps/api/src/tailor/questions.ts:74` -> `!role`.
- Each role has a maximum of five questions, not a guaranteed count; non-role sections share eight, with skills capped at five. Flag questions do not count; reply filtering can return fewer or no questions `apps/api/src/tailor/questions.ts:16` -> `MAX_RUN_QUESTIONS`; `apps/api/src/tailor/questions.ts:77` -> `jobQuestions`; `apps/api/src/tailor/questions.ts:80` -> `const max`; `apps/api/src/tailor/questions.ts:132` -> `fresh.length >= max`; `apps/api/src/tailor/questions.ts:140` -> `return fresh`.
- Gaps come from base score labels that are not met or are inferred. A gap previously asked for the current role is excluded on later requests, but one reply can contain multiple differently worded questions for that gap. Elsewhere answered gaps close; unanswered gaps remain eligible while fewer than two distinct sections have asked them, including repeated requests within one section, subject to caps and text deduplication `apps/api/src/tailor/questions.ts:84` -> `getScore`; `apps/api/src/tailor/questions.ts:91` -> `entry.asks.add`; `apps/api/src/tailor/questions.ts:97` -> `const open`; `apps/api/src/tailor/questions.ts:99` -> `gaps`; `apps/api/src/tailor/questions.ts:132` -> `seen.has`; `apps/api/src/tailor/questions.ts:136` -> `fresh.push`.
- Existing job-specific notes and non-flag run answers supply answered context; question text deduplication trims, lowercases and collapses whitespace `apps/api/src/tailor/questions.ts:34` -> `const same`; `apps/api/src/tailor/questions.ts:52` -> `notes`; `apps/api/src/tailor/questions.ts:124` -> `seen`.
- A second questions request may generate more questions up to caps; these functions do not require waiting_user or reject done runs, and currentRole checks only role identity `apps/api/src/tailor/questions.ts:71` -> `currentRole`; `apps/api/src/tailor/questions.ts:80` -> `const max`; `apps/api/src/tailor/section-pass.ts:31` -> `run.currentRoleId`.
- tested by `apps/api/test/tailor-questions.test.ts:90` -> `job questions`.

## Connections

- Used by browser questions URL through api-tailor/section-routes `apps/web/src/tailor/tailor-api.ts:34` -> `/questions`; `apps/api/src/tailor/routes.ts:69` -> `/questions`; `apps/api/src/tailor/routes.ts:74` -> `askQuestions`; `apps/api/src/tailor/questions.ts:65` -> `askQuestions`.
- Uses api-tailor/question-prompts after selecting gaps; api-tailor/answers stores answers used on later requests `apps/api/src/tailor/questions.ts:112` -> `questionUserMessage`; `apps/api/src/tailor/question-prompts.ts:20` -> `questionUserMessage`; `apps/api/src/tailor/questions.ts:86` -> `input.run.answers`; `apps/api/src/tailor/questions.ts:177` -> `answers:`.

## Assumptions

- Budgets use the supplied run snapshot; concurrent question appends can overwrite one another without a version check `apps/api/src/tailor/questions.ts:75` -> `input.run.questions`; `apps/api/src/tailor/questions.ts:139` -> `updateRun`; `apps/api/src/tailor/supabase-repo.ts:183` -> `eq("id", id)`.

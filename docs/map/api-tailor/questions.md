---
id: api-tailor/questions
area: api-tailor
files: ["apps/api/src/tailor/questions.ts","apps/api/test/tailor-questions.test.ts"]
depends_on: ["shared/tailoring","db/tailoring-runs","db/match-scores-repository","api-tailor/section-pass","api-tailor/question-prompts","api-tailor/answers","api-tailor/section-routes"]
contract: true
checked_hash: 7f38b72e
cited: [7296ff, 0ea13b, 19b3fd, 317780, 435a40, 1cd596, b15949, b94e26, 769e42, 0561c0, 1048c2, 1cd596, 14e74e, a958e4, 7a666f, af2419, 171458, 89cd6f, 435a40, bfca10, b94e26, 2c0ca1, 36c5ee, 511c24, be016d, 585395, c56bed, 2645e0, d90b23, fccb29, 510e15, 9bc6f1, b9c232, 4bff98, 4df34b, 01d7b0, 7a09c2, 0c3957, 569300]
decisions: []
open: []
---
Select eligible gaps and enforce per-item and run-wide question budgets.

- Courses, publications and interests immediately return no questions; role sections also return none when the current item is absent `apps/api/src/tailor/questions.ts:63` -> `isLightTailorSection`; `apps/api/src/tailor/questions.ts:67` -> `!role`.
- Steering is read before computing the cap: with nonempty focusRoleIds, focus roles get up to five questions and other roles up to two; without focus roles every role gets five. Non-role sections share eight, with skills capped at five. Flag questions do not count; reply filtering can return fewer or no questions `apps/api/src/tailor/questions.ts:16` -> `MAX_RUN_QUESTIONS`; `apps/api/src/tailor/questions.ts:74` -> `jobQuestions`; `apps/api/src/tailor/questions.ts:77` -> `const max`; `apps/api/src/tailor/questions.ts:146` -> `fresh.length >= max`; `apps/api/src/tailor/questions.ts:156` -> `return fresh`.
- Candidate gaps come from base score labels that are not met or are inferred; role steps also remove gaps the current tailored score marks met without inference. A gap previously asked for the current role is excluded on later requests, but one reply can contain multiple differently worded questions for that gap. Elsewhere answered gaps close; unanswered gaps remain eligible while fewer than two distinct sections have asked them, including repeated requests within one section, subject to caps and text deduplication `apps/api/src/tailor/questions.ts:81` -> `getScore`; `apps/api/src/tailor/questions.ts:109` -> `entry.asks.add`; `apps/api/src/tailor/questions.ts:115` -> `const open`; `apps/api/src/tailor/questions.ts:117` -> `gaps`; `apps/api/src/tailor/questions.ts:146` -> `seen.has`; `apps/api/src/tailor/questions.ts:152` -> `fresh.push`.
- Existing job-specific notes and non-flag run answers supply answered context, restricted to the current item in role steps; question text deduplication trims, lowercases and collapses whitespace `apps/api/src/tailor/questions.ts:35` -> `const same`; `apps/api/src/tailor/questions.ts:45` -> `notes`; `apps/api/src/tailor/questions.ts:47` -> `question.roleId === roleId`; `apps/api/src/tailor/questions.ts:138` -> `seen`.
- A second questions request may generate more questions up to caps; these functions do not require waiting_user or reject done runs, and currentRole checks only role identity `apps/api/src/tailor/questions.ts:64` -> `currentRole`; `apps/api/src/tailor/questions.ts:77` -> `const max`; `apps/api/src/tailor/section-pass.ts:31` -> `run.currentRoleId`.
- Role steps look up the latest score for this tailored CV, then use the document score when the row exists. Steering restarts reset that score to Base, so old tailored history cannot hide a gap whose wording was removed `apps/api/src/tailor/questions.ts:83` -> `getScore`; `apps/api/src/tailor/questions.ts:84` -> `readTailoredCv`; `apps/api/src/tailor/questions.ts:86` -> `tailoredScore`; `apps/api/src/tailor/questions.ts:101` -> `label.status`.
- tested by `apps/api/test/tailor-questions.test.ts:90` -> `job questions`.

- tested by `apps/api/test/tailor-questions.test.ts:129` -> `filters a later role's base gaps`; `apps/api/test/tailor-questions.test.ts:210` -> `offers a gap again after a steering restart`; `apps/api/test/tailor-questions.test.ts:241` -> `enforces each role's prompt and stored question cap`.

## Connections

- Used by browser questions URL through api-tailor/section-routes `apps/web/src/tailor/tailor-api.ts:34` -> `/questions`; `apps/api/src/tailor/routes.ts:69` -> `/questions`; `apps/api/src/tailor/routes.ts:74` -> `askQuestions`; `apps/api/src/tailor/questions.ts:58` -> `askQuestions`.
- Uses api-tailor/question-prompts after selecting gaps; api-tailor/answers stores answers used on later requests `apps/api/src/tailor/questions.ts:9` -> `questionUserMessage`; `apps/api/src/tailor/question-prompts.ts:23` -> `questionUserMessage`; `apps/api/src/tailor/questions.ts:104` -> `input.run.answers`; `apps/api/src/tailor/questions.ts:163` -> `answers:`.

## Assumptions

- Budgets use the supplied run snapshot; concurrent question appends can overwrite one another without a version check `apps/api/src/tailor/questions.ts:72` -> `input.run.questions`; `apps/api/src/tailor/questions.ts:155` -> `updateRun`; `apps/api/src/tailor/supabase-repo.ts:183` -> `eq("id", id)`.

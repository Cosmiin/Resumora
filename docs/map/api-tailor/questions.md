---
id: api-tailor/questions
area: api-tailor
files: ["apps/api/src/tailor/questions.ts","apps/api/test/tailor-questions.test.ts"]
depends_on: ["shared/tailoring","db/tailoring-runs","db/match-scores-repository","api-tailor/section-pass","api-tailor/question-prompts","api-tailor/answers","api-tailor/section-routes"]
contract: true
checked_hash: f0afd5e7
cited: [3f1031, f0919a, 19b3fd, 034386, 435a40, 1cd596, b15949, b94e26, 769e42, 9c0c69, 469811, 1cd596, 14e74e, a958e4, 6badfd, 3c6699, 3962d7, 669af4, 435a40, bfca10, 4659b1, d9132e, bf3011, e1f3e4, 14bc06, 585395, 2a097e, 2645e0, d90b23, fccb29, 510e15, 9bc6f1, 41d20f, 4bff98, 2c577f, 81b993, df5f8b, 0c3957, 569300]
decisions: []
open: []
---
Select eligible gaps and enforce per-item and run-wide question budgets.

- Courses, publications and interests immediately return no questions; role sections also return none when the current item is absent `apps/api/src/tailor/questions.ts:63` -> `isLightTailorSection`; `apps/api/src/tailor/questions.ts:67` -> `!role`.
- Steering is read before computing the cap: with nonempty focusRoleIds, focus roles get up to five questions and other roles up to two; without focus roles every role gets five. Non-role sections share eight, with skills capped at five. Flag questions do not count; reply filtering can return fewer or no questions `apps/api/src/tailor/questions.ts:16` -> `MAX_RUN_QUESTIONS`; `apps/api/src/tailor/questions.ts:74` -> `jobQuestions`; `apps/api/src/tailor/questions.ts:77` -> `const max`; `apps/api/src/tailor/questions.ts:133` -> `fresh.length >= max`; `apps/api/src/tailor/questions.ts:143` -> `return fresh`.
- Candidate gaps come from base score labels that are not met or are inferred; role steps also remove gaps the current tailored score marks met without inference. A gap previously asked for the current role is excluded on later requests, but one reply can contain multiple differently worded questions for that gap. Elsewhere answered gaps close; unanswered gaps remain eligible while fewer than two distinct sections have asked them, including repeated requests within one section, subject to caps and text deduplication `apps/api/src/tailor/questions.ts:81` -> `getScore`; `apps/api/src/tailor/questions.ts:94` -> `entry.asks.add`; `apps/api/src/tailor/questions.ts:100` -> `const open`; `apps/api/src/tailor/questions.ts:102` -> `gaps`; `apps/api/src/tailor/questions.ts:133` -> `seen.has`; `apps/api/src/tailor/questions.ts:139` -> `fresh.push`.
- Existing job-specific notes and non-flag run answers supply answered context, restricted to the current item in role steps; question text deduplication trims, lowercases and collapses whitespace `apps/api/src/tailor/questions.ts:35` -> `const same`; `apps/api/src/tailor/questions.ts:45` -> `notes`; `apps/api/src/tailor/questions.ts:47` -> `question.roleId === roleId`; `apps/api/src/tailor/questions.ts:125` -> `seen`.
- A second questions request may generate more questions up to caps; these functions do not require waiting_user or reject done runs, and currentRole checks only role identity `apps/api/src/tailor/questions.ts:64` -> `currentRole`; `apps/api/src/tailor/questions.ts:77` -> `const max`; `apps/api/src/tailor/section-pass.ts:31` -> `run.currentRoleId`.
- Role steps look up the latest score for this tailored CV, then use the document score when the row exists. Steering restarts reset that score to Base, so old tailored history cannot hide a gap whose wording was removed `apps/api/src/tailor/questions.ts:83` -> `getScore`; `apps/api/src/tailor/questions.ts:84` -> `readTailoredCv`; `apps/api/src/tailor/questions.ts:86` -> `tailoredScore`; `apps/api/src/tailor/questions.ts:87` -> `label.status`.
- tested by `apps/api/test/tailor-questions.test.ts:90` -> `job questions`.

- tested by `apps/api/test/tailor-questions.test.ts:113` -> `filters a later role's base gaps`; `apps/api/test/tailor-questions.test.ts:135` -> `offers a gap again after a steering restart`; `apps/api/test/tailor-questions.test.ts:166` -> `enforces each role's prompt and stored question cap`.

## Connections

- Used by browser questions URL through api-tailor/section-routes `apps/web/src/tailor/tailor-api.ts:34` -> `/questions`; `apps/api/src/tailor/routes.ts:69` -> `/questions`; `apps/api/src/tailor/routes.ts:74` -> `askQuestions`; `apps/api/src/tailor/questions.ts:58` -> `askQuestions`.
- Uses api-tailor/question-prompts after selecting gaps; api-tailor/answers stores answers used on later requests `apps/api/src/tailor/questions.ts:113` -> `questionUserMessage`; `apps/api/src/tailor/question-prompts.ts:23` -> `questionUserMessage`; `apps/api/src/tailor/questions.ts:89` -> `input.run.answers`; `apps/api/src/tailor/questions.ts:180` -> `answers:`.

## Assumptions

- Budgets use the supplied run snapshot; concurrent question appends can overwrite one another without a version check `apps/api/src/tailor/questions.ts:72` -> `input.run.questions`; `apps/api/src/tailor/questions.ts:142` -> `updateRun`; `apps/api/src/tailor/supabase-repo.ts:183` -> `eq("id", id)`.

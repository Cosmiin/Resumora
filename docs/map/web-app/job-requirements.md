---
id: web-app/job-requirements
area: web-app
files: ["apps/web/src/jobs/RequirementList.tsx","apps/web/src/jobs/JobScoreCard.tsx","apps/web/src/jobs/job-score.test.tsx"]
depends_on: ["shared/jobs","shared/match-score","web-app/i18n","web-app/styles-jobs"]
contract: false
checked_hash: a0671ad1
cited: [2d588f, 7819af, 68e737, 764b08, 2b7930, 98327d, df48db, 0708a1, ddab64, e38d2c, e346af, ed800c, 355c63, cae891, cb3ecb, 4bfe5d, 841e2c, 8ba6f2, 90359b, b87475, 2d588f, 2b7930]
decisions: []
open: []
---
Display ordered job requirements with base-match evidence and weighted score details.

- The list checks requirement-label count against the current requirements count; a mismatch suppresses marks and shows the edited notice. `apps/web/src/jobs/RequirementList.tsx:21` -> `requirementsChanged`
- Marks require a non-null total and matching counts; a score with null total shows not-enough-data copy, while absent score renders the caller's state. `apps/web/src/jobs/RequirementList.tsx:22` -> `marked`; `apps/web/src/jobs/RequirementList.tsx:28` -> `!score`
- Requirements stay in ad order and match labels by r<index>; missing labels become missing, and inferred labels display partial regardless of their status. `apps/web/src/jobs/RequirementList.tsx:32` -> `requirements.map`; `apps/web/src/jobs/RequirementList.tsx:35` -> `item.ref`
- Only nice requirements receive the nice tag; missing must requirements get the next-step hint. `apps/web/src/jobs/RequirementList.tsx:33` -> `kind === "nice"`; `apps/web/src/jobs/RequirementList.tsx:37` -> `missingNext`
- Rows become expandable only for evidence or the missing-must hint, with a set of open indexes allowing multiple expanded rows. `apps/web/src/jobs/RequirementList.tsx:42` -> `!label?.evidence`; `apps/web/src/jobs/RequirementList.tsx:46` -> `new Set`
- A score's total and band can still appear in the heading when count mismatch disables the per-row marks. `apps/web/src/jobs/RequirementList.tsx:25` -> `score.total !== null`
- JobScoreHow toggles four parts: requirements, keywords, seniority and langEdu; it displays points * max rounded to one decimal, with not-scored copy for missing parts. `apps/web/src/jobs/JobScoreCard.tsx:14` -> `langEdu`; `apps/web/src/jobs/JobScoreCard.tsx:17` -> `Math.round`
- The capped explanation appears only inside the expanded score-points panel. `apps/web/src/jobs/JobScoreCard.tsx:12` -> `showPoints`; `apps/web/src/jobs/JobScoreCard.tsx:21` -> `score.capped`
- tested by `apps/web/src/jobs/job-score.test.tsx:70` -> `requirements changed`
- tested by `apps/web/src/jobs/job-score.test.tsx:92` -> `toggling the points`
## Connections
- Used by JobPage with the base score, not tailored score: `apps/web/src/jobs/JobPage.tsx:207` -> `score.data?.base`; `apps/web/src/jobs/RequirementList.tsx:17` -> `RequirementList`
- RequirementList uses JobScoreHow for every present score: `apps/web/src/jobs/RequirementList.tsx:57` -> `JobScoreHow`; `apps/web/src/jobs/JobScoreCard.tsx:6` -> `JobScoreHow`
## Assumptions
- Count equality is the only stale-label check; same-length edits/reordering still map old labels by index. `apps/web/src/jobs/RequirementList.tsx:21` -> `length !== requirements.length`; `apps/web/src/jobs/RequirementList.tsx:35` -> `r`

---
id: web-tailor/answers
area: web-tailor
files: ["apps/web/src/tailor/YourAnswers.tsx","apps/web/src/tailor/redo.test.tsx"]
depends_on: ["web-tailor/question","web-tailor/role-panel","web-enrich/answers","web-tailor/flow-redo"]
contract: false
checked_hash: 35518483
decisions: []
open: []
---
Display earlier answers and prepare a complete replacement set for role redo.

- FinishedRoles renders only the supplied list and calls onPick with the selected role id. `apps/web/src/tailor/YourAnswers.tsx:15` -> `roles.map`
- Drafts initialize by matching questionId; only null or missing values become empty text, even when via is skip, and persisted roleIds are retained. `apps/web/src/tailor/YourAnswers.tsx:39` -> `questionId`; `apps/web/src/tailor/YourAnswers.tsx:40` -> `value`
- Update sends every displayed question; nonempty answers are trimmed, have via recalculated and retain roleIds, while emptied answers become null/skip without roleIds. `apps/web/src/tailor/YourAnswers.tsx:42` -> `update`; `apps/web/src/tailor/YourAnswers.tsx:46` -> `skip`
- An absent onUpdate renders plain answer text or the skipped label; it does not expose editors or Update. `apps/web/src/tailor/YourAnswers.tsx:55` -> `onUpdate`; `apps/web/src/tailor/YourAnswers.tsx:63` -> `onUpdate`
- Busy passes readOnly to AnswerBox and disables Update; the textarea becomes read-only, but option buttons can still change answers and the resume button still calls onClose. `apps/web/src/tailor/YourAnswers.tsx:57` -> `readOnly`; `apps/web/src/cv/enrich/AnswerBox.tsx:125` -> `readOnly`; `apps/web/src/cv/enrich/AnswerBox.tsx:109` -> `onChange`; `apps/web/src/tailor/YourAnswers.tsx:63` -> `disabled`; `apps/web/src/tailor/YourAnswers.tsx:62` -> `onClose`
- tested by `apps/web/src/tailor/redo.test.tsx:59` -> `it`

## Connections

- Uses answerVia and VIA to preserve the source-of-answer representation. `apps/web/src/tailor/YourAnswers.tsx:40` -> `VIA`; `apps/web/src/tailor/QuestionCard.tsx:28` -> `VIA`; `apps/web/src/tailor/YourAnswers.tsx:45` -> `answerVia`; `apps/web/src/tailor/QuestionCard.tsx:30` -> `answerVia`
- Uses tailor-back-list and tailor-back-answer global layout. `apps/web/src/tailor/YourAnswers.tsx:14` -> `tailor-back-list`; `apps/web/src/styles/tailor.css:20` -> `.tailor-back-list`; `apps/web/src/tailor/YourAnswers.tsx:53` -> `tailor-back-answer`; `apps/web/src/styles/tailor.css:21` -> `.tailor-back-answer`

## Assumptions

- Draft initialization runs once per mount, so the flow keys YourAnswers by role or section to reset it when its subject changes. `apps/web/src/tailor/YourAnswers.tsx:38` -> `useState`; `apps/web/src/tailor/TailorFlow.tsx:240` -> `key={roleId}`

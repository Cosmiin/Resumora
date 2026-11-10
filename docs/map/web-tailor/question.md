---
id: web-tailor/question
area: web-tailor
files: ["apps/web/src/tailor/QuestionCard.tsx","apps/web/src/tailor/role-context.test.tsx","apps/web/src/tailor/tailor-flow.test.tsx"]
depends_on: ["shared/tailoring","web-enrich/answers","web-tailor/role-panel","web-tailor/flow"]
contract: false
checked_hash: 369560c2
cited: [300b97, a1a0f6, f7dc53, 682715, 8e641b, 398d32, f351a5, d5fc96, ff4194, 85a4d4, 904e1c, 0040d8, a4b361, 03b390, 398d32]
decisions: []
open: []
---
Collect one answer and optional skill-use roles without advancing on selection.

- Draft omits questionId; the flow adds ids when submitting the complete question set. `apps/web/src/tailor/QuestionCard.tsx:7` -> `Draft`; `apps/web/src/tailor/TailorFlow.tsx:273` -> `questionId`
- answerVia prioritizes voice, then typed, then option; VIA maps persisted answer sources back to AnswerBox source arrays. `apps/web/src/tailor/QuestionCard.tsx:28` -> `VIA`
- Only role sections with a supplied role show the left RolePanel; other questions render alone. `apps/web/src/tailor/QuestionCard.tsx:34` -> `isRoleSection`
- Draft state initializes from previous value, via and roleIds. `apps/web/src/tailor/QuestionCard.tsx:42` -> `initial`
- A skill is treated as confirmed by any nonempty trimmed answer unequal to the final option; only then are selected role ids filtered against current roles and emitted. `apps/web/src/tailor/QuestionCard.tsx:47` -> `confirmed`
- Next is disabled for blank trimmed answers; Back is optional and Skip calls its own callback. `apps/web/src/tailor/QuestionCard.tsx:66` -> `onBack`
- tested by `apps/web/src/tailor/role-context.test.tsx:26` -> `describe`
- tested by `apps/web/src/tailor/tailor-flow.test.tsx:113` -> `it`

## Connections

- Uses AnswerBox for typed, picked and voice answers. `apps/web/src/tailor/QuestionCard.tsx:57` -> `AnswerBox`; `apps/web/src/cv/enrich/AnswerBox.tsx:65` -> `AnswerBox`
- Uses global tailor-split grid, which collapses to one column on narrow screens. `apps/web/src/tailor/QuestionCard.tsx:35` -> `tailor-split`; `apps/web/src/styles/tailor.css:67` -> `.tailor-split`; `apps/web/src/styles/tailor.css:110` -> `.tailor-split`

## Assumptions

- Skill option ordering is semantic: the last option must represent denial, since confirmation uses position rather than an option id. `apps/web/src/tailor/QuestionCard.tsx:47` -> `question.options.at(-1)`

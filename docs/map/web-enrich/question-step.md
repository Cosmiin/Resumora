---
id: web-enrich/question-step
area: web-enrich
files: ["apps/web/src/cv/enrich/QuestionStep.tsx","apps/web/src/cv/enrich/focus-mode.test.tsx"]
depends_on: ["web-enrich/answers","web-enrich/focus-answers","web-enrich/focus-ui","shared/enrichment-score"]
contract: false
checked_hash: a2083f0a
cited: [b3b13b, 742a52, 16a8b9, 9b88a9, f79cef, 983b42, 1dac29, 82d7a2, 904e1c, 0fb424, 7715e0, b3b13b, e61107, 0bb9f8]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Filter answer options and gate question submission while generation or voice is busy.

- QuestionStep filters options to <=60 characters, passes the shared number-range rule, caps them at four and hides chips unless at least two survive; role questions are adapted to detail questions for AnswerBox. `apps/web/src/cv/enrich/QuestionStep.tsx:25` -> `isAllowedOption`; `apps/web/src/cv/enrich/QuestionStep.tsx:26` -> `bulletId`; `apps/web/src/cv/enrich/QuestionStep.tsx:27` -> `options.length >= 2`
- Submitting is disabled while generation or voice is busy, or the trimmed answer is empty; Skip and Back are gated by generation busy, not voice busy. `apps/web/src/cv/enrich/QuestionStep.tsx:49` -> `disabled={busy}`; `apps/web/src/cv/enrich/QuestionStep.tsx:55` -> `voiceBusy`; `apps/web/src/cv/enrich/QuestionStep.tsx:69` -> `disabled={busy}`
- tested by `apps/web/src/cv/enrich/focus-mode.test.tsx:172` -> `it(`

## Connections

- Used by role/bullet questions and brain dumps; answers enter the session's submitAnswer, which dispatches setNote before generation. `apps/web/src/cv/enrich/QuestionStep.tsx:33` -> `AnswerBox`; `apps/web/src/cv/enrich/AnswerBox.tsx:65` -> `AnswerBox`; `apps/web/src/cv/enrich/FocusMode.tsx:271` -> `session.submitAnswer`; `apps/web/src/cv/enrich/useFocusSession.ts:460` -> `setNote`
- Uses shared option-number filtering (ranges/bounds permitted, remaining digits rejected). `apps/web/src/cv/enrich/QuestionStep.tsx:25` -> `isAllowedOption`; `packages/shared/src/enrich.ts:132` -> `isAllowedOption`; `packages/shared/src/enrich.ts:135` -> `test(rest)`

## Assumptions

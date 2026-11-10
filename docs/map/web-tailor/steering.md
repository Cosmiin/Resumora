---
id: web-tailor/steering
area: web-tailor
files: ["apps/web/src/tailor/SteeringStep.tsx","apps/web/src/tailor/steering.test.tsx","apps/web/src/tailor/redo.test.tsx"]
depends_on: ["web-tailor/tone","shared/tailoring","web-enrich/answers","web-enrich/voice","web-tailor/flow-redo","web-tailor/cover-letter","api-tailor/letter"]
contract: false
checked_hash: fcb9403a
cited: [0c2a6f, d1db38, 8c8900, ca71e4, 33864e, a21fd4, 80dc5a, 13a98a, 4f8c30, f96bb3, 4849ad, 151ced, 632a0e, f46024, 88bd2c, 0b932e, 494cc0, 56ffe8, 9b69e3, e4122d, 9bcc3a, 7ac20c, 13a98a, 904e1c, af8738, 151ced, 9c2236, 93eab7, 1f5491, a4cfb8, c1ac6d, 97f974]
decisions: []
open: []
---
Collect optional tailoring preferences and provide shared letter dictation controls.

- State initializes from stored steering, otherwise neutral tone, empty draws/focus/instruction and null fit. `apps/web/src/tailor/SteeringStep.tsx:37` -> `screen`
- Draw chips toggle independently; selecting the current fit clears it back to null. `apps/web/src/tailor/SteeringStep.tsx:61` -> `toggle`; `apps/web/src/tailor/SteeringStep.tsx:67` -> `null`
- Start filters selected role ids through the supplied roles in their order, trims instruction and omits blank instruction. `apps/web/src/tailor/SteeringStep.tsx:49` -> `start`
- Local MAX=500 truncates AnswerBox changes and mirrors SteeringSchema.shape.instruction's max(500); the shared module has no separately named limit constant for it. `apps/web/src/tailor/SteeringStep.tsx:9` -> `MAX`; `apps/web/src/tailor/SteeringStep.tsx:80` -> `slice`; `packages/shared/src/tailor.ts:20` -> `max(500)`
- Back to Tone changes only the screen; busy makes AnswerBox read-only and disables Start. `apps/web/src/tailor/SteeringStep.tsx:79` -> `readOnly`; `apps/web/src/tailor/SteeringStep.tsx:84` -> `setScreen`
- SteerConfirm is an alertdialog with both confirmation buttons disabled during restart. `apps/web/src/tailor/SteeringStep.tsx:93` -> `alertdialog`; `apps/web/src/tailor/SteeringStep.tsx:97` -> `disabled`
- useDictation uses English voice locale and a ref updated in layout effect for the latest append callback; unavailable microphones are omitted. `apps/web/src/tailor/SteeringStep.tsx:15` -> `useDictation`
- tested by `apps/web/src/tailor/steering.test.tsx:78` -> `it`
- tested by `apps/web/src/tailor/redo.test.tsx:91` -> `it`

## Connections

- The companion cover-letter body input also hand-copies a currently matching shared schema limit: maxLength=4000 mirrors CoverLetterSchema.body.max(4000), with no named shared constant. `apps/web/src/tailor/CoverLetterTab.tsx:94` -> `maxLength={4000}`; `packages/shared/src/tailor.ts:178` -> `max(4000)`
- Cover-letter context/manager maxLength values 1000/120 currently match API-only LetterBodySchema caps (and edit caps), rather than shared constants; shared CoverLetterSchema leaves those strings uncapped. `apps/web/src/tailor/CoverLetterTab.tsx:105` -> `maxLength={1000}`; `apps/web/src/tailor/CoverLetterTab.tsx:111` -> `maxLength={120}`; `apps/api/src/tailor/letter.ts:13` -> `LetterBodySchema`; `apps/api/src/tailor/letter.ts:16` -> `max(120)`; `apps/api/src/tailor/letter.ts:17` -> `max(1000)`; `packages/shared/src/tailor.ts:179` -> `hiringManager`

- Uses the enrichment AnswerBox without option chips. `apps/web/src/tailor/SteeringStep.tsx:79` -> `AnswerBox`; `apps/web/src/cv/enrich/AnswerBox.tsx:65` -> `AnswerBox`
- Used by cover-letter why-company dictation. `apps/web/src/tailor/CoverLetterTab.tsx:38` -> `useDictation`; `apps/web/src/tailor/SteeringStep.tsx:15` -> `useDictation`
- Uses tailor-steer-qs spacing and shared fm-foot controls. `apps/web/src/tailor/SteeringStep.tsx:57` -> `tailor-steer-qs`; `apps/web/src/styles/tailor.css:47` -> `.tailor-steer-qs`; `apps/web/src/tailor/SteeringStep.tsx:83` -> `fm-foot`; `apps/web/src/styles/focus.css:60` -> `.fm-foot`

## Assumptions

- Role membership is filtered against supplied roles before submission; authoritative steering validation remains on the server. `apps/web/src/tailor/SteeringStep.tsx:50` -> `roles.filter`; `apps/api/src/tailor/routes.ts:39` -> `SteeringSchema.parse`

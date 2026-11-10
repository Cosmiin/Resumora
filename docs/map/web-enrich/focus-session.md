---
id: web-enrich/focus-session
area: web-enrich
files: ["apps/web/src/cv/enrich/useFocusSession.ts","apps/web/src/cv/enrich/focus-session.test.tsx"]
depends_on: ["web-enrich/client","web-enrich/focus-answers","web-enrich/focus-generation","web-enrich/focus-acceptance","web-enrich/focus-facts","web-enrich/role-description","web-enrich/scores","shared/cv","shared/enrichment-score","shared/enrichment-focus","api-enrich/score","web-editor/autosave"]
contract: false
checked_hash: 6860a7f1
cited: [96505e, 26fd08, da735e, 41e864, 83f818, 8954d3, 8d60aa, 5fcbd0, 1fc50e, 987b00, e0a86c, 136c49, 987b00, 47d38f, 8f493d, 3dbb41, 7d7a69, 43b25d, f80277, ec1a49, ceb031, 25c211, 43b25d, 5ace86, c88f16, 241ac4, 4de6de, 04d411, 5fcbd0, 7715e0, 47d38f, 8f493d]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Build the scored-item queue and choose the opening question or brain dump.

- Improve queues bullets below literal 75, mirroring shared band's clear boundary; standOut queues nonspecific impact. A chosen bullet is included regardless of grade; improve sorts weakest first and promotes that chosen ID. `apps/web/src/cv/enrich/useFocusSession.ts:54` -> `fingerprint`; `apps/web/src/cv/enrich/useFocusSession.ts:57` -> `opts.bulletId`; `apps/web/src/cv/enrich/useFocusSession.ts:58` -> `< 75`; `apps/web/src/cv/enrich/useFocusSession.ts:60` -> `bullets.sort`; `packages/shared/src/enrich.ts:278` -> `75`
- Thin means <=1 bullet or result.thin; thin opens brainDump, otherwise role questions precede the bullet queue. This follows current code rather than decision 0013's historical two-bullet wording. `apps/web/src/cv/enrich/useFocusSession.ts:51` -> `length <= 1`; `apps/web/src/cv/enrich/useFocusSession.ts:94` -> `isThin`; `apps/web/src/cv/enrich/useFocusSession.ts:95` -> `roleQuestions.length`
- Existing note questions initialize the asked set; question identity trims, collapses whitespace and lowercases. Repeated role questions are removed, and per-bullet question count stops at three, not two. `apps/web/src/cv/enrich/useFocusSession.ts:66` -> `questionKey`; `apps/web/src/cv/enrich/useFocusSession.ts:76` -> `count >= 3`; `apps/web/src/cv/enrich/useFocusSession.ts:124` -> `roleQuestions.filter`; `apps/web/src/cv/enrich/useFocusSession.ts:149` -> `role?.notes`
- Missing/deleted/completed bullets, repeated questions and absent follow-ups advance the queue; a bullet with no question triggers improvement immediately. `apps/web/src/cv/enrich/useFocusSession.ts:76` -> `role?.bullets.some`; `apps/web/src/cv/enrich/useFocusSession.ts:82` -> `kind: "working"`; `apps/web/src/cv/enrich/useFocusSession.ts:273` -> `run`
- Opening with a stale/missing score waits for save and requests a score; 502/503 or other exceptions fall back to questions/bullets/free talk instead of a failure screen. A returned stale fingerprint is discarded. `apps/web/src/cv/enrich/useFocusSession.ts:153` -> `fresh`; `apps/web/src/cv/enrich/useFocusSession.ts:303` -> `waitForSave`; `apps/web/src/cv/enrich/useFocusSession.ts:307` -> `scoreRole`; `apps/web/src/cv/enrich/useFocusSession.ts:308` -> `catch`; `apps/web/src/cv/enrich/useFocusSession.ts:312` -> `result = undefined`
- tested by `apps/web/src/cv/enrich/focus-session.test.tsx:79` -> `describe`
- tested by `apps/web/src/cv/enrich/focus-session.test.tsx:802` -> `describe`

## Connections

- Uses POST /v1/enrich/score `{roleId,fingerprint,fresh?}` -> RoleResult for opening and box follow-up. `apps/web/src/cv/enrich/useFocusSession.ts:307` -> `scoreRole`; `apps/web/src/cv/enrich/useFocusSession.ts:390` -> `scoreRole`; `apps/web/src/cv/enrich/enrich-api.ts:35` -> `/v1/enrich/score`; `apps/api/src/enrich/routes.ts:55` -> `/score`
- Uses [focus-facts](./focus-facts.md): explicit close derives facts; navigation cleanup only marks the session inactive. `apps/web/src/cv/enrich/useFocusSession.ts:177` -> `s.alive = false`; `apps/web/src/cv/enrich/useFocusSession.ts:560` -> `roleFacts`
- Uses [focus-answers](./focus-answers.md): the question queue feeds note submission and its follow-up scoring. `apps/web/src/cv/enrich/useFocusSession.ts:95` -> `roleQuestions.length`; `apps/web/src/cv/enrich/useFocusSession.ts:460` -> `setNote`
- Uses [focus-generation](./focus-generation.md) when a queue item has no further question. `apps/web/src/cv/enrich/useFocusSession.ts:82` -> `kind: "working"`; `apps/web/src/cv/enrich/useFocusSession.ts:273` -> `run`

## Assumptions

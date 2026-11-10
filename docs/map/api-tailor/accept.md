---
id: api-tailor/accept
area: api-tailor
files: ["apps/api/src/tailor/accept.ts","apps/api/test/tailor-accept.test.ts"]
depends_on: ["shared/tailoring","shared/notes","db/tailoring-runs","api-tailor/proposal-matching","api-tailor/proposal-application","api-tailor/accept-save","api-tailor/section-routes"]
contract: true
checked_hash: dc7f97e0
cited: [0ce123, e08db5, 838056, 20b0c3, bfca10, 01dd79, f1560d, 836a45, ad4a41, f1560d, 2621dc, 69361b, f87893, 03c014, d841d0, 5f4703, d55a26, 53e9bc, 90de37, 38360d, f2dce7, 7c5c9a, fb2b0b, ad4a41, 77d89f, 2966ed, 9984fb, 4b4600, 99c7cf, 82f1ab, 2b1539, b68419, db47b1, 7c5c9a, 3c3a83, 6faba3, 3a582f, eabaeb, 95dd4e, dcbaff, 3240a7, 2966ed, 0ce123, ad4a41]
decisions: ["docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Resolve review decisions against currently stored proposals, including the limits of stale-review protection.

- Accept body defaults decisions/inferred/flags to empty arrays, caps choices at 500 and flags at 100; choice text is optional trimmed nonempty MAX_TEXT text `apps/api/src/tailor/accept.ts:17` -> `const Choice`; `apps/api/src/tailor/accept.ts:18` -> `AcceptBodySchema`.
- Normal acceptance rejects done/noncurrent sections; only role sections with a populated currentRoleId require that exact roleId, otherwise scope is null. Redo bypasses these section/role guards and uses supplied roleId or null `apps/api/src/tailor/accept.ts:94` -> `!input.redo`; `apps/api/src/tailor/accept.ts:97` -> `currentRole`; `apps/api/src/tailor/section-pass.ts:31` -> `run.currentRoleId`; `apps/api/src/tailor/section-pass.ts:32` -> `roleId !== run.currentRoleId`.
- Only proposals whose itemId belongs to the current content's section map are applied; new-skill review keys include exact proposal text, other keys are itemId alone `apps/api/src/tailor/accept.ts:31` -> `reviewKey`; `apps/api/src/tailor/accept.ts:117` -> `sectionItems`; `apps/api/src/tailor/accept.ts:124` -> `ids.has`.
- Flagged legacy proposals require explicit confirmation linked by reviewKey|field (new-skill keys include proposal text), or legacy text prefix when the question has no itemId. Confirmation constructs a job note, persisted only when its role matches a Base CV scored item or a fallback experience role exists `apps/api/src/tailor/accept.ts:31` -> `reviewKey`; `apps/api/src/tailor/accept.ts:35` -> `reviewKey(p)`; `apps/api/src/tailor/accept.ts:129` -> `flagQuestionFor`; `apps/api/src/tailor/accept.ts:132` -> `notes.push`; `apps/api/src/tailor/accept.ts:179` -> `const target`; `apps/api/src/tailor/accept.ts:182` -> `addJobNotes`.
- Unanswered unflagged proposals, including inferred guesses, are kept by default but reviewed stays false; explicit inferred decisions override ordinary decisions `apps/api/src/tailor/accept.ts:137` -> `inferred.get`; `apps/api/src/tailor/accept.ts:151` -> `keep ?? !p.flags.length`.
- Summary guess choices use summary#<index> after placement; missing choices keep spans unreviewed, while remove/edit changes the applied summary `apps/api/src/tailor/accept.ts:140` -> `p.guesses`; `apps/api/src/tailor/accept.ts:142` -> `guessChoices.get`; `apps/api/src/tailor/accept.ts:146` -> `reviewed: choice !== undefined`.
- tested by `apps/api/test/tailor-accept.test.ts:95` -> `accept section`.
- A stale review is not bound to a proposal or document version: browser enter regenerates waiting_user proposals, AcceptBody carries no version, and accept applies currently stored proposals using the freshly read document version. One tab can therefore accept another tab?s replacement wording without a conflict `apps/web/src/tailor/TailorFlow.tsx:64` -> `waiting_user`; `apps/web/src/tailor/tailor-api.ts:10` -> `AcceptBody`; `apps/api/src/tailor/accept.ts:124` -> `run.proposals`; `apps/api/src/tailor/accept.ts:99` -> `getTailoredCv`; `apps/api/src/tailor/accept.ts:168` -> `doc.version`.

## Connections

- Used by browser section/role accept URLs `apps/web/src/tailor/tailor-api.ts:53` -> `/accept`; `apps/api/src/tailor/routes.ts:93` -> `/accept`; `apps/api/src/tailor/routes.ts:97` -> `acceptSection`; `apps/web/src/tailor/tailor-api.ts:82` -> `/accept`; `apps/api/src/tailor/routes.ts:114` -> `/accept`; `apps/api/src/tailor/routes.ts:118` -> `acceptSection`; `apps/api/src/tailor/accept.ts:88` -> `acceptSection`.
- Browser re-entry regenerates proposals through api-tailor/section-routes and api-tailor/section-pass `apps/web/src/tailor/TailorFlow.tsx:64` -> `work(current)`; `apps/web/src/tailor/TailorFlow.tsx:85` -> `api.runSection`; `apps/web/src/tailor/tailor-api.ts:46` -> `/run`; `apps/api/src/tailor/routes.ts:80` -> `/run`; `apps/api/src/tailor/section-pass.ts:126` -> `proposals:`.
- Uses api-tailor/proposal-application for kept wording and api-tailor/accept-save for scoring and persistence `apps/api/src/tailor/accept.ts:153` -> `apply(content`; `apps/api/src/tailor/accept.ts:38` -> `function apply`; `apps/api/src/tailor/accept.ts:164` -> `scoreMatch`; `apps/api/src/tailor/accept.ts:168` -> `saveTailoredCv`.

## Assumptions

- Decisions identify review items, not the wording displayed in the tab; safe review relies on stored proposals remaining unchanged until accept `apps/api/src/tailor/accept.ts:17` -> `itemId`; `apps/api/src/tailor/accept.ts:124` -> `run.proposals`.

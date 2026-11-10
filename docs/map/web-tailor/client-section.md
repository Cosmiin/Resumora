---
id: web-tailor/client-section
area: web-tailor
files: ["apps/web/src/tailor/tailor-api.ts","apps/web/src/tailor/tailor-flow.test.tsx","apps/web/src/tailor/redo.test.tsx"]
depends_on: ["shared/tailoring","api-tailor/section-routes","api-tailor/answers","api-tailor/accept","api-tailor/redo","api-tailor/section-pass","api-tailor/accept-save"]
contract: true
checked_hash: dd389091
decisions: []
open: []
---
Send section questions, answers, proposals and acceptance decisions.

- AcceptBody carries decisions {itemId,keep}, inferred {itemId,keep,text?}, flags {questionId,confirmed}, and optional roleId. `apps/web/src/tailor/tailor-api.ts:10` -> `AcceptBody`
- Questions POSTs {roleId} when truthy, otherwise {}, validates {questions: TailorQuestion[]} and returns the array. `apps/web/src/tailor/tailor-api.ts:20` -> `roleBody`; `apps/web/src/tailor/tailor-api.ts:33` -> `askQuestions`
- Answers POSTs {answers: Answer[]} and requires {ok:true}; the server requires 1 through MAX_RUN_QUESTIONS answers. `apps/web/src/tailor/tailor-api.ts:41` -> `answers`; `apps/api/src/tailor/routes.ts:19` -> `AnswersBodySchema`
- Section generation POSTs the optional role id, validates proposals and questions arrays, and defaults missing removed to zero with nonnegative integer validation. `apps/web/src/tailor/tailor-api.ts:45` -> `runSection`
- Section acceptance sends AcceptBody and requires {run:TailorRun,score:MatchScore}. `apps/web/src/tailor/tailor-api.ts:52` -> `acceptSection`
- Redo sends {answers} and validates proposals plus default-zero removed; role acceptance returns the same run-and-score envelope as section acceptance. `apps/web/src/tailor/tailor-api.ts:74` -> `redoRole`; `apps/web/src/tailor/tailor-api.ts:81` -> `acceptRole`
- tested by `apps/web/src/tailor/tailor-flow.test.tsx:74` -> `it`
- tested by `apps/web/src/tailor/redo.test.tsx:59` -> `it`

## Connections

- Acceptance carries item decisions without a proposal version; regeneration replaces those items in the stored run, and acceptance reads run.proposals, so another tab can replace the wording those decisions accept. `apps/web/src/tailor/tailor-api.ts:10` -> `AcceptBody`; `apps/api/src/tailor/section-pass.ts:124` -> `updateRun`; `apps/api/src/tailor/accept.ts:124` -> `run.proposals`
- The acceptance save check uses the document version freshly fetched inside that request, rather than a version from the review screen. `apps/web/src/tailor/tailor-api.ts:10` -> `AcceptBody`; `apps/api/src/tailor/accept.ts:99` -> `getTailoredCv`; `apps/api/src/tailor/accept.ts:168` -> `doc.version`

- Uses POST /v1/tailor-runs/:id/sections/:section/questions. `apps/web/src/tailor/tailor-api.ts:34` -> `/questions`; `apps/api/src/tailor/routes.ts:69` -> `app.post`
- Uses POST /v1/tailor-runs/:id/answers. `apps/web/src/tailor/tailor-api.ts:41` -> `/answers`; `apps/api/src/tailor/routes.ts:140` -> `app.post`
- Uses POST /v1/tailor-runs/:id/sections/:section/run. `apps/web/src/tailor/tailor-api.ts:46` -> `/run`; `apps/api/src/tailor/routes.ts:80` -> `app.post`
- Uses POST /v1/tailor-runs/:id/sections/:section/accept. `apps/web/src/tailor/tailor-api.ts:53` -> `/accept`; `apps/api/src/tailor/routes.ts:93` -> `app.post`
- Uses POST /v1/tailor-runs/:id/roles/:roleId/redo. `apps/web/src/tailor/tailor-api.ts:75` -> `/redo`; `apps/api/src/tailor/routes.ts:104` -> `app.post`
- Uses POST /v1/tailor-runs/:id/roles/:roleId/accept; the server explicitly selects redo:true. `apps/web/src/tailor/tailor-api.ts:82` -> `/accept`; `apps/api/src/tailor/routes.ts:114` -> `app.post`; `apps/api/src/tailor/routes.ts:120` -> `redo: true`

## Assumptions

- Section names are typed client-side and parsed by TailorSectionSchema server-side; role ids still need server validation against the run. `apps/web/src/tailor/tailor-api.ts:33` -> `TailorSection`; `apps/api/src/tailor/routes.ts:70` -> `TailorSectionSchema`; `apps/api/src/tailor/routes.ts:117` -> `finishedRole`

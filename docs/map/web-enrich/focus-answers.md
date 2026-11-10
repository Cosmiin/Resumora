---
id: web-enrich/focus-answers
area: web-enrich
files: ["apps/web/src/cv/enrich/useFocusSession.ts","apps/web/src/cv/enrich/focus-session.test.tsx"]
depends_on: ["web-enrich/focus-session","web-enrich/focus-generation","web-enrich/client","web-enrich/answers","web-enrich/question-step","web-enrich/brain-dump","shared/cv","shared/enrichment-focus","web-editor/reducer-notes","web-editor/autosave","api-enrich/score"]
contract: false
checked_hash: 6860a7f1
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Save typed, picked and spoken answers and revisit notes without replaying later steps.

- Answers trim and cap to MAX_LONG_TEXT, reject blank input, and dispatch setNote with ID, question, answer, via and askedAt; an empty via list becomes type. `apps/web/src/cv/enrich/useFocusSession.ts:455` -> `MAX_LONG_TEXT`; `apps/web/src/cv/enrich/useFocusSession.ts:460` -> `setNote`; `apps/web/src/cv/enrich/useFocusSession.ts:461` -> `via.length`
- Back resubmission updates the same note ID and returns to the latest step without regenerating later steps; Skip while revisiting retains the existing answer. `apps/web/src/cv/enrich/useFocusSession.ts:403` -> `revisit`; `apps/web/src/cv/enrich/useFocusSession.ts:468` -> `entry.noteId`; `apps/web/src/cv/enrich/useFocusSession.ts:473` -> `revisit: null`
- Answering the opening box triggers score with fresh=true after saving; on failure it retains prior questions. After the role questions, a session marked thin still sends source=answers even if the fresh result stopped being thin. `apps/web/src/cv/enrich/useFocusSession.ts:485` -> `rescoreAfterBox`; `apps/web/src/cv/enrich/useFocusSession.ts:390` -> `true`; `apps/web/src/cv/enrich/useFocusSession.ts:394` -> `catch`; `apps/web/src/cv/enrich/useFocusSession.ts:367` -> `s.thinFlow`
- tested by `apps/web/src/cv/enrich/focus-session.test.tsx:79` -> `describe`
- tested by `apps/web/src/cv/enrich/focus-session.test.tsx:802` -> `describe`

## Connections

- Uses setNote; the reducer replaces existing IDs, or evicts oldest notes of the same job/non-job kind at its limit. `apps/web/src/cv/enrich/useFocusSession.ts:460` -> `setNote`; `apps/web/src/cv/edit/cvReducer.ts:344` -> `case "setNote"`; `apps/web/src/cv/edit/cvReducer.ts:350` -> `sameKind`; `apps/web/src/cv/edit/cvReducer.ts:354` -> `oldestFirst`
- Uses POST /v1/enrich/score with `{roleId,fingerprint,fresh:true}` after an opening-box answer; it parses RoleResult and keeps prior questions if the call fails. `apps/web/src/cv/enrich/useFocusSession.ts:390` -> `scoreRole`; `apps/web/src/cv/enrich/useFocusSession.ts:394` -> `catch`; `apps/web/src/cv/enrich/enrich-api.ts:35` -> `/v1/enrich/score`; `apps/api/src/enrich/routes.ts:55` -> `/score`
- Uses [focus-generation](./focus-generation.md): answered thin flows generate additions using source=answers. `apps/web/src/cv/enrich/useFocusSession.ts:367` -> `s.thinFlow`; `apps/web/src/cv/enrich/useFocusSession.ts:249` -> `brainDump`

## Assumptions

---
id: web-enrich/focus-facts
area: web-enrich
files: ["apps/web/src/cv/enrich/useFocusSession.ts","apps/web/src/cv/enrich/focus-session.test.tsx"]
depends_on: ["web-enrich/focus-session","web-enrich/focus-answers","web-enrich/focus-ui","web-enrich/client-focus","api-enrich/role-facts","shared/enrichment-focus","web-editor/reducer-notes","web-editor/autosave"]
contract: false
checked_hash: 6860a7f1
cited: [35edec, 04d411, cf773f, 30b697, bfb54f, 4de6de, ef6f7e, 04d411, 7c684b, d75298, 6ae58c, 798cbf, 04d411, 197d3a, 860ee6, 8c0410, e23f17, fc6d17, 7715e0, 04d411, 4b301d, 04d411, fc6d17, c8adef]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Close a focus session and derive facts only from the notes that still match.

- Close works while busy, closes immediately, and only if notes changed starts save -> roleFacts in the background; returned facts dispatch only if notesHash still equals fromNotes. All fact failures, including 502/503, are ignored. `apps/web/src/cv/enrich/useFocusSession.ts:558` -> `s.closed = true`; `apps/web/src/cv/enrich/useFocusSession.ts:560` -> `roleFacts`; `apps/web/src/cv/enrich/useFocusSession.ts:562` -> `notesHash`; `apps/web/src/cv/enrich/useFocusSession.ts:565` -> `catch`; `apps/web/src/cv/enrich/useFocusSession.ts:566` -> `o.onClose`
- Leaving by navigation or another unmount does not call Close: cleanup only clears alive, so changed notes do not trigger roleFacts on departure. Remount initializes notesChanged=false and does not recover that pending fact generation. `apps/web/src/cv/enrich/useFocusSession.ts:177` -> `s.alive = false`; `apps/web/src/cv/enrich/useFocusSession.ts:165` -> `notesChanged: false`; `apps/web/src/cv/enrich/useFocusSession.ts:560` -> `s.notesChanged`
- API and saving use stand-ins; these tests do not cover departure recovery or specifically 502/503 fact failures. Close while busy, waiting for save, changed-note fact dispatch, stale/missing-role rejection, and no-note/generic-failure behavior are tested by `apps/web/src/cv/enrich/focus-session.test.tsx:475` -> `it`; `apps/web/src/cv/enrich/focus-session.test.tsx:748` -> `it`; `apps/web/src/cv/enrich/focus-session.test.tsx:763` -> `it.each`; `apps/web/src/cv/enrich/focus-session.test.tsx:780` -> `it`

## Connections

- Uses POST /v1/enrich/role-facts `{roleId}` -> `{facts,fromNotes}`; both hook and reducer enforce current-note hash before storing `{items,fromNotes,updatedAt}`. `apps/web/src/cv/enrich/useFocusSession.ts:560` -> `roleFacts`; `apps/web/src/cv/enrich/enrich-api.ts:47` -> `/v1/enrich/role-facts`; `apps/api/src/enrich/routes.ts:147` -> `/role-facts`; `apps/web/src/cv/enrich/useFocusSession.ts:563` -> `setFacts`; `apps/web/src/cv/edit/cvReducer.ts:339` -> `notesHash`; `packages/shared/src/enrich-focus.ts:9` -> `n.answer`
- Uses [focus-answers](./focus-answers.md): only submitted notes mark the session for fact generation on Close. `apps/web/src/cv/enrich/useFocusSession.ts:460` -> `setNote`; `apps/web/src/cv/enrich/useFocusSession.ts:560` -> `s.notesChanged`

## Assumptions

- Closing suppresses late generation UI updates but does not abort JSON requests; fact completion intentionally continues after close. `apps/web/src/cv/enrich/useFocusSession.ts:241` -> `s.closed`; `apps/web/src/cv/enrich/useFocusSession.ts:560` -> `then`
- The fact hash covers ordered note IDs and answers only; question text, via, askedAt and other metadata do not participate. setNote spreads the existing role and changes notes without clearing existing facts, so matching this hash is narrower than checking every note field. `packages/shared/src/enrich-focus.ts:9` -> `n.id`; `apps/web/src/cv/edit/cvReducer.ts:359` -> `{ ...r, notes }`

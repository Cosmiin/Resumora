---
id: web-app/import-review
area: web-app
files: ["apps/web/src/imports/ImportScreen.tsx","apps/web/src/imports/imports.test.tsx"]
depends_on: ["web-app/import-client","web-app/import-summary","web-app/styles-import","web-editor/document","web-editor/autosave","web-editor/cv-api","shared/move-other","api-core/import-routes"]
contract: false
checked_hash: bd3bd8b0
decisions: ["docs/decisions/0004-imports-go-through-a-queue.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Poll an import, review local moves and apply it before saving those moves.

- Polling uses the import ID as query key, gcTime zero and a two-second interval until ready, failed, applied or the slow flag. `apps/web/src/imports/ImportScreen.tsx:11` -> `2000`; `apps/web/src/imports/ImportScreen.tsx:49` -> `queryKey`
- A twenty-minute timer stops polling through slow; it is cleared on effect cleanup. `apps/web/src/imports/ImportScreen.tsx:16` -> `20 * 60_000`; `apps/web/src/imports/ImportScreen.tsx:44` -> `setSlow(true)`
- The dialog focuses itself on mount; Escape and the cancel button call close. `apps/web/src/imports/ImportScreen.tsx:40` -> `focus`; `apps/web/src/imports/ImportScreen.tsx:114` -> `Escape`
- Preview uses locally edited data first, otherwise only a ready import result. `apps/web/src/imports/ImportScreen.tsx:60` -> `edited ??`
- Moving Other content calls moveOtherTo and updates only the chosen heading's category, and only when that custom entry is fully removed. `apps/web/src/imports/ImportScreen.tsx:65` -> `moveOtherTo`; `apps/web/src/imports/ImportScreen.tsx:71` -> `allMoved`
- Apply first calls applyImport with currentVersion(), remembering its SaveResponse before any move save. `apps/web/src/imports/ImportScreen.tsx:87` -> `appliedRef.current ??`
- Without moves, onApplied receives the imported result content and server save metadata; with moves, saveCv writes edited.content using the just-applied version. `apps/web/src/imports/ImportScreen.tsx:89` -> `onApplied`; `apps/web/src/imports/ImportScreen.tsx:92` -> `saved.version`
- A failed move save keeps the remembered apply result, so retry repeats only the CV save; version conflicts from either stage are passed to onConflict. `apps/web/src/imports/ImportScreen.tsx:87` -> `appliedRef`; `apps/web/src/imports/ImportScreen.tsx:95` -> `onConflict`; `apps/web/src/imports/ImportScreen.tsx:99` -> `onConflict`
- Closing after server apply reports the original imported content with saved metadata, even when move saving failed. `apps/web/src/imports/ImportScreen.tsx:77` -> `onApplied`
- Apply buttons are disabled while applying or when canApply is false; the screen shows separate apply/move failures and waiting-for-save copy. `apps/web/src/imports/ImportScreen.tsx:122` -> `!canApply || applying`; `apps/web/src/imports/ImportScreen.tsx:137` -> `applyFailed`
- tested by `apps/web/src/imports/imports.test.tsx:326` -> `retry saves only the moves`
- tested by `apps/web/src/imports/imports.test.tsx:361` -> `cancelling after the moves failed`
## Connections
- Used by Editor with canApply tied to saved status, and with the covered workspace made inert: `apps/web/src/cv/Editor.tsx:283` -> `status === "saved"`; `apps/web/src/imports/ImportScreen.tsx:122` -> `canApply`; `apps/web/src/cv/Editor.tsx:230` -> `inert`
- Subsequent moved-content PUT uses the CV client/route: `apps/web/src/imports/ImportScreen.tsx:92` -> `saveCv`; `apps/web/src/cv/cv-api.ts:38` -> `/v1/cv`; `apps/api/src/cv/routes.ts:44` -> `app.put`
- Uses document rendering with unsorted skills shown: `apps/web/src/imports/ImportScreen.tsx:133` -> `showUnsorted`; `apps/web/src/cv/page/CvDocument.tsx:30` -> `showUnsorted`
## Assumptions
- onApplied reconstructs content from the polled import, while the server may carry existing role notes into applied content; this screen does not reread that enriched server result before reporting success. `apps/web/src/imports/ImportScreen.tsx:89` -> `imp.result.content`; `apps/api/src/imports/routes.ts:71` -> `carryNotes`
- Apply's save barrier is supplied by its caller; apply itself checks for result data, not canApply. `apps/web/src/imports/ImportScreen.tsx:82` -> `!imp?.result`; `apps/web/src/cv/Editor.tsx:283` -> `canApply`

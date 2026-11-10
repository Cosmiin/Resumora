---
id: web-editor/autosave
area: web-editor
files: ["apps/web/src/cv/useAutosave.ts","apps/web/src/cv/unsaved.ts","apps/web/src/cv/ConflictBanner.tsx","apps/web/src/cv/useAutosave.test.ts"]
depends_on: ["web-editor/cv-api","shared/cv","shared/notes","api-core/cv-routes"]
contract: false
checked_hash: 31a8d021
cited: [2e4f8d, 61f5d4, 919062, 33e3b7, 9679ed, 3f3726, c4ddbf, 74ca77, 9258e8, c09880, 7f5390, 1b740f, 3f3726, dfd57d, fe71c3, 31ae71, 64f993, 290eea, 82dd42, 28a904, f42a1f, 6a0006, b30447, 974fd5, 1d0077, f60fdd, a9dfe1, 83c32a, 7b5162, 87ec97, 63a734, dc68f2, e1b98e, 19cdc5, c74ce9, 7d6293, ae2767, 2e4f8d, 7f5390, 76392f, 35379f, 3f3726, 1b9cd5, 215f7b, e92900, 06d671, 748136, 974fd5, f95bee, 57c69d, 2223e5, 29b0dd, fa6265, f15f03, 77dfad, 1ff255, 319f1c, 63937a, 2684c4, dece1f, 716a7f, 49a1b2, c4ddbf]
decisions: ["docs/decisions/0006-last-save-wins-with-a-version-check.md","docs/decisions/0012-ai-enrichment-scores-and-notes.md"]
open: []
---
Serialize edits into version-checked saves and expose conflict resolution and save-completion waiting.

- Initial content is both the latest and last-saved reference; default debounce is one second. `apps/web/src/cv/useAutosave.ts:28` -> `delayMs = 1000`; `apps/web/src/cv/useAutosave.ts:34` -> `latest`
- Flush returns while saving or paused and skips saving when latest and lastSaved are the same object. `apps/web/src/cv/useAutosave.ts:55` -> `flush`
- Before the initial request, checkContent validates CvContentSchema and the UTF-8 JSON envelope including version against MAX_CV_BYTES; the notes-conflict retry changes the payload with mergeNewerNotes and sends it without repeating this validation. `apps/web/src/cv/useAutosave.ts:63` -> `checkContent`; `apps/web/src/cv/useAutosave.ts:174` -> `checkContent`; `apps/web/src/cv/useAutosave.ts:84` -> `mergeNewerNotes`; `apps/web/src/cv/useAutosave.ts:88` -> `saveRef.current`
- Each save sends the current version; after success it adopts the returned version and immediately flushes edits made during the request. `apps/web/src/cv/useAutosave.ts:74` -> `saveRef.current`; `apps/web/src/cv/useAutosave.ts:90` -> `version.current`
- For a version conflict with a known saved baseline, it loads the server CV and retries once if server content is identical to that baseline or differs solely in notes/facts. `apps/web/src/cv/useAutosave.ts:76` -> `lastSaved.current`; `apps/web/src/cv/useAutosave.ts:83` -> `onlyNotesDiffer`; `packages/shared/src/notes.ts:83` -> `comparable(a) === comparable(b)`
- Automatic recovery merges server notes/facts into the latest local edits, updates local state and server version, and retries the save. `apps/web/src/cv/useAutosave.ts:84` -> `mergeNewerNotes`
- Other version conflicts stop the timer, pause saving and expose the server version/timestamp; further edits remain local while paused. `apps/web/src/cv/useAutosave.ts:48` -> `reportConflict`; `apps/web/src/cv/useAutosave.ts:117` -> `paused.current`
- Server 400/413 errors become invalid content without an automatic retry; other failures retry after five seconds. `apps/web/src/cv/useAutosave.ts:100` -> `err.status === 400`; `apps/web/src/cv/useAutosave.ts:9` -> `RETRY_MS`
- Load latest resets content, version, conflict and errors; keep mine adopts the conflict version and clears the saved baseline to force a save. `apps/web/src/cv/useAutosave.ts:126` -> `reset`; `apps/web/src/cv/useAutosave.ts:139` -> `keepMine`
- Conflict recognition checks ApiClientError.code === version_conflict, rather than the numeric status; absent conflict metadata defaults to version zero and an empty timestamp. `apps/web/src/cv/useAutosave.ts:169` -> `isConflict`; `apps/web/src/cv/useAutosave.ts:184` -> `conflictFrom`
- Unmount cleanup clears the pending debounce timer without flushing or persisting the draft; edits waiting for that timer are lost if the editor unmounts before it fires. `apps/web/src/cv/useAutosave.ts:120` -> `setTimeout`; `apps/web/src/cv/useAutosave.ts:147` -> `clearTimeout`
- Every status except saved sets a module-level unsaved boolean and attaches a beforeunload warning; cleanup clears the flag and removes the listener. Neither stores draft content. `apps/web/src/cv/useAutosave.ts:150` -> `setUnsavedChanges`; `apps/web/src/cv/unsaved.ts:7` -> `setUnsavedChanges`; `apps/web/src/cv/useAutosave.ts:154` -> `useEffect`
- waitForSave resolves immediately when saved without a newly marked edit; when the status effect observes saved, it clears the edit flag and resolves pending waiters without checking that flag. It rejects on error/conflict/invalid and times out after 15 seconds. `apps/web/src/cv/useAutosave.ts:231` -> `!edited.current`; `apps/web/src/cv/useAutosave.ts:220` -> `edited.current = false`; `apps/web/src/cv/useAutosave.ts:223` -> `w.resolve()`; `apps/web/src/cv/useAutosave.ts:202` -> `failedStatus`; `apps/web/src/cv/useAutosave.ts:232` -> `Promise.reject`; `apps/web/src/cv/useAutosave.ts:244` -> `setTimeout`; `apps/web/src/cv/useAutosave.ts:193` -> `SAVE_WAIT_MS`
- The conflict banner disables both actions while one runs and clears busy in finally; it does not catch rejection. `apps/web/src/cv/ConflictBanner.tsx:6` -> `const run`; `apps/web/src/cv/ConflictBanner.tsx:19` -> `disabled={busy}`
- tested by `apps/web/src/cv/useAutosave.test.ts:31` -> `describe("useAutosave"`

## Connections

- Used by the editor's source abstraction: `apps/web/src/cv/Editor.tsx:60` -> `useAutosave`; `apps/web/src/cv/useAutosave.ts:28` -> `useAutosave`
- Uses shared/notes comparison across experience, projects and volunteering, ignoring object key order but preserving array order: `apps/web/src/cv/useAutosave.ts:83` -> `onlyNotesDiffer`; `packages/shared/src/notes.ts:71` -> `onlyNotesDiffer`; `packages/shared/src/notes.ts:78` -> `!Array.isArray`
- Uses shared/notes merging: server duplicate note IDs win, newest notes are capped separately by kind, and newer facts win by timestamp: `apps/web/src/cv/useAutosave.ts:84` -> `mergeNewerNotes`; `packages/shared/src/notes.ts:53` -> `currentRoles`; `packages/shared/src/notes.ts:59` -> `const facts`; `packages/shared/src/notes.ts:20` -> `function merge`
- Uses the API version-conflict envelope: `apps/web/src/cv/useAutosave.ts:185` -> `err.body`; `apps/api/src/cv/routes.ts:32` -> `"version_conflict"`
- Used by AppShell sign-out and the /cv and /jobs link click handlers: the unsaved flag triggers confirmation, cancelling prevents sign-out/navigation, and confirming proceeds without waiting for a save. These are explicit action guards, not a router-wide blocker for browser Back or programmatic navigation. `apps/web/src/cv/useAutosave.ts:150` -> `setUnsavedChanges`; `apps/web/src/cv/unsaved.ts:11` -> `hasUnsavedChanges`; `apps/web/src/layout/AppShell.tsx:35` -> `hasUnsavedChanges`; `apps/web/src/layout/AppShell.tsx:45` -> `hasUnsavedChanges`; `apps/web/src/layout/AppShell.tsx:48` -> `hasUnsavedChanges`
- Uses global .conflict-banner, .conflict-actions and .secondary: `apps/web/src/cv/ConflictBanner.tsx:15` -> `conflict-banner`; `apps/web/src/styles/editor.css:28` -> `.conflict-banner`; `apps/web/src/cv/ConflictBanner.tsx:18` -> `conflict-actions`; `apps/web/src/styles/editor.css:14` -> `.conflict-actions`; `apps/web/src/cv/ConflictBanner.tsx:22` -> `secondary`; `apps/web/src/styles/app.css:40` -> `button.secondary`

## Assumptions

- Change detection assumes immutable updates: returning the same content object suppresses scheduling. `apps/web/src/cv/useAutosave.ts:114` -> `next === latest.current`
- Automatic note merging requires stable role IDs and parseable fact timestamps in the shared helper. `packages/shared/src/notes.ts:57` -> `currentRoles.get`; `packages/shared/src/notes.ts:60` -> `Date.parse`
- The save/load callbacks must describe the same CV and implement version checks; the hook trusts their typed responses. `apps/web/src/cv/useAutosave.ts:11` -> `type Options`; `apps/web/src/cv/useAutosave.ts:88` -> `saveRef.current`

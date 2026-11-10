---
id: web-editor/autosave
area: web-editor
files: ["apps/web/src/cv/useAutosave.ts","apps/web/src/cv/unsaved.ts","apps/web/src/cv/ConflictBanner.tsx","apps/web/src/cv/useAutosave.test.ts"]
depends_on: ["web-editor/cv-api","shared/cv","shared/notes","api-core/cv-routes"]
contract: false
checked_hash: 31a8d021
decisions: ["docs/decisions/0006-last-save-wins-with-a-version-check.md","docs/decisions/0012-ai-enrichment-scores-and-notes.md"]
open: []
---
Serialize edits into version-checked saves and expose conflict resolution and save-completion waiting.

- Initial content is both the latest and last-saved reference; default debounce is one second. `apps/web/src/cv/useAutosave.ts:28` -> `delayMs = 1000`; `apps/web/src/cv/useAutosave.ts:34` -> `latest`
- Flush returns while saving or paused and skips saving when latest and lastSaved are the same object. `apps/web/src/cv/useAutosave.ts:55` -> `flush`
- Before the initial request, checkContent validates CvContentSchema and the UTF-8 JSON envelope including version against MAX_CV_BYTES; the notes-conflict retry changes the payload with mergeNewerNotes and sends it without repeating this validation. `apps/web/src/cv/useAutosave.ts:63` -> `checkContent`; `apps/web/src/cv/useAutosave.ts:174` -> `checkContent`; `apps/web/src/cv/useAutosave.ts:84` -> `mergeNewerNotes`; `apps/web/src/cv/useAutosave.ts:88` -> `saveRef.current`
- Each save sends the current version; after success it adopts the returned version and immediately flushes edits made during the request. `apps/web/src/cv/useAutosave.ts:74` -> `saveRef.current`; `apps/web/src/cv/useAutosave.ts:90` -> `version.current`
- For a version conflict with a known saved baseline, it loads the server CV and retries once only if server content differs from that baseline solely in notes/facts. `apps/web/src/cv/useAutosave.ts:76` -> `lastSaved.current`; `apps/web/src/cv/useAutosave.ts:83` -> `onlyNotesDiffer`
- Automatic recovery merges server notes/facts into the latest local edits, updates local state and server version, and retries the save. `apps/web/src/cv/useAutosave.ts:84` -> `mergeNewerNotes`
- Other version conflicts stop the timer, pause saving and expose the server version/timestamp; further edits remain local while paused. `apps/web/src/cv/useAutosave.ts:48` -> `reportConflict`; `apps/web/src/cv/useAutosave.ts:117` -> `paused.current`
- Server 400/413 errors become invalid content without an automatic retry; other failures retry after five seconds. `apps/web/src/cv/useAutosave.ts:100` -> `err.status === 400`; `apps/web/src/cv/useAutosave.ts:9` -> `RETRY_MS`
- Load latest resets content, version, conflict and errors; keep mine adopts the conflict version and clears the saved baseline to force a save. `apps/web/src/cv/useAutosave.ts:126` -> `reset`; `apps/web/src/cv/useAutosave.ts:139` -> `keepMine`
- Conflict recognition checks ApiClientError.code === version_conflict, rather than the numeric status; absent conflict metadata defaults to version zero and an empty timestamp. `apps/web/src/cv/useAutosave.ts:169` -> `isConflict`; `apps/web/src/cv/useAutosave.ts:184` -> `conflictFrom`
- Unmount cleanup clears the pending debounce timer without flushing or persisting the draft; edits waiting for that timer are lost if the editor unmounts before it fires. `apps/web/src/cv/useAutosave.ts:120` -> `setTimeout`; `apps/web/src/cv/useAutosave.ts:147` -> `clearTimeout`
- Every status except saved sets a module-level unsaved boolean and attaches a beforeunload warning; cleanup clears the flag and removes the listener. Neither stores draft content. `apps/web/src/cv/useAutosave.ts:150` -> `setUnsavedChanges`; `apps/web/src/cv/unsaved.ts:7` -> `setUnsavedChanges`; `apps/web/src/cv/useAutosave.ts:154` -> `useEffect`
- waitForSave resolves only when saved without a newly marked edit, rejects on error/conflict/invalid, and times out after 15 seconds. `apps/web/src/cv/useAutosave.ts:230` -> `waitForSave`; `apps/web/src/cv/useAutosave.ts:244` -> `setTimeout`; `apps/web/src/cv/useAutosave.ts:193` -> `SAVE_WAIT_MS`
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

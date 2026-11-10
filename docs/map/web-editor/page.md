---
id: web-editor/page
area: web-editor
files: ["apps/web/src/cv/CvPage.tsx","apps/web/src/cv/Editor.tsx","apps/web/src/cv/editor.test.tsx"]
depends_on: ["web-editor/autosave","web-editor/cv-api","web-editor/history","web-editor/reducer","web-editor/editable-page","web-editor/focus","web-editor/document","web-editor/overview","web-editor/bottom-sheet","shared/cv","web-editor/reducer-sections","web-editor/reducer-notes"]
contract: false
checked_hash: dc9315be
cited: [465f1b, 2f8b2e, 451315, c010c1, 10d013, 14d8c9, 55b22b, 8533fe, e447d6, dc696c, 579c56, 08bd66, a67a3d, aaa41d, 616a1b, b1559c, 6c8c3e, 3343f1, 2d6aa5, acea0b, f3297e, 565aaf, ae2767, 2e4f8d, 65036d, a7d2c2, 746094, 14d8c9, 726a7d, 2683cb, 084f81, e73d7b, 2132e3, 1673bc, 15c290, 620aa3, b7b8d5, 9b02aa, 1f40ff, 7bf245, 6c8c3e, 18f973, bceba0, daff69, 85a562, 8e49ca, e6da5f, c329ae, ae2767, edceb5]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md","docs/decisions/0006-last-save-wins-with-a-version-check.md"]
open: []
---
Host the base CV editor and coordinate saves, previews, imports, panels and enrichment.

- The CV query is keyed by the authenticated user ID, stays fresh indefinitely, and has zero cache retention after unmount. `apps/web/src/cv/CvPage.tsx:15` -> `useQuery`
- Loading and error views replace the editor; retry refetches, and the editor remounts when the user ID changes. `apps/web/src/cv/CvPage.tsx:22` -> `cv.isPending`; `apps/web/src/cv/CvPage.tsx:34` -> `cv.refetch`; `apps/web/src/cv/CvPage.tsx:39` -> `key={userId}`
- The default source loads/saves the base CV; callers can inject another source and tailored display extras. `apps/web/src/cv/Editor.tsx:38` -> `CvSource`; `apps/web/src/cv/Editor.tsx:58` -> `source = baseSource`
- Dispatch uses the latest content functionally and marks a pending save only when the reducer returns a different object. `apps/web/src/cv/Editor.tsx:76` -> `const dispatch`
- Tailored mode gives the role scorer an empty CV and removes the focus-mode opener. `apps/web/src/cv/Editor.tsx:86` -> `NO_ROLES`; `apps/web/src/cv/Editor.tsx:229` -> `isTailored ? null`
- The enrich query parameter opens the guided path only for base mode, then is removed using replace navigation. `apps/web/src/cv/Editor.tsx:96` -> `params.get`; `apps/web/src/cv/Editor.tsx:98` -> `params.has`
- Opening a base CV dispatches copied-description cleanup once; that edit goes through the normal reducer/save path. `apps/web/src/cv/Editor.tsx:119` -> `useEffect`
- A restore submits the current version; its conflict enters autosave conflict handling, while other failures set a restore warning. `apps/web/src/cv/Editor.tsx:148` -> `restoreHistory`
- After a successful restore the editor reloads the CV and clears opened sections; a failed reload reports the restored version as a conflict. `apps/web/src/cv/Editor.tsx:156` -> `autosave.reset`
- History uses the read-only document, while the tailored changes toggle selects marked read-only output instead of the editable page. `apps/web/src/cv/Editor.tsx:215` -> `historyOpen`
- Imports and enrichment cover the workspace with inert controls; history makes the page inert while leaving its panel usable. `apps/web/src/cv/Editor.tsx:224` -> `inert=`; `apps/web/src/cv/Editor.tsx:248` -> `inert={dialogOpen}`
- History restore and import apply are enabled only at saved status; applying an import resets autosave and opened sections. `apps/web/src/cv/Editor.tsx:252` -> `canRestore`; `apps/web/src/cv/Editor.tsx:283` -> `canApply`
- tested by `apps/web/src/cv/editor.test.tsx:61` -> `describe("CV editor"`

## Connections

- Used by the /cv browser route: `apps/web/src/router.tsx:18` -> `path: "/cv"`; `apps/web/src/cv/CvPage.tsx:18` -> `CvPage`
- Uses autosave and a save-completion gate before enrichment: `apps/web/src/cv/Editor.tsx:60` -> `useAutosave`; `apps/web/src/cv/useAutosave.ts:28` -> `useAutosave`; `apps/web/src/cv/Editor.tsx:75` -> `useWaitForSave`; `apps/web/src/cv/useAutosave.ts:212` -> `useWaitForSave`
- Used by tailored CVs through injected source/display props: `apps/web/src/tailor/TailoredCvPage.tsx:182` -> `<Editor`; `apps/web/src/cv/Editor.tsx:58` -> `Editor`
- Uses enrichment components across the web-enrich boundary: `apps/web/src/cv/Editor.tsx:267` -> `<EnrichPath`; `apps/web/src/cv/enrich/EnrichPath.tsx:61` -> `EnrichPath`; `apps/web/src/cv/Editor.tsx:270` -> `<FocusMode`; `apps/web/src/cv/enrich/FocusMode.tsx:86` -> `FocusMode`
- Uses global .editor-workspace and .stage for layout; mobile switching must agree with the 899px CSS breakpoint: `apps/web/src/cv/Editor.tsx:91` -> `899px`; `apps/web/src/styles/editor.css:86` -> `899px`; `apps/web/src/cv/Editor.tsx:230` -> `editor-workspace`; `apps/web/src/styles/editor.css:47` -> `.editor-workspace`; `apps/web/src/cv/Editor.tsx:231` -> `className="stage"`; `apps/web/src/styles/editor.css:48` -> `.stage`
- Uses global .save-status and .editor-page: `apps/web/src/cv/Editor.tsx:182` -> `save-status`; `apps/web/src/styles/editor.css:1` -> `.save-status`; `apps/web/src/cv/Editor.tsx:248` -> `editor-page`; `apps/web/src/styles/editor.css:50` -> `.editor-page`
- Uses global loading/error classes: `apps/web/src/cv/CvPage.tsx:25` -> `page-loading`; `apps/web/src/styles/app.css:132` -> `.page-loading`; `apps/web/src/cv/CvPage.tsx:32` -> `page-error`; `apps/web/src/styles/app.css:145` -> `.page-error`

## Assumptions

- Account separation relies on the auth session supplying a stable ID and the API returning that user's CV. `apps/web/src/cv/CvPage.tsx:14` -> `session?.user.id`; `apps/web/src/cv/cv-api.ts:15` -> `apiFetch`
- Only one current Editor is expected to own the global unsaved flag. `apps/web/src/cv/Editor.tsx:60` -> `useAutosave`; `apps/web/src/cv/unsaved.ts:5` -> `let unsaved`

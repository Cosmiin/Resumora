---
id: web-tailor/export-menu
area: web-tailor
files: ["apps/web/src/export/ExportMenu.tsx","apps/web/src/export/export.test.tsx","apps/web/src/tailor/guided-review.test.tsx"]
depends_on: ["web-tailor/export-files","web-tailor/guided-review","web-tailor/page"]
contract: false
checked_hash: e8a1a3b7
decisions: []
open: []
---
Offer four file exports with advisory guess and length warnings.

- Choices are CV PDF, CV DOCX, letter PDF and letter DOCX. `apps/web/src/export/ExportMenu.tsx:18` -> `CHOICES`
- Opening clears the old row, sets loading and calls load; load failure has a separate loadError state. `apps/web/src/export/ExportMenu.tsx:32` -> `toggle`
- startOpen is honored once per component instance using an opened ref. `apps/web/src/export/ExportMenu.tsx:58` -> `opened`
- Export uses the row captured when the menu opened, guards against duplicate busy calls, and resets the previous length warning. `apps/web/src/export/ExportMenu.tsx:45` -> `run`
- Unreviewed guesses show an advisory warning and optional Review button; file choices remain usable. `apps/web/src/export/ExportMenu.tsx:75` -> `unreviewed.length`
- Letter choices disable when the loaded row has no coverLetter, and all choices disable during export. `apps/web/src/export/ExportMenu.tsx:85` -> `disabled`
- After download, fits:false shows the measured page count; export failures show a generic error. `apps/web/src/export/ExportMenu.tsx:50` -> `exportFile`; `apps/web/src/export/ExportMenu.tsx:90` -> `tooLong`
- tested by `apps/web/src/export/export.test.tsx:34` -> `describe`
- tested by `apps/web/src/tailor/guided-review.test.tsx:98` -> `it`

## Connections

- Uses exportFile and unreviewedItems. `apps/web/src/export/ExportMenu.tsx:50` -> `exportFile`; `apps/web/src/export/export-files.ts:74` -> `exportFile`; `apps/web/src/export/ExportMenu.tsx:65` -> `unreviewedItems`; `apps/web/src/export/export-files.ts:17` -> `unreviewedItems`
- Uses global tailored-menu-pop, export-warning and export-choices styling. `apps/web/src/export/ExportMenu.tsx:70` -> `tailored-menu-pop`; `apps/web/src/styles/tailor.css:149` -> `.tailored-menu-pop`; `apps/web/src/export/ExportMenu.tsx:76` -> `export-warning`; `apps/web/src/styles/tailor.css:155` -> `.export-warning`; `apps/web/src/export/ExportMenu.tsx:83` -> `export-choices`; `apps/web/src/styles/tailor.css:158` -> `.export-choices`

## Assumptions

- Export can omit recent edits: the page supplies a saved-content loader without awaiting editor autosave, opening captures its result, and download reuses that row even if saves complete afterward. `apps/web/src/tailor/TailoredCvPage.tsx:150` -> `ExportMenu`; `apps/web/src/export/ExportMenu.tsx:38` -> `load`; `apps/web/src/export/ExportMenu.tsx:50` -> `exportFile`

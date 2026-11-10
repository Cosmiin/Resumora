---
id: web-tailor/export-menu
area: web-tailor
files: ["apps/web/src/export/ExportMenu.tsx","apps/web/src/export/export.test.tsx","apps/web/src/tailor/guided-review.test.tsx"]
depends_on: ["web-tailor/export-files","web-tailor/guided-review","web-tailor/page"]
contract: false
checked_hash: e8a1a3b7
cited: [12a958, 5c9e5d, ca37fc, 8d1824, 0e85db, b65c71, c9b243, 4139c5, de3cfd, 43f448, c9b243, 3da34d, 4869c2, b95b6e, b2498b, 87a81b, 70ee8c, 1a82b1, 7178ab, 0cca05, 96bfc3, ff3b81, c9b243]
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

- Uses exportFile and unreviewedItems. `apps/web/src/export/ExportMenu.tsx:50` -> `exportFile`; `apps/web/src/export/export-files.ts:74` -> `exportFile`; `apps/web/src/export/ExportMenu.tsx:65` -> `unreviewedItems`; `apps/web/src/export/export-files.ts:18` -> `unreviewedItems`
- Uses global tailored-menu-pop, export-warning and export-choices styling. `apps/web/src/export/ExportMenu.tsx:70` -> `tailored-menu-pop`; `apps/web/src/styles/tailor.css:149` -> `.tailored-menu-pop`; `apps/web/src/export/ExportMenu.tsx:76` -> `export-warning`; `apps/web/src/styles/tailor.css:155` -> `.export-warning`; `apps/web/src/export/ExportMenu.tsx:83` -> `export-choices`; `apps/web/src/styles/tailor.css:158` -> `.export-choices`

## Assumptions

- Export can omit recent edits: the page supplies a saved-content loader without awaiting editor autosave, opening captures its result, and download reuses that row even if saves complete afterward. `apps/web/src/tailor/TailoredCvPage.tsx:150` -> `ExportMenu`; `apps/web/src/export/ExportMenu.tsx:38` -> `load`; `apps/web/src/export/ExportMenu.tsx:50` -> `exportFile`

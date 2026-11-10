---
id: web-tailor/page
area: web-tailor
files: ["apps/web/src/tailor/TailoredCvPage.tsx","apps/web/src/tailor/tailored-page.test.tsx","apps/web/src/tailor/retailor.test.tsx"]
depends_on: ["web-tailor/client-document","web-tailor/client-actions","web-tailor/client-run","web-tailor/flow-state","web-tailor/toolbar","web-tailor/translation","web-tailor/retailor","web-tailor/guided-review","web-tailor/cover-letter","web-tailor/export-menu","web-editor/page","web-editor/autosave"]
contract: false
checked_hash: 0ec7fe3f
cited: [66aed1, 0ee629, f516cb, eead4b, b15f7c, e82eb1, f62277, aa0882, 647798, 8a2d30, 30139c, 4db614, 9bfb30, aaabc9, 8722ab, b33496, 8208be, d904d0, e818a0, 93212c, a7904e, 2f9f49, fcf480, ae2767, 404b21, 6cd8ea, f7b460, b603b9, 96bfc3, ff3b81, 66aed1, d7e916]
decisions: []
open: []
---
Load a language copy and integrate tailored editing, review and document actions.

- Document query identity includes userId, jobId and requested cv id; selection prefers that id, then an untranslated original, then the first listed copy. `apps/web/src/tailor/TailoredCvPage.tsx:58` -> `queryKey`
- Document data remains fresh indefinitely while mounted, with gcTime zero. `apps/web/src/tailor/TailoredCvPage.tsx:64` -> `staleTime`
- Initial URL state supports tab=letter, review=1, export=1 and retailor=1. `apps/web/src/tailor/TailoredCvPage.tsx:69` -> `search.get`; `apps/web/src/tailor/TailoredCvPage.tsx:88` -> `search.get`
- The Editor source wraps getTailored into content/version/updatedAt and delegates saves to saveTailored with the starting version. `apps/web/src/tailor/TailoredCvPage.tsx:49` -> `asResponse`; `apps/web/src/tailor/TailoredCvPage.tsx:79` -> `source`
- reviewMarks marks only kept items, maps new-skill names case-insensitively to technical/professional skill ids, and marks unreviewed inferred items separately. `apps/web/src/tailor/TailoredCvPage.tsx:28` -> `skillIds`; `apps/web/src/tailor/TailoredCvPage.tsx:33` -> `item?.kept`
- Section actions map volunteering to projects and awards to achievements; unsupported SectionKeys get no action. `apps/web/src/tailor/TailoredCvPage.tsx:44` -> `TAILOR_SECTION_OF`; `apps/web/src/tailor/TailoredCvPage.tsx:171` -> `sectionAction`
- Template picks update immediately, save serially, and only the newest failed pick rolls back to the last successful template for that document. `apps/web/src/tailor/TailoredCvPage.tsx:98` -> `pickTemplate`
- Re-tailoring remembers the returned run before navigating; failure resets busy/error and opens the section dialog. `apps/web/src/tailor/TailoredCvPage.tsx:112` -> `startRetailor`
- The job-change notice requires editedByUser and job.updatedAt newer than CV.createdAt, not CV.updatedAt. `apps/web/src/tailor/TailoredCvPage.tsx:141` -> `jobChanged`
- The toolbar prefers this document's score over the job's latest tailored score. `apps/web/src/tailor/TailoredCvPage.tsx:146` -> `latest`
- Closing guided review refetches the row; exporting also changes the export key to remount the menu open. `apps/web/src/tailor/TailoredCvPage.tsx:165` -> `closeGuide`
- Editor is keyed by document id/version and receives tailored mode, baseSnapshot and optional replacement review/letter page. `apps/web/src/tailor/TailoredCvPage.tsx:183` -> `key`; `apps/web/src/tailor/TailoredCvPage.tsx:194` -> `replacePage`
- Per-document letter overrides are tied to the loaded row's updatedAt so refreshed rows can replace them. `apps/web/src/tailor/TailoredCvPage.tsx:196` -> `pickLetter`
- tested by `apps/web/src/tailor/tailored-page.test.tsx:74` -> `describe`
- tested by `apps/web/src/tailor/retailor.test.tsx:56` -> `describe`

## Connections

- Used by /jobs/:id/cv and uses Editor's source-injected autosave. `apps/web/src/router.tsx:22` -> `TailoredCvPage`; `apps/web/src/tailor/TailoredCvPage.tsx:52` -> `TailoredCvPage`; `apps/web/src/tailor/TailoredCvPage.tsx:185` -> `source`; `apps/web/src/cv/Editor.tsx:60` -> `useAutosave`
- Uses global tailored-notice and tailored-redo classes for changed-job and per-section actions. `apps/web/src/tailor/TailoredCvPage.tsx:155` -> `tailored-notice`; `apps/web/src/styles/tailor.css:139` -> `.tailored-notice`; `apps/web/src/tailor/TailoredCvPage.tsx:176` -> `tailored-redo`; `apps/web/src/styles/tailor.css:141` -> `.tailored-redo`
- Uses ExportMenu with a fresh server load callback, not Editor's unsaved content. `apps/web/src/tailor/TailoredCvPage.tsx:150` -> `ExportMenu`; `apps/web/src/export/ExportMenu.tsx:38` -> `load`

## Assumptions

- Browser query separation is not authorization; getTailored still relies on the user-scoped server repository. `apps/web/src/tailor/TailoredCvPage.tsx:58` -> `userId`; `apps/api/src/app.ts:116` -> `c.get`

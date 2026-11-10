---
id: web-app/import-summary
area: web-app
files: ["apps/web/src/imports/ImportSummary.tsx","apps/web/src/imports/imports.test.tsx"]
depends_on: ["web-app/import-headings","web-app/i18n","shared/categories","shared/imports","web-app/styles-import"]
contract: false
checked_hash: 4e8ba9a9
cited: [990f4c, 33b978, ab0511, 0d823a, 5da833, 4b561a, b7adb3, f1cc1f, 02b40e, b42e7f, 67ab9a, dee9ca, d70832, 4d1320, 72b049, 4b561a]
decisions: []
open: []
---
Summarize imported content and show warnings before application.

- SCAN_WARNING is removed from the generic warnings array, while isScan controls a separate scan alert. `apps/web/src/imports/ImportSummary.tsx:15` -> `SCAN_WARNING`; `apps/web/src/imports/ImportSummary.tsx:40` -> `isScan`
- Missing-category flags are deduplicated by key. `apps/web/src/imports/ImportSummary.tsx:16` -> `findIndex`
- The skills total adds technical, professional and unclear groups without merging their stored lists. `apps/web/src/imports/ImportSummary.tsx:17` -> `unclearSkills`
- Section count includes nonblank summary, experience, education, skills, languages, certifications, projects and each custom entry with title or details; achievements and other newer sections are not included in this calculation. `apps/web/src/imports/ImportSummary.tsx:20` -> `sections`
- Missing-category names use the CV locale while explanatory category why text comes directly from shared metadata. `apps/web/src/imports/ImportSummary.tsx:47` -> `CATEGORY[f.key]`
- Unsourced lines and unclear skill names appear as text lists; generic warnings choose singular/plural keys based on count. `apps/web/src/imports/ImportSummary.tsx:54` -> `unsourcedLines.map`; `apps/web/src/imports/ImportSummary.tsx:61` -> `unsorted.map`; `apps/web/src/imports/ImportSummary.tsx:68` -> `warnings.length === 1`
- Apply is disabled for unsaved editor state or an in-flight application. `apps/web/src/imports/ImportSummary.tsx:74` -> `!canApply || applying`
- tested by `apps/web/src/imports/imports.test.tsx:401` -> `scan warning once`
## Connections
- Used by the import review: `apps/web/src/imports/ImportScreen.tsx:140` -> `ImportSummary`; `apps/web/src/imports/ImportSummary.tsx:6` -> `ImportSummary`
- Uses HeadingMap and forwards the move callback: `apps/web/src/imports/ImportSummary.tsx:42` -> `HeadingMap`; `apps/web/src/imports/HeadingMap.tsx:20` -> `HeadingMap`
## Assumptions
- Categories and locale must be valid for direct label lookup; there is no local fallback for missing category metadata. `apps/web/src/imports/ImportSummary.tsx:47` -> `label[cv.locale]`

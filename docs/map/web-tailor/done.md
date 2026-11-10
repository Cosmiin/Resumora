---
id: web-tailor/done
area: web-tailor
files: ["apps/web/src/tailor/DoneScreen.tsx","apps/web/src/tailor/done-screen.test.tsx"]
depends_on: ["web-tailor/moment","web-tailor/role-done","web-tailor/client-document","web-tailor/export-files","web-tailor/page"]
contract: false
checked_hash: 3ceb6b88
decisions: []
open: []
---
Summarize completed tailoring and link to review, files or the cover letter.

- Now-met requirements must have r<number> refs and change specifically from missing/partial to met; names are deduplicated. `apps/web/src/tailor/DoneScreen.tsx:18` -> `before !==`
- Must-have totals come from job requirements; absent final labels count as open, and jobs with no must-haves omit the summary. `apps/web/src/tailor/DoneScreen.tsx:27` -> `musts`
- Unchecked guesses are fetched from the tailored document; failed reads are silently ignored, leaving the count unchanged. `apps/web/src/tailor/DoneScreen.tsx:38` -> `unchecked`; `apps/web/src/tailor/DoneScreen.tsx:42` -> `getTailored`
- The target CV id is preserved as ?cv; additional review/export/tab parameters use & when that id exists. `apps/web/src/tailor/DoneScreen.tsx:46` -> `page`
- The review card appears only for unchecked > 0; links open review=1, export=1 or tab=letter. `apps/web/src/tailor/DoneScreen.tsx:59` -> `unchecked > 0`; `apps/web/src/tailor/DoneScreen.tsx:65` -> `export=1`
- tested by `apps/web/src/tailor/done-screen.test.tsx:35` -> `describe`

## Connections

- Uses the same unreviewed-item predicate as export warnings. `apps/web/src/tailor/DoneScreen.tsx:42` -> `unreviewedItems`; `apps/web/src/export/export-files.ts:17` -> `unreviewedItems`
- Links are consumed by TailoredCvPage's initial query-parameter state. `apps/web/src/tailor/DoneScreen.tsx:61` -> `review=1`; `apps/web/src/tailor/TailoredCvPage.tsx:71` -> `search.get`
- Uses global tailor-done-check and tailor-done-next layouts. `apps/web/src/tailor/DoneScreen.tsx:59` -> `tailor-done-check`; `apps/web/src/styles/tailor.css:166` -> `.tailor-done-check`; `apps/web/src/tailor/DoneScreen.tsx:63` -> `tailor-done-next`; `apps/web/src/styles/tailor.css:168` -> `.tailor-done-next`

## Assumptions

- The displayed scores are passed in by the flow, while the unchecked count is a separate document read; failure of that read does not prevent completion links. `apps/web/src/tailor/DoneScreen.tsx:37` -> `base, final`; `apps/web/src/tailor/DoneScreen.tsx:42` -> `getTailored`

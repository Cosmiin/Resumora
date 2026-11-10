---
id: web-tailor/fit
area: web-tailor
files: ["apps/web/src/export/fit.ts","apps/web/src/export/fit.test.ts","apps/web/src/export/pdf.test.tsx"]
depends_on: ["web-editor/templates","web-tailor/pdf","web-tailor/docx","web-tailor/export-files"]
contract: false
checked_hash: dda9cff4
cited: [18c71d, 83761a, 73248c, 2677da, c993cf, d41f27, fea170, 2e9e86, 18c71d, 73248c, 014661, 70bd25, 2d3981, cd291d, 80e986, 014661, 317494, 006b92, 6ed3f8, e14838, 83761a, 2d3981, 2a03c3, 2677da]
decisions: []
open: []
---
Try progressively tighter layouts without removing CV content.

- Classic/modern start at 11pt with a 10pt minimum; compact starts at 10pt with 9.5pt minimum. These are local FONT values, not shared schema limits. `apps/web/src/export/fit.ts:7` -> `FONT`
- fitSteps normalizes template through getTemplate, tries normal spacing first, then tight spacing at the same size and 0.5pt decrements. `apps/web/src/export/fit.ts:14` -> `fitSteps`
- fitToPages renders sequentially and stops at the first result whose pages <= maxPages. `apps/web/src/export/fit.ts:28` -> `for`
- When no layout fits, the last rendered result returns with fits=false; empty steps throw. `apps/web/src/export/fit.ts:30` -> `last`; `apps/web/src/export/fit.ts:33` -> `throw`
- pdfPageCount decodes bytes as latin1 and counts /Type /Page objects while excluding alphabetic continuations such as /Pages. `apps/web/src/export/fit.ts:38` -> `pdfPageCount`
- tested by `apps/web/src/export/fit.test.ts:4` -> `describe`
- tested by `apps/web/src/export/pdf.test.tsx:246` -> `describe`

## Connections

- Two pages is advisory: after spacing and font reductions reach the last candidate, export still downloads it when fits is false; DOCX reuses that PDF-selected step and reports PDF pages/fits without measuring Word pagination. `apps/web/src/export/fit.ts:7` -> `FONT`; `apps/web/src/export/fit.ts:28` -> `for`; `apps/web/src/export/pdf.tsx:23` -> `MAX_PAGES`; `apps/web/src/export/export-files.ts:85` -> `fitCvPdf`; `apps/web/src/export/export-files.ts:88` -> `fitted.step`; `apps/web/src/export/export-files.ts:89` -> `save`; `apps/web/src/export/export-files.ts:90` -> `fitted.pages`

- Used by fitCvPdf with local MAX_PAGES=2; PDF builds the candidates and measures each emitted blob. `apps/web/src/export/pdf.tsx:23` -> `MAX_PAGES`; `apps/web/src/export/pdf.tsx:153` -> `fitToPages`; `apps/web/src/export/fit.ts:22` -> `fitToPages`
- Used by both builders for default first-step sizing; the DOCX export path instead receives the fitted PDF step. `apps/web/src/export/pdf.tsx:30` -> `fitSteps`; `apps/web/src/export/docx.ts:66` -> `fitSteps`; `apps/web/src/export/fit.ts:14` -> `fitSteps`; `apps/web/src/export/export-files.ts:88` -> `fitted.step`

## Assumptions

- Counting assumes page objects are visible in the PDF byte stream; compressed object streams or an unmatched format could return zero and be treated as fitting. `apps/web/src/export/fit.ts:40` -> `?? 0`; `apps/web/src/export/fit.ts:30` -> `pages <= maxPages`

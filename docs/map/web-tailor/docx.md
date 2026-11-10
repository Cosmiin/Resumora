---
id: web-tailor/docx
area: web-tailor
files: ["apps/web/src/export/docx.ts","apps/web/src/export/docx.test.ts"]
depends_on: ["shared/cv","shared/categories","shared/dates","web-editor/templates","web-editor/document","web-tailor/fit","web-tailor/pdf","shared/stored-cv"]
contract: true
checked_hash: c5245ae5
cited: [048b85, 895e8c, c4ca32, 61ebcc, 502fc9, 8a0adb, 78b80b, 15257f, 17a053, 629fc4, aad6e5, 55c3fe, 110546, 5d3ac5, 97dcd4, a2f028, 2e6549, acdd49, 59e5ca, db33fb, fdea82, aac19d, 5ecd2f, ec3875, 98edf4, 6cf6c8, 2d3981, 2092c1, f31dae, 5f5c3a, 110546, 0f7dc9, 59e5ca, faf887, b17465, db6671, 12176c]
decisions: []
open: []
---
Build Word documents with explicit paragraph sections and PDF-selected fit settings.

- Exports LetterDocxInput, ExportPhoto and LetterHeader types, also used by PDF/export orchestration. `apps/web/src/export/docx.ts:9` -> `LetterDocxInput`
- Classic uses Georgia, modern/compact Arial; modern heading accent is blue, unlike the PDF's green. `apps/web/src/export/docx.ts:19` -> `STYLES`; `apps/web/src/export/pdf.tsx:14` -> `accent`
- Page dimensions are 11906 by 16838 twips; normal margins are 1134 and tight margins 794. `apps/web/src/export/docx.ts:31` -> `PAGE`
- paragraph converts all CRLF/CR/LF forms into separate TextRuns with explicit line breaks. `apps/web/src/export/docx.ts:35` -> `paragraph`
- pack sets default font/spacing and keepNext on headings, then serializes with Packer.toBlob. `apps/web/src/export/docx.ts:44` -> `Packer.toBlob`; `apps/web/src/export/docx.ts:54` -> `keepNext`
- Hidden items are removed first; photos require a declared photo slot and non-WebP bytes. PNG dimensions come from header offsets, JPEG dimensions from marker scanning. `apps/web/src/export/docx.ts:69` -> `withoutHidden`; `apps/web/src/export/docx.ts:73` -> `photo !== null`; `apps/web/src/export/docx.ts:78` -> `png`; `apps/web/src/export/docx.ts:82` -> `offset`
- Photo dimensions scale proportionally to a maximum 96-pixel square. `apps/web/src/export/docx.ts:94` -> `scale`
- Sections is exhaustive Record<SectionKey,Paragraph[]>; skill output uses technical and professional groups separately, excluding unclearSkills. `apps/web/src/export/docx.ts:123` -> `Record<SectionKey`; `apps/web/src/export/docx.ts:131` -> `skills`
- Role-shaped content includes project links, localized ranges and list bullets; lighter-section blank lines are omitted and interests switch between joined and per-entry forms. `apps/web/src/export/docx.ts:111` -> `lines`; `apps/web/src/export/docx.ts:115` -> `roles`; `apps/web/src/export/docx.ts:144` -> `interests`
- Normalized layout controls order, hidden sections and custom/localized headings; other emits only individual custom headings. `apps/web/src/export/docx.ts:147` -> `other`; `apps/web/src/export/docx.ts:150` -> `normalizeLayout`
- FitStep applies tight spacing/page margins and rounds fontSize*2 to Word half-points; no Word page count is measured. `apps/web/src/export/docx.ts:156` -> `style`
- Letters use default classic packing and assemble name, contact, localized date, company/role recipient, greeting, paragraphs, sign-off and name; no template or FitStep is accepted. `apps/web/src/export/docx.ts:162` -> `buildLetterDocx`; `apps/web/src/export/docx.ts:168` -> `recipient`; `apps/web/src/export/docx.ts:175` -> `letter.paragraphs`
- tested by `apps/web/src/export/docx.test.ts:61` -> `describe`
- tested by `apps/web/src/export/docx.test.ts:176` -> `describe`
- tested by `apps/web/src/export/docx.test.ts:212` -> `describe`

## Connections

- Used by exportFile with the step chosen by PDF fitting; actual Word pagination remains independent. `apps/web/src/export/export-files.ts:88` -> `buildCvDocx`; `apps/web/src/export/docx.ts:62` -> `buildCvDocx`
- Uses getTemplate and parallel PDF section coverage. `apps/web/src/export/docx.ts:70` -> `getTemplate`; `apps/web/src/cv/page/templates.ts:9` -> `getTemplate`; `apps/web/src/export/docx.ts:123` -> `Record<SectionKey`; `apps/web/src/export/pdf.tsx:82` -> `Record<SectionKey`

- Uses normalizeLayout to keep the first occurrence of known ordered keys, append missing keys in category order, deduplicate/filter hidden keys and discard blank titles. `apps/web/src/export/docx.ts:150` -> `normalizeLayout`; `packages/shared/src/upgrade.ts:24` -> `normalizeLayout`; `packages/shared/src/upgrade.ts:33` -> `hidden`

## Assumptions

- Photo bytes are assumed to contain readable image headers; PNG DataView reads are not wrapped locally, so malformed bytes can fail export after download succeeds. `apps/web/src/export/docx.ts:75` -> `DataView`; `apps/web/src/export/docx.ts:79` -> `getUint32`

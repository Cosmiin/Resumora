---
id: web-tailor/file-name
area: web-tailor
files: ["apps/web/src/export/file-name.ts","apps/web/src/export/file-name.test.ts"]
depends_on: []
contract: false
checked_hash: a76d0ea3
cited: [e86d21, 348e0b, 4ccebc, 78e72c, 8575e9, 65c7f7, 127ca6, f63335, 07ae51, cd291d, be43a3, f8ec43, 127ca6]
decisions: []
open: []
---
Produce portable PDF and DOCX filenames from name, company and role.

- Parts are processed in name, company, role order. `apps/web/src/export/file-name.ts:7` -> `[name, company, role]`
- NFD normalization and removal of combining marks transliterate supported accented characters. `apps/web/src/export/file-name.ts:9` -> `normalize`
- Whitespace becomes underscores, and remaining non-ASCII-letter/digit/underscore characters are deleted. `apps/web/src/export/file-name.ts:11` -> `replace`
- Repeated/edge underscores are removed per part; cleaned empty parts are dropped before joining. `apps/web/src/export/file-name.ts:13` -> `replace`; `apps/web/src/export/file-name.ts:15` -> `filter(Boolean)`
- If all parts clean to empty, the basename is CV; the typed extension is pdf or docx. `apps/web/src/export/file-name.ts:5` -> `ext`; `apps/web/src/export/file-name.ts:18` -> `base ||`
- tested by `apps/web/src/export/file-name.test.ts:4` -> `describe`

## Connections

- Used for both CV and letter downloads; letter naming adds a fixed English Cover letter suffix before cleaning. `apps/web/src/export/export-files.ts:81` -> `exportFileName`; `apps/web/src/export/export-files.ts:89` -> `exportFileName`; `apps/web/src/export/file-name.ts:1` -> `exportFileName`

## Assumptions

- Sanitization can collapse different inputs to the same filename; the helper adds no unique suffix. `apps/web/src/export/file-name.ts:12` -> `replace`; `apps/web/src/export/file-name.ts:18` -> `return`

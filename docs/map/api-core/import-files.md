---
id: api-core/import-files
area: api-core
files: ["apps/api/src/imports/extract-text.ts","apps/api/test/extract-text.test.ts","apps/api/test/fixtures.ts"]
depends_on: ["api-core/config"]
contract: false
checked_hash: 6eec63fd
decisions: ["docs/decisions/0010-cv-files-go-to-the-model-as-files.md"]
open: []
---
Recognize uploads and extract bounded text while distinguishing scans from empty Word files.

- Format sniffing uses PDF magic or ZIP local-header bytes; it does not inspect filename or verify that ZIP content is DOCX. `apps/api/src/imports/extract-text.ts:34` -> `sniffFormat`
- Limits are eight PDF pages, 200 nonspace characters for usable text, and 30,000 normalized characters. `apps/api/src/imports/extract-text.ts:26` -> `MAX_PAGES`, `apps/api/src/imports/extract-text.ts:28` -> `MIN_TEXT_CHARS`, `apps/api/src/imports/extract-text.ts:31` -> `MAX_TEXT_CHARS`
- PDF extraction skips text reading if page count already exceeds the limit; DOCX uses both Buffer and arrayBuffer inputs for mammoth's different builds. `apps/api/src/imports/extract-text.ts:55` -> `getDocumentProxy`, `apps/api/src/imports/extract-text.ts:61` -> `input`
- Normalization keeps line boundaries while collapsing spaces and repeated blank lines. `apps/api/src/imports/extract-text.ts:42` -> `normalize`
- Parser errors become unreadable_file; too little PDF text becomes isScan:true, while too little Word text throws no_text. `apps/api/src/imports/extract-text.ts:73` -> `rawText`, `apps/api/src/imports/extract-text.ts:79` -> `MIN_TEXT_CHARS`
- tested by `apps/api/test/extract-text.test.ts:23` -> `sniffFormat`, `apps/api/test/extract-text.test.ts:36` -> `extractText`
- Shared generated test input is tested by `apps/api/test/fixtures.ts:4` -> `makePdf`, `apps/api/test/fixtures.ts:29` -> `makeDocx`; its extraction consumers are tested by `apps/api/test/extract-text.test.ts:4` -> `fixtures.ts`, `apps/api/test/process.test.ts:7` -> `fixtures.ts`, `apps/api/test/imports.test.ts:10` -> `fixtures.ts`, `apps/api/test/supabase-repo.test.ts:9` -> `fixtures.ts`.

## Connections
- Upload sniff caller: `apps/api/src/imports/routes.ts:36` -> `sniffFormat` -> `apps/api/src/imports/extract-text.ts:34` -> `sniffFormat`.
- Pipeline reads text before admission: `apps/api/src/imports/process.ts:44` -> `extractText` -> `apps/api/src/imports/extract-text.ts:67` -> `extractText`.
- Worker dependencies and Node compatibility support extraction: `apps/api/src/imports/extract-text.ts:1` -> `unpdf` -> `apps/api/package.json:21` -> `unpdf`; `apps/api/src/imports/extract-text.ts:2` -> `mammoth` -> `apps/api/package.json:20` -> `mammoth`; `apps/api/src/imports/extract-text.ts:61` -> `Buffer.from` -> `apps/api/wrangler.jsonc:5` -> `nodejs_compat`.

## Assumptions
- DOCX is assigned one page without layout pagination, so the page cap only meaningfully limits PDFs. `apps/api/src/imports/extract-text.ts:63` -> `pages: 1`
- A short PDF is treated as a scan even when it is simply sparse text; the downstream model decides whether it is a CV. `apps/api/src/imports/extract-text.ts:80` -> `isScan: true`

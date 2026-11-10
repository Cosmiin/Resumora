---
id: api-core/import-eval-generation
area: api-core
files: ["apps/api/eval/import/generate.ts","apps/api/eval/import/render.ts","apps/api/eval/import/styles.ts","apps/api/eval/import/types.ts","apps/api/eval/import/templates/docx-tables.ts","apps/api/test/eval-cases.test.ts"]
depends_on: ["api-core/import-eval","shared/categories"]
contract: false
checked_hash: 09f1ba76
decisions: []
open: []
---
Generate synthetic PDFs, Word input and answer keys from common case definitions.

- ROOT is resolved from process.cwd(), so generation expects the API package working directory; CHROME_PATH overrides the browser executable. `apps/api/eval/import/generate.ts:18` -> `ROOT`
- The scan case copies case04, and the complete list has twelve cases; answer keys and rendered files share the same case content. `apps/api/eval/import/generate.ts:22` -> `SCAN_CASE`, `apps/api/eval/import/generate.ts:35` -> `key`
- PDF generation writes HTML templates, invokes headless Chrome, then checks file existence and any expected page count. `apps/api/eval/import/generate.ts:40` -> `templates`
- Scan generation screenshots the readable case and embeds the PNG into a PDF without adding text. `apps/api/eval/import/generate.ts:54` -> `renderHtml(case04)`, `apps/api/eval/import/generate.ts:59` -> `embedPng`
- Generation writes answer keys before files and removes its temporary directory in finally. `apps/api/eval/import/generate.ts:69` -> `writeKey`, `apps/api/eval/import/generate.ts:76` -> `finally`
- HTML content escapes ampersands and angle brackets; DOCX variants throw if routed through layoutHtml. `apps/api/eval/import/render.ts:6` -> `esc`, `apps/api/eval/import/render.ts:131` -> `case "docx"`
- Print styles use A4, fourteen-millimeter base margins and avoid breaking items; sidebar rendering overrides page margins to zero. `apps/api/eval/import/styles.ts:3` -> `@page`, `apps/api/eval/import/styles.ts:15` -> `break-inside`, `apps/api/eval/import/render.ts:140` -> `margin: 0`
- Fixture builders default missing lists and maintain three skill groups; printed skills are interleaved round-robin. `apps/api/eval/import/types.ts:83` -> `experience`, `apps/api/eval/import/types.ts:108` -> `mixedSkills`
- Expected flags are derived from declared section categories plus required name/contact fields, rather than runtime missingCategories. `apps/api/eval/import/types.ts:116` -> `expectedFlags`
- DOCX rendering handles summary, experience, skills, education, languages and certifications; unsupported section categories throw. Skills use mixedSkills, and dates use locale-aware formatting helpers. `apps/api/eval/import/templates/docx-tables.ts:18` -> `body`, `apps/api/eval/import/templates/docx-tables.ts:27` -> `fmtRange`, `apps/api/eval/import/templates/docx-tables.ts:32` -> `mixedSkills`, `apps/api/eval/import/templates/docx-tables.ts:41` -> `fmtDate`, `apps/api/eval/import/templates/docx-tables.ts:43` -> `throw`
- buildDocx groups sections by col (default zero), places contact details in the left column, and packs a borderless table with 32/68 percent column widths into a document buffer. `apps/api/eval/import/templates/docx-tables.ts:47` -> `buildDocx`, `apps/api/eval/import/templates/docx-tables.ts:51` -> `s.col`, `apps/api/eval/import/templates/docx-tables.ts:59` -> `32`, `apps/api/eval/import/templates/docx-tables.ts:72` -> `Packer.toBuffer`
- tested by `apps/api/test/eval-cases.test.ts:19` -> `evaluation cases`

## Connections
- DOCX generation calls hand-written executable source: `apps/api/eval/import/generate.ts:71` -> `buildDocx` -> `apps/api/eval/import/templates/docx-tables.ts:47` -> `buildDocx`; section dispatch at `apps/api/eval/import/templates/docx-tables.ts:51` -> `body` -> `apps/api/eval/import/templates/docx-tables.ts:18` -> `body`.
- DOCX skill ordering shares the case helper: `apps/api/eval/import/templates/docx-tables.ts:32` -> `mixedSkills` -> `apps/api/eval/import/types.ts:108` -> `mixedSkills`.

- Package script bundles and runs generator: `apps/api/package.json:14` -> `eval:generate` -> `apps/api/eval/import/generate.ts:65` -> `try`.
- Generator uses renderer and expected-flag builder: `apps/api/eval/import/generate.ts:41` -> `renderHtml` -> `apps/api/eval/import/render.ts:136` -> `renderHtml`; `apps/api/eval/import/generate.ts:35` -> `expectedFlags` -> `apps/api/eval/import/types.ts:116` -> `expectedFlags`.
- Renderer uses styles and skill ordering: `apps/api/eval/import/render.ts:140` -> `STYLES` -> `apps/api/eval/import/styles.ts:2` -> `STYLES`; `apps/api/eval/import/render.ts:41` -> `mixedSkills` -> `apps/api/eval/import/types.ts:108` -> `mixedSkills`.
- Generated cases feed evaluator: `apps/api/eval/import/generate.ts:67` -> `cases` -> `apps/api/eval/import/run.eval.ts:13` -> `CASES`.

## Assumptions
- Local browser rendering and font availability affect generated layout; browser execution only throws on spawn error, with output existence/page count providing later checks. `apps/api/eval/import/generate.ts:26` -> `spawnSync`, `apps/api/eval/import/generate.ts:44` -> `existsSync`, `apps/api/eval/import/styles.ts:5` -> `font`
- Case data modules are excluded fixture inputs; template HTML files are rendered fixture output. The imported DOCX builder is hand-written source covered by this entry. `apps/api/eval/import/generate.ts:11` -> `data-a.ts`, `apps/api/eval/import/generate.ts:12` -> `data-b.ts`, `apps/api/eval/import/generate.ts:13` -> `data-c.ts`, `apps/api/eval/import/generate.ts:40` -> `templates`, `apps/api/eval/import/generate.ts:41` -> `writeFileSync`, `apps/api/eval/import/generate.ts:15` -> `templates/docx-tables.ts`

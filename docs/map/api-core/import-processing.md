---
id: api-core/import-processing
area: api-core
files: ["apps/api/src/imports/process.ts","apps/api/test/process.test.ts"]
depends_on: ["api-core/call-model","api-core/import-files","api-core/import-prompts","api-core/import-source-check","shared/imports","shared/cv"]
contract: false
checked_hash: 61b2114d
cited: [89dc3b, 1846b1, 7917cd, 1f1a13, 26f56c, 334ff7, 54cc5c, 546257, a4c9e9, 755fa6, bcabf8, dfa6ae, eee044, 016908, 844e13, fed5d1, 6f500b, 3805b7, ca8f94, 4a29b6, 85316d, 6fb7b5, 1762a6, 546257, f1b3f7, 66fe90, 1fee19, a6d7b9, b193c8, bcabf8]
decisions: ["docs/decisions/0004-imports-go-through-a-queue.md","docs/decisions/0010-cv-files-go-to-the-model-as-files.md"]
open: []
---
Admit a document, extract its content and attach review warnings.

- Text extraction precedes model admission; PDFs retain original bytes as a file part, while DOCX uses extracted text. `apps/api/src/imports/process.ts:44` -> `extractText`
- Admission gets at most 8,000 text characters except scanned PDFs, which send the file; not_cv fails but uncertain continues. `apps/api/src/imports/process.ts:15` -> `ADMIT_CHARS`, `apps/api/src/imports/process.ts:55` -> `isScan`, `apps/api/src/imports/process.ts:58` -> `not_cv`
- Extraction requests 16,000 output tokens and a 150-second per-attempt timeout. `apps/api/src/imports/process.ts:17` -> `EXTRACT_TIMEOUT_MS`, `apps/api/src/imports/process.ts:69` -> `maxOutputTokens`
- PDF extraction falls back to text only for AiInputRejectedError on a non-scan, appending a column-order warning. `apps/api/src/imports/process.ts:75` -> `extract`
- Conversion runs before warnings; pipeline warnings reserve space within the fifty-warning cap and extraction warnings are truncated. `apps/api/src/imports/process.ts:85` -> `toCvContent`, `apps/api/src/imports/process.ts:90` -> `MAX_WARNINGS`
- Scans set isScan and skip source checks; other files receive unsourcedLines without deleting those lines. `apps/api/src/imports/process.ts:92` -> `isScan`
- Oversized content or output truncation becomes too_long; model unavailability or rejected input becomes ai_unavailable. `apps/api/src/imports/process.ts:97` -> `MAX_CV_BYTES`, `apps/api/src/imports/process.ts:102` -> `AiOutputTooLongError`
- tested by `apps/api/test/process.test.ts:50` -> `processImport`, `apps/api/test/process.test.ts:123` -> `processImport with a PDF`

## Connections
- Queue and evaluation use the same pipeline: `apps/api/src/imports/consumer.ts:27` -> `processImport` and `apps/api/eval/import/run.eval.ts:57` -> `processImport` -> `apps/api/src/imports/process.ts:40` -> `processImport`.
- Admission/extraction prompt injection: `apps/api/src/imports/process.ts:54` -> `admitPrompt` -> `apps/api/src/imports/prompts.ts:18` -> `admitPrompt`; `apps/api/src/imports/process.ts:67` -> `extractPrompt` -> `apps/api/src/imports/prompts.ts:91` -> `extractPrompt`.
- Model output contract and conversion: `apps/api/src/imports/process.ts:66` -> `ImportDraftSchema` -> `packages/shared/src/imports.ts:39` -> `ImportDraftSchema`; `apps/api/src/imports/process.ts:85` -> `toCvContent` -> `packages/shared/src/imports.ts:115` -> `toCvContent`.
- Source checker: `apps/api/src/imports/process.ts:95` -> `findUnsourcedLines` -> `apps/api/src/imports/source-check.ts:76` -> `findUnsourcedLines`.

## Assumptions
- Admission is a model classification, not an independent security boundary; untrusted document instructions are handled by prompt wording. `apps/api/src/imports/process.ts:50` -> `callModel`, `apps/api/src/imports/prompts.ts:12` -> `untrusted data`
- The final size check measures serialized content alone, not the full import response with warnings/source lines. `apps/api/src/imports/process.ts:97` -> `JSON.stringify(result.content)`

---
id: api-enrich/blocks
area: api-enrich
files: ["apps/api/src/enrich/blocks.ts","apps/api/src/enrich/blocks.test.ts"]
depends_on: []
contract: true
checked_hash: 3be827f8
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Parse chunked model text into ordered proposal starts, deltas and completed blocks.

- Only complete column-zero marker lines match MARKER; a new marker closes the previous block before starting the next. `apps/api/src/enrich/blocks.ts:7` -> `MARKER`; `apps/api/src/enrich/blocks.ts:54` -> `MARKER.exec`; `apps/api/src/enrich/blocks.ts:56` -> `this.close`.
- The end key is case-insensitive; other keys are preserved and block indexes increase from zero. `apps/api/src/enrich/blocks.ts:22` -> `count = 0`; `apps/api/src/enrich/blocks.ts:58` -> `toLowerCase`; `apps/api/src/enrich/blocks.ts:59` -> `this.count++`.
- Incomplete lines that might be markers are held back; once ordinary partial text is emitted, the rest of that line cannot become a marker. `apps/api/src/enrich/blocks.ts:37` -> `this.midLine`; `apps/api/src/enrich/blocks.ts:54` -> `this.midLine`.
- Text outside open blocks is ignored; end() processes remaining text and closes the final block with trimmed content. `apps/api/src/enrich/blocks.ts:63` -> `if (this.open)`; `apps/api/src/enrich/blocks.ts:45` -> `end()`; `apps/api/src/enrich/blocks.ts:73` -> `text.trim()`.
- tested by `apps/api/src/enrich/blocks.test.ts:12` -> `BlockParser`

## Connections

- Used by rewriteEvents through push/end; completed blocks then undergo content checks before becoming ready or dropped events. `apps/api/src/enrich/rewrite.ts:53` -> `BlockParser`; `apps/api/src/enrich/rewrite.ts:75` -> `parser.push`; `apps/api/src/enrich/blocks.ts:26` -> `push`; `apps/api/src/enrich/rewrite.ts:76` -> `parser.end`; `apps/api/src/enrich/blocks.ts:45` -> `end()`; `apps/api/src/enrich/rewrite.ts:67` -> `check`.
- Implements the marker format requested by summary prompts. `apps/api/src/enrich/rewrite-prompts.ts:30` -> `### <key>`; `apps/api/src/enrich/blocks.ts:7` -> `MARKER`; `apps/api/src/enrich/rewrite-prompts.ts:32` -> `### summary`.

## Assumptions

- Keys and text are syntactic output only: semantic identity, repetition and numeric checks belong to the consumer. `apps/api/src/enrich/blocks.ts:60` -> `key`; `apps/api/src/enrich/rewrite.ts:67` -> `check`.

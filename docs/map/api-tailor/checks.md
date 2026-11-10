---
id: api-tailor/checks
area: api-tailor
files: ["apps/api/src/tailor/checks.ts","apps/api/src/tailor/checks.test.ts"]
depends_on: ["shared/enrichment-checks","shared/tailoring"]
contract: false
checked_hash: b1c7cadc
decisions: []
open: []
---
Apply local number, entity, tool-name and inference-reason checks to textual proposals.

- company/title/startDate/endDate proposals return immediately: flag changed trimmed values only when original exists, otherwise return no flags and skip other checks `apps/api/src/tailor/checks.ts:4` -> `ENTITY_FIELDS`; `apps/api/src/tailor/checks.ts:45` -> `includes(field)`; `apps/api/src/tailor/checks.ts:47` -> `before !== undefined`.
- Other fields compare numbers with the union of supplied sources via hasUnknownNumber, including normalized numeric forms and embedded digit tokens `apps/api/src/tailor/checks.ts:51` -> `hasUnknownNumber`; `packages/shared/src/enrich-checks.ts:176` -> `hasUnknownNumber`.
- Known tool tokens are case-insensitive across all sources; unknown candidates are deduplicated `apps/api/src/tailor/checks.ts:35` -> `toLowerCase`; `apps/api/src/tailor/checks.ts:36` -> `new Set`.
- Tool candidates include mixed-case names, uppercase acronyms and letter-containing tokens with punctuation/digits, plus capitalized words after the first word of a sentence `apps/api/src/tailor/checks.ts:24` -> `text.split`; `apps/api/src/tailor/checks.ts:27` -> `technical`; `apps/api/src/tailor/checks.ts:28` -> `capitalised`.
- A single-word name field checks its capitalized first word; dotted-letter abbreviations and ordinal numbers are excluded `apps/api/src/tailor/checks.ts:17` -> `NOT_TOOL`; `apps/api/src/tailor/checks.ts:26` -> `NOT_TOOL.test`; `apps/api/src/tailor/checks.ts:28` -> `nameField`; `apps/api/src/tailor/checks.ts:52` -> `proposal.field === "name"`.
- Inferred text without a nonblank reason gets guess flag; a nonblank reason is accepted without proving its basis `apps/api/src/tailor/checks.ts:54` -> `proposal.reason?.trim()`.
- tested by `apps/api/src/tailor/checks.test.ts:13` -> `checkProposal`.

## Connections

- Used by section verification and non-German cover letters `apps/api/src/tailor/section-pass.ts:206` -> `checkProposal`; `apps/api/src/tailor/letter.ts:62` -> `checkProposal`; `apps/api/src/tailor/checks.ts:43` -> `checkProposal`.
- Used by eval invented-tool checks `apps/api/eval/tailor/run.ts:73` -> `unknownTools`; `apps/api/src/tailor/checks.ts:34` -> `unknownTools`.
- Uses shared numeric checking, so changes affect tailoring, letters and translations `apps/api/src/tailor/checks.ts:51` -> `hasUnknownNumber`; `apps/api/src/tailor/letter.ts:61` -> `hasUnknownNumber`; `apps/api/src/tailor/translate.ts:83` -> `hasUnknownNumber`; `packages/shared/src/enrich-checks.ts:176` -> `hasUnknownNumber`.

## Assumptions

- Safety depends on caller-provided sources and original fields; the checker has no access to CV ownership or a canonical item `apps/api/src/tailor/checks.ts:7` -> `CheckContext`; `apps/api/src/tailor/checks.ts:46` -> `ctx.original`.
- Tool recognition is a capitalization/token heuristic; it is not a complete entity or factual-entailment check `apps/api/src/tailor/checks.ts:27` -> `technical`; `apps/api/src/tailor/checks.ts:28` -> `capitalised`.

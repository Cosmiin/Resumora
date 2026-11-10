---
id: api-tailor/checks
area: api-tailor
files: ["apps/api/src/tailor/checks.ts","apps/api/src/tailor/checks.test.ts"]
depends_on: ["shared/enrichment-checks","shared/tailoring"]
contract: false
checked_hash: 70ab0050
cited: [639452, df6a74, be7012, 1c94a7, ac9638, 773ad8, 773ad8, b72fb1, 687d6f, 6d6c65, f2dc62, 304b6a, 6d6c65, 6c6ce0, 871c42, a12bd1, d6a9e6, e1d867, e187a9, 7b0b6b, 76557b, 0bc5f8, 83d28b, f1e182, 34183f, 2a7c3c, cdf525, 1c94a7, 4fc7e7, 2a4f9f, ac9638, 37f2eb, 78100c, 687d6f, 6d6c65]
decisions: []
open: []
---
Apply local number, entity, tool-name, inference-reason and English past-role tense checks to textual proposals.

- company/title/startDate/endDate proposals return immediately: flag changed trimmed values only when original exists, otherwise return no flags and skip other checks `apps/api/src/tailor/checks.ts:4` -> `ENTITY_FIELDS`; `apps/api/src/tailor/checks.ts:47` -> `includes(field)`; `apps/api/src/tailor/checks.ts:49` -> `before !== undefined`.
- Other fields compare numbers with the union of supplied sources via hasUnknownNumber, including normalized numeric forms and embedded digit tokens `apps/api/src/tailor/checks.ts:53` -> `hasUnknownNumber`; `packages/shared/src/enrich-checks.ts:176` -> `hasUnknownNumber`.
- Known tool tokens are case-insensitive across all sources; unknown candidates are deduplicated `apps/api/src/tailor/checks.ts:37` -> `toLowerCase`; `apps/api/src/tailor/checks.ts:37` -> `new Set`.
- Tool candidates include mixed-case names, uppercase acronyms and letter-containing tokens with punctuation/digits, plus capitalized words after the first word of a sentence `apps/api/src/tailor/checks.ts:26` -> `text.split`; `apps/api/src/tailor/checks.ts:29` -> `technical`; `apps/api/src/tailor/checks.ts:30` -> `capitalised`.
- A single-word name field checks its capitalized first word; dotted-letter abbreviations and ordinal numbers are excluded `apps/api/src/tailor/checks.ts:19` -> `NOT_TOOL`; `apps/api/src/tailor/checks.ts:28` -> `NOT_TOOL.test`; `apps/api/src/tailor/checks.ts:30` -> `nameField`; `apps/api/src/tailor/checks.ts:54` -> `proposal.field === "name"`.
- Inferred text without a nonblank reason gets guess flag; a nonblank reason is accepted without proving its basis `apps/api/src/tailor/checks.ts:56` -> `proposal.reason?.trim()`.
- tested by `apps/api/src/tailor/checks.test.ts:14` -> `checkProposal`.

- Past-role text and description proposals get a tense flag when the supplied output locale is English and the opening verb is not recognised as past tense. Both pastRole and locale are optional, so sources-only callers retain their checks. `apps/api/src/tailor/checks.ts:10` -> `pastRole?`; `apps/api/src/tailor/checks.ts:11` -> `locale?`; `apps/api/src/tailor/checks.ts:58` -> `startsInPresentTense`; `apps/api/src/tailor/checks.ts:59` -> `rule: "tense"`.
- tested by `apps/api/src/tailor/checks.test.ts:17` -> `flags present tense`; `apps/api/src/tailor/checks.test.ts:27` -> `keeps sources-only checks unchanged`.

## Connections

- Used by section verification and non-German cover letters `apps/api/src/tailor/section-pass.ts:209` -> `checkProposal`; `apps/api/src/tailor/letter.ts:62` -> `checkProposal`; `apps/api/src/tailor/checks.ts:45` -> `checkProposal`.
- Used by eval invented-tool checks `apps/api/eval/tailor/run.ts:73` -> `unknownTools`; `apps/api/src/tailor/checks.ts:36` -> `unknownTools`.
- Uses shared numeric checking, so changes affect tailoring, letters and translations `apps/api/src/tailor/checks.ts:53` -> `hasUnknownNumber`; `apps/api/src/tailor/letter.ts:61` -> `hasUnknownNumber`; `apps/api/src/tailor/translate.ts:83` -> `hasUnknownNumber`; `packages/shared/src/enrich-checks.ts:176` -> `hasUnknownNumber`.

## Assumptions

- Safety depends on caller-provided sources and original fields; the checker has no access to CV ownership or a canonical item `apps/api/src/tailor/checks.ts:7` -> `CheckContext`; `apps/api/src/tailor/checks.ts:48` -> `ctx.original`.
- Tool recognition is a capitalization/token heuristic; it is not a complete entity or factual-entailment check `apps/api/src/tailor/checks.ts:29` -> `technical`; `apps/api/src/tailor/checks.ts:30` -> `capitalised`.

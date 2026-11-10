---
id: api-core/import-source-check
area: api-core
files: ["apps/api/src/imports/source-check.ts","apps/api/test/source-check.test.ts"]
depends_on: ["shared/cv"]
contract: false
checked_hash: 428f2942
decisions: ["docs/decisions/0010-cv-files-go-to-the-model-as-files.md"]
open: []
---
Flag extracted lines that cannot be matched to readable source text.

- Normalization uses NFKC, lowercase, punctuation unification and whitespace collapse; it does not strip diacritics. `apps/api/src/imports/source-check.ts:8` -> `normalizeForCheck`
- Checked fields include summary sentences, role titles/companies/descriptions/bullets, selected education and optional-section names, custom content, all three skill groups and interests. `apps/api/src/imports/source-check.ts:25` -> `summary`, `apps/api/src/imports/source-check.ts:33` -> `education`, `apps/api/src/imports/source-check.ts:44` -> `awards`, `apps/api/src/imports/source-check.ts:51` -> `technicalSkills`
- Ordered-word matching ignores one-character words and accepts a ninety-percent ordered match. `apps/api/src/imports/source-check.ts:5` -> `WORD_MATCH_SHARE`, `apps/api/src/imports/source-check.ts:58` -> `w.length >= 2`, `apps/api/src/imports/source-check.ts:69` -> `WORD_MATCH_SHARE`
- Hyphenated line breaks are joined; acceptance may be normalized substring, no-space substring or ordered-word match. `apps/api/src/imports/source-check.ts:77` -> `joined`, `apps/api/src/imports/source-check.ts:88` -> `norm.includes`
- Results preserve original trimmed lines, skip duplicates and lines shorter than three characters, and stop at fifty. `apps/api/src/imports/source-check.ts:3` -> `MAX_REPORTED`, `apps/api/src/imports/source-check.ts:84` -> `trimmed`
- tested by `apps/api/test/source-check.test.ts:11` -> `findUnsourcedLines`

## Connections
- Runtime review check: `apps/api/src/imports/process.ts:95` -> `findUnsourcedLines` -> `apps/api/src/imports/source-check.ts:76` -> `findUnsourcedLines`.
- Evaluation invented-line metric uses the same checker: `apps/api/eval/import/score.ts:179` -> `findUnsourcedLines` -> `apps/api/src/imports/source-check.ts:76` -> `findUnsourcedLines`.

## Assumptions
- Matching is advisory and permits ordered words separated by unrelated source text; it is not proof of an exact source sentence. `apps/api/src/imports/source-check.ts:63` -> `sourceWords.indexOf`
- Contact data and dates are not among the traversed line fields; this check cannot establish their correctness. `apps/api/src/imports/source-check.ts:25` -> `c.basics.summary`, `apps/api/src/imports/source-check.ts:26` -> `c.experience`, `apps/api/src/imports/source-check.ts:33` -> `c.education`

---
id: api-core/import-eval
area: api-core
files: ["apps/api/eval/import/run.eval.ts","apps/api/eval/import/score.ts","apps/api/eval/import/score.test.ts","apps/api/eval/import/RESULTS.md"]
depends_on: ["api-core/import-processing","api-core/import-source-check","api-core/config","shared/categories","shared/imports"]
contract: false
checked_hash: 5cb33d96
cited: [af9432, deaf7a, fed5d1, e7e36d, 88c772, b16c70, 7bd4d3, b7d5d3, db5078, d11842, 4adffb, 5b9959, fa25b5, bb752e, 130757, 0aada2, 5e6d0a, c6a5f2, 8e9253, 33da27, 51079c, fed5d1, 6f500b, 1d65bb, b9793c, 42f123, 1fee19, 11e6d0, b5f610, ddf414, fd8485, b5f610, db5078, d696d4, 825571]
decisions: ["docs/decisions/0010-cv-files-go-to-the-model-as-files.md"]
open: []
---
Run real-provider import evaluations and score outputs against synthetic answer keys.

- The runner filters sorted case-folder prefixes with EVAL_CASE, requires a nonempty selection, and runs cases sequentially. `apps/api/eval/import/run.eval.ts:116` -> `EVAL_CASE`
- It calls the production import pipeline with real fetch and collects AI logs in memory. `apps/api/eval/import/run.eval.ts:43` -> `model`, `apps/api/eval/import/run.eval.ts:57` -> `processImport`
- Every token-reporting attempt contributes to cost; an unknown provider/model price sets an error, preventing a pass. `apps/api/eval/import/run.eval.ts:63` -> `unpriced`
- Passing requires correct sections/flags/accents, at least .95 field accuracy, zero invented lines, duration below thirty seconds, and cost below .01. `apps/api/eval/import/run.eval.ts:20` -> `MAX_SECONDS`, `apps/api/eval/import/run.eval.ts:73` -> `pass`
- Successful outputs are written to the API node_modules cache before scoring; scan source text comes from the paired readable case. `apps/api/eval/import/run.eval.ts:14` -> `RESULTS`, `apps/api/eval/import/run.eval.ts:35` -> `SCAN_SOURCE_CASE`, `apps/api/eval/import/run.eval.ts:71` -> `writeFileSync`
- Scoring ignores ids/schemaVersion/layout, matches array items by name similarity rather than position, and penalizes extra items in its denominator. `apps/api/eval/import/score.ts:27` -> `SKIPPED_KEYS`, `apps/api/eval/import/score.ts:80` -> `similarity`, `apps/api/eval/import/score.ts:85` -> `pool`
- Missing actual values count as matching expected empty strings; boolean values must match exactly. `apps/api/eval/import/score.ts:69` -> `typeof expected`
- An unrequested first/last split is accepted if both parts recombine into the exact full name in either order; misplaced skills are removed before comparison to avoid counting both missing and extra. `apps/api/eval/import/score.ts:146` -> `want.firstName`, `apps/api/eval/import/score.ts:155` -> `list.filter`
- Accent failures require a result differing only in accents; flags are recomputed from content and compared as sorted keys. `apps/api/eval/import/score.ts:105` -> `brokenAccents`, `apps/api/eval/import/score.ts:173` -> `missingCategories`, `apps/api/eval/import/score.ts:181` -> `flagsOk`
- tested by `apps/api/eval/import/score.test.ts:43` -> `scoreCase`

## Connections
- Script selects the harness: `apps/api/package.json:10` -> `eval:import` -> `apps/api/eval/import/run.eval.ts:115` -> `imports the evaluation CVs`.
- Runner calls production processing: `apps/api/eval/import/run.eval.ts:57` -> `processImport` -> `apps/api/src/imports/process.ts:40` -> `processImport`.
- Runner calls scorer: `apps/api/eval/import/run.eval.ts:72` -> `scoreCase` -> `apps/api/eval/import/score.ts:170` -> `scoreCase`.
- Invented-line scoring calls the runtime source checker: `apps/api/eval/import/score.ts:179` -> `findUnsourcedLines` -> `apps/api/src/imports/source-check.ts:76` -> `findUnsourcedLines`.
- Generator and runner agree on answer keys: `apps/api/eval/import/generate.ts:36` -> `expected.json` -> `apps/api/eval/import/run.eval.ts:41` -> `expected.json`.
- Historical report accompanies the harness and names its prompt/command; it is not a fresh evaluation: `apps/api/eval/import/RESULTS.md:3` -> `import.v3.3` -> `apps/api/eval/import/run.eval.ts:122` -> `rows.every`.

## Assumptions
- Fixtures and cached outputs can contain full CV text; only synthetic fixture data should be supplied. `apps/api/eval/import/run.eval.ts:41` -> `readFileSync`, `apps/api/eval/import/run.eval.ts:71` -> `JSON.stringify(result`
- Cost is an estimate from the hardcoded price table and reported usage, not a provider billing query. `apps/api/eval/import/run.eval.ts:16` -> `PRICES`, `apps/api/eval/import/run.eval.ts:66` -> `inputTokens`

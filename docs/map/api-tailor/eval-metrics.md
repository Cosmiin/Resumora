---
id: api-tailor/eval-metrics
area: api-tailor
files: ["apps/api/eval/tailor/run.ts","apps/api/test/tailor-eval.test.ts"]
depends_on: ["shared/enrichment-checks","api-tailor/checks","api-tailor/score"]
contract: false
checked_hash: 7c79949c
cited: [78d48c, 783274, d3f5f8, ec823d, 203f57, befae7, 92e993, 43ee9a, bf6cb9, d0376b, 2a7c3c, 78ad02, e2b175, ba3bcb, 982f64, a3a4bc, 6cee89, db6e69, 25741d, 8a30c7, ccaec0, 0b65ce, 51d44b, ccaec0, 2d86b6, ec808c, aa9c5e, bf6cb9, 9138d4]
decisions: []
open: []
---
Measure stability, cost, unsupported facts, keyword coverage and PDF size for the tailoring harness.

- Scores each Base CV three times; null failures add problems and spread is calculated only when all three succeed `apps/api/eval/tailor/run.ts:136` -> `i < 3`; `apps/api/eval/tailor/run.ts:142` -> `push(null)`; `apps/api/eval/tailor/run.ts:147` -> `totals.length === 3`.
- Cost counts first scoring call plus route work, excludes the two stability repeats, and uses a hard-coded provider/model price table; missing usage counts zero and unknown model prices fail `apps/api/eval/tailor/run.ts:21` -> `PRICES`; `apps/api/eval/tailor/run.ts:89` -> `inputTokens ?? 0`; `apps/api/eval/tailor/run.ts:138` -> `stabilityCalls`; `apps/api/eval/tailor/run.ts:207` -> `costOf(runCalls)`; `apps/api/eval/tailor/run.ts:213` -> `no price`.
- Invented numbers may be backed by Base CV or job text; employers are checked only against experience companies; tool candidates use Base CV only `apps/api/eval/tailor/run.ts:68` -> `const sources`; `apps/api/eval/tailor/run.ts:70` -> `base.experience`; `apps/api/eval/tailor/run.ts:73` -> `unknownTools`.
- Eval source traversal ignores id/layout/schemaVersion/locale/photo/enrichedAt and keys ending Id, but not note timestamps; blanks are excluded `apps/api/eval/tailor/run.ts:53` -> `value.trim()`; `apps/api/eval/tailor/run.ts:57` -> `enrichedAt`.
- PDF uses classic template and actual web buildCvPdf; harness patches Font.register to resolve local font assets and counts pages with unpdf `apps/api/eval/tailor/run.ts:110` -> `Font.register`; `apps/api/eval/tailor/run.ts:113` -> `web/src/export/pdf.tsx`; `apps/api/eval/tailor/run.ts:122` -> `"classic"`; `apps/api/eval/tailor/run.ts:123` -> `numPages`.
- Failure thresholds are any invented fact, spread over three, cost at least 0.05 USD, or more than two pages; score lift and keyword coverage are reported without a pass threshold `apps/api/eval/tailor/run.ts:25` -> `LIMITS`; `apps/api/eval/tailor/run.ts:210` -> `row.invented`; `apps/api/eval/tailor/run.ts:214` -> `row.pages`; `apps/api/eval/tailor/run.ts:232` -> `const lift`.
- tested by `apps/api/test/tailor-eval.test.ts:13` -> `except the known page gap`.
- Keyword coverage is rounded non-missing keyword labels divided by all keyword labels, or null without keywords; lift subtracts the first Score 1 from Score 2 `apps/api/eval/tailor/run.ts:79` -> `keywords`; `apps/api/eval/tailor/run.ts:232` -> `const lift`.

## Connections

- Uses runtime import of web PDF builder, so changes to web rendering/fonts affect this API eval `apps/api/eval/tailor/run.ts:114` -> `import(`; `apps/api/eval/tailor/run.ts:115` -> `web.buildCvPdf`; `apps/web/src/export/pdf.tsx:26` -> `buildCvPdf`.

## Assumptions

- Invented-fact detection is numeric/token/company comparison, not complete semantic grounding; a number in the job can pass even if attributed to the candidate `apps/api/eval/tailor/run.ts:68` -> `cvTexts(job)`; `apps/api/eval/tailor/run.ts:69` -> `hasUnknownNumber`.

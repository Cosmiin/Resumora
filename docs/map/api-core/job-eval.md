---
id: api-core/job-eval
area: api-core
files: ["apps/api/eval/jobs/run.eval.ts"]
depends_on: ["api-core/job-processing","api-core/config","shared/jobs"]
contract: false
checked_hash: 2bb0b8d4
cited: [6288e6, 9fa24d, 4ec4b4, 46da2c, 738919, 5a8de9, 69d390, dfb93d, 19e9c2, 468cf7, 890fe9, b5b546, 95904c, 51ab33, 5337fc, fd2380, 1eb8b6, c81eb6, 4727cf, a3950c, cd4667, 738919]
decisions: []
open: []
---
Validate all job fixtures before optionally evaluating extraction with real providers.

- Loading requires exactly fifteen case directories, strict expected-answer shapes, page text of 200 through 60,000 characters and optional object JSON-LD. `apps/api/eval/jobs/run.eval.ts:12` -> `ExpectedSchema`, `apps/api/eval/jobs/run.eval.ts:25` -> `folders`, `apps/api/eval/jobs/run.eval.ts:31` -> `rawText.length`
- The first test validates all fixtures and requires two negative examples before storing cases for provider execution. `apps/api/eval/jobs/run.eval.ts:90` -> `loads all 15 cases`
- EVAL_JOBS_DRY_RUN skips real calls; otherwise there must be fifteen loaded cases and at least one configured provider. `apps/api/eval/jobs/run.eval.ts:97` -> `EVAL_JOBS_DRY_RUN`, `apps/api/eval/jobs/run.eval.ts:106` -> `providers.length`
- EVAL_CASE selects a nonempty folder-prefix subset after full fixture validation, then processes sequentially. `apps/api/eval/jobs/run.eval.ts:107` -> `EVAL_CASE`
- Classification must match every case; overall passing requires ceil(selected count times 13/15) cases without problems. `apps/api/eval/jobs/run.eval.ts:112` -> `classificationOk`
- Title/company comparisons ignore case; must/nice counts tolerate one difference; salary is checked only when expected salary is false. `apps/api/eval/jobs/run.eval.ts:53` -> `toLowerCase`, `apps/api/eval/jobs/run.eval.ts:59` -> `must`
- Token averages count all collected attempts and warn when successful calls omit usage. `apps/api/eval/jobs/run.eval.ts:70` -> `calls`, `apps/api/eval/jobs/run.eval.ts:81` -> `calls.some`

## Connections
- Package script selects this runner: `apps/api/package.json:12` -> `eval:jobs` -> `apps/api/eval/jobs/run.eval.ts:87` -> `job extraction evaluation`.
- Evaluation calls real production processing: `apps/api/eval/jobs/run.eval.ts:43` -> `processJob` -> `apps/api/src/jobs/process.ts:6` -> `processJob`.
- Provider selection uses shared env adapter: `apps/api/eval/jobs/run.eval.ts:100` -> `providersFromEnv` -> `apps/api/src/ai/call-model.ts:76` -> `providersFromEnv`.

## Assumptions
- A valid fixture may exceed the prompt text limit; only the first 30,000 characters reach extraction. `apps/api/eval/jobs/run.eval.ts:32` -> `60_000`, `apps/api/src/jobs/prompts.ts:23` -> `slice(0, 30_000)`
- Dry-run mode still uses the eval config, which loads its configured vars file; it is not a guarantee of no secret-file reads. `apps/api/vitest.eval.config.ts:26` -> `readDevVars`, `apps/api/eval/jobs/run.eval.ts:97` -> `EVAL_JOBS_DRY_RUN`

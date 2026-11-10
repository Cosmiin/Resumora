---
id: api-core/job-processing
area: api-core
files: ["apps/api/src/jobs/process.ts","apps/api/src/jobs/prompts.ts","apps/api/test/jobs-process.test.ts"]
depends_on: ["api-core/call-model","shared/jobs"]
contract: true
checked_hash: 1fe02a79
decisions: ["docs/decisions/0007-every-ai-call-goes-through-one-function.md"]
open: []
---
Extract a single job posting using dated prompt context and bounded output.

- job_extract uses JobExtractionSchema and a 2,000-token output cap. `apps/api/src/jobs/process.ts:12` -> `callModel`
- Non-postings return not_a_job; blank titles return ai_failed; all thrown failures are also collapsed to ai_failed. `apps/api/src/jobs/process.ts:20` -> `isJobPosting`, `apps/api/src/jobs/process.ts:33` -> `catch`
- applyBy outside one year before through two years after today becomes null; the optional clock controls the comparison and prompt date. `apps/api/src/jobs/process.ts:11` -> `deps.now`, `apps/api/src/jobs/process.ts:22` -> `applyBy`
- User prompt prepends today's date and optional serialized JSON-LD, then at most 30,000 raw-text characters. `apps/api/src/jobs/prompts.ts:18` -> `buildJobUserPrompt`
- The system prompt requests original language, unknown/null for missing facts, preserved stated years and next occurrence for yearless dates. `apps/api/src/jobs/prompts.ts:3` -> `jobExtractPrompt`
- Requirements default to must unless marked optional; JSON-LD is preferred for title/company/location/salary/dates, while page chrome and multi-posting pages should be rejected or ignored. `apps/api/src/jobs/prompts.ts:7` -> `must`, `apps/api/src/jobs/prompts.ts:14` -> `Ignore page chrome`
- tested by `apps/api/test/jobs-process.test.ts:29` -> `job user prompt`, `apps/api/test/jobs-process.test.ts:57` -> `job extract prompt`, `apps/api/test/jobs-process.test.ts:99` -> `job extraction`

## Connections
- Runtime and eval callers: `apps/api/src/jobs/consumer.ts:28` -> `processJob` and `apps/api/eval/jobs/run.eval.ts:43` -> `processJob` -> `apps/api/src/jobs/process.ts:6` -> `processJob`.
- Prompt templates: `apps/api/src/jobs/process.ts:16` -> `jobExtractPrompt` -> `apps/api/src/jobs/prompts.ts:3` -> `jobExtractPrompt`; `apps/api/src/jobs/process.ts:17` -> `buildJobUserPrompt` -> `apps/api/src/jobs/prompts.ts:18` -> `buildJobUserPrompt`.
- Schema and gateway: `apps/api/src/jobs/process.ts:15` -> `JobExtractionSchema` -> `packages/shared/src/jobs.ts:3` -> `JobExtractionSchema`; `apps/api/src/jobs/process.ts:12` -> `callModel` -> `apps/api/src/ai/call-model.ts:134` -> `callModel`.

## Assumptions
- JSON-LD and page text are untrusted source content placed directly into a model message; the prompt's facts-only instructions are not independent factual validation. `apps/api/src/jobs/prompts.ts:22` -> `JSON.stringify`, `apps/api/src/jobs/prompts.ts:3` -> `Never invent`
- Because provider exceptions become a result, the queue acknowledges exhausted AI failures instead of retrying them as infrastructure errors. `apps/api/src/jobs/process.ts:34` -> `ai_failed`, `apps/api/src/jobs/consumer.ts:48` -> `result.code`

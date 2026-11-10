---
id: api-core/job-processing
area: api-core
files: ["apps/api/src/jobs/process.ts","apps/api/src/jobs/prompts.ts","apps/api/test/jobs-process.test.ts"]
depends_on: ["api-core/call-model","shared/jobs"]
contract: true
checked_hash: 3cb78e17
cited: [fd0f36, 13ab6b, 6e8218, 112edf, 64ea60, 77de82, b9c9cf, 5ba0ee, 1671f9, dcdd9c, 9bc4e9, 0ce826, ecaf14, 112edf, 50ba72, dd5a08, 6b702f, 07539c, d541a6, 18ce67, 456b9f, 1996c4, 4dac92, a897e9, 91a6bc, 5337fc, b98502, ddebb1, dd5a08, ae1dad, 5ba0ee, 13ab6b, 9c570f, fd0f36, c006dc, c6b07e, dd5a08, e23f6c, fbb07f]
decisions: ["docs/decisions/0007-every-ai-call-goes-through-one-function.md"]
open: []
---
Extract a single job posting using dated prompt context and bounded output.

- job_extract extends the shared JobExtractionSchema with a required positionClosed boolean for strict model output, while keeping the 2,000-token output cap. `apps/api/src/jobs/process.ts:13` -> `callModel`, `apps/api/src/jobs/process.ts:16` -> `JobExtractionSchema.extend`, `apps/api/src/jobs/process.ts:19` -> `maxOutputTokens`
- Non-postings return not_a_job; blank titles return ai_failed; all thrown failures are also collapsed to ai_failed. `apps/api/src/jobs/process.ts:21` -> `isJobPosting`, `apps/api/src/jobs/process.ts:34` -> `catch`
- applyBy outside one year before through two years after today becomes null; the optional clock controls the comparison and prompt date. `apps/api/src/jobs/process.ts:12` -> `deps.now`, `apps/api/src/jobs/process.ts:23` -> `applyBy`
- User prompt prepends today's date and optional serialized JSON-LD, then at most 30,000 page-text characters after trimming trailing job lists. `apps/api/src/jobs/prompts.ts:19` -> `buildJobUserPrompt`, `apps/api/src/jobs/prompts.ts:26` -> `slice(0, 30_000)`
- Page text stops before the first trimmed, case-insensitive line equal to "Similar jobs", "Next job" or "See all"; that line and everything after it are dropped only from the prompt, leaving captured rawText unchanged. Marker phrases inside sentences do not cut the text. `apps/api/src/jobs/prompts.ts:24` -> `trailingJobs`, `apps/api/src/jobs/prompts.ts:25` -> `pageText`
- Prompt version job.v3 treats a closed position or one no longer accepting applications as isJobPosting:true with positionClosed:true; otherwise positionClosed:false. Such postings succeed when their title is nonblank. `apps/api/src/jobs/prompts.ts:1` -> `JOB_PROMPT_VERSION`, `apps/api/src/jobs/prompts.ts:16` -> `positionClosed: true`, `apps/api/src/jobs/process.ts:21` -> `isJobPosting`, `apps/api/src/jobs/process.ts:33` -> `ok: true`
- The system prompt requests original language, unknown/null for missing facts, preserved stated years and next occurrence for yearless dates. `apps/api/src/jobs/prompts.ts:3` -> `jobExtractPrompt`
- Requirements default to must unless marked optional; JSON-LD is preferred for title/company/location/salary/dates, while page chrome and multi-posting pages should be rejected or ignored. `apps/api/src/jobs/prompts.ts:7` -> `must`, `apps/api/src/jobs/prompts.ts:14` -> `Ignore page chrome`
- tested by `apps/api/test/jobs-process.test.ts:29` -> `job user prompt`, `apps/api/test/jobs-process.test.ts:80` -> `job extract prompt`, `apps/api/test/jobs-process.test.ts:129` -> `job extraction`
- Closed-ad acceptance, required model output and legacy extraction/PATCH compatibility are tested by `apps/api/test/jobs-process.test.ts:181` -> `returns a closed job`, `apps/api/test/jobs-process.test.ts:145` -> `schema.required`, `apps/api/test/jobs-process.test.ts:187` -> `loads and accepts PATCH`.

## Connections
- Runtime and eval callers: `apps/api/src/jobs/consumer.ts:28` -> `processJob` and `apps/api/eval/jobs/run.eval.ts:43` -> `processJob` -> `apps/api/src/jobs/process.ts:7` -> `processJob`.
- Prompt templates: `apps/api/src/jobs/process.ts:17` -> `jobExtractPrompt` -> `apps/api/src/jobs/prompts.ts:3` -> `jobExtractPrompt`; `apps/api/src/jobs/process.ts:18` -> `buildJobUserPrompt` -> `apps/api/src/jobs/prompts.ts:19` -> `buildJobUserPrompt`.
- Schema and gateway: `apps/api/src/jobs/process.ts:16` -> `JobExtractionSchema` -> `packages/shared/src/jobs.ts:3` -> `JobExtractionSchema`; `apps/api/src/jobs/process.ts:13` -> `callModel` -> `apps/api/src/ai/call-model.ts:134` -> `callModel`.

## Assumptions
- JSON-LD and page text are untrusted source content placed directly into a model message; the prompt's facts-only instructions are not independent factual validation. `apps/api/src/jobs/prompts.ts:23` -> `JSON.stringify`, `apps/api/src/jobs/prompts.ts:3` -> `Never invent`
- Because provider exceptions become a result, the queue acknowledges exhausted AI failures instead of retrying them as infrastructure errors. `apps/api/src/jobs/process.ts:35` -> `ai_failed`, `apps/api/src/jobs/consumer.ts:48` -> `result.code`

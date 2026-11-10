---
id: api-core/call-model
area: api-core
files: ["apps/api/src/ai/call-model.ts","apps/api/test/call-model.test.ts"]
depends_on: ["db/ai-log"]
contract: true
checked_hash: a2a8205d
cited: [f5bc30, e96cf0, faea7d, 01596c, d22a0e, 317f05, 1f3bab, ce1c13, cf12d0, 8fe862, cfa844, 724657, 10fd33, 8ec466, 764ae5, f1e691, 589e5e, 83ebd9, f9f2ed, a24794, 24324d, b5ac0e, e7bf16, c88b2d, 60e7df, a6d7b9, ec5c61, fd0f36, c006dc, 88fd71, 218509, 3cc324, edafda, 3581d7, a7c25d, 14f645, 67e83a, 86708c, c006dc, c6a59b, 0a48a0, 653857, 3f61b4, 410b74, 798098, b11129, a95aa1, c006dc, 14cb65, 7b270e, 79af61, 01596c, b20d4c, 9b676d, 0eb00d, fefc81, cfa844, 35f73e]
decisions: ["docs/decisions/0007-every-ai-call-goes-through-one-function.md","docs/decisions/0010-cv-files-go-to-the-model-as-files.md"]
open: []
---
Make schema-validated model calls with provider fallback and per-attempt logging.

- providersFromEnv orders OpenRouter before OpenAI and removes providers without both key and model. `apps/api/src/ai/call-model.ts:79` -> `Provider[]`, `apps/api/src/ai/call-model.ts:89` -> `filter`
- Strong-tier requests substitute strongModel only when configured; otherwise the normal model remains. `apps/api/src/ai/call-model.ts:153` -> `req.tier`
- OpenAI requests use max_completion_tokens and store:false; OpenRouter requests require supported parameters, deny collection and request zero retention. `apps/api/src/ai/call-model.ts:96` -> `providerRequestFields`
- Structured output uses a strict JSON schema without $schema and temperature zero. `apps/api/src/ai/call-model.ts:123` -> `jsonSchemaFor`, `apps/api/src/ai/call-model.ts:138` -> `temperature`
- PDF parts become a file data URI; ordinary strings stay strings. `apps/api/src/ai/call-model.ts:109` -> `userContent`
- Each provider gets at most two attempts; non-retryable failures advance immediately, and output-length failures stop all fallback. `apps/api/src/ai/call-model.ts:60` -> `ATTEMPTS_PER_PROVIDER`, `apps/api/src/ai/call-model.ts:154` -> `attempt`, `apps/api/src/ai/call-model.ts:167` -> `AiOutputTooLongError`
- Retryable statuses are 429/5xx; invalid response JSON/schema and network/timeouts also retry. `apps/api/src/ai/call-model.ts:213` -> `AttemptError`, `apps/api/src/ai/call-model.ts:226` -> `AttemptError`, `apps/api/src/ai/call-model.ts:231` -> `AttemptError`, `apps/api/src/ai/call-model.ts:239` -> `network error`
- File rejection requires a PDF request, status 400/415/422 and matching body wording; AiInputRejectedError requires every configured provider to reject input. `apps/api/src/ai/call-model.ts:119` -> `REJECTED_STATUSES`, `apps/api/src/ai/call-model.ts:212` -> `hasFile`, `apps/api/src/ai/call-model.ts:173` -> `rejectedBy`
- Request timeout overrides dependency timeout, then defaults to 45 seconds; both an abort signal and promise race bound fetch/body reads. `apps/api/src/ai/call-model.ts:59` -> `DEFAULT_TIMEOUT_MS`, `apps/api/src/ai/call-model.ts:193` -> `timeoutMs`, `apps/api/src/ai/call-model.ts:205` -> `AbortSignal.timeout`, `apps/api/src/ai/call-model.ts:216` -> `Promise.race`
- Every completed attempt logs status/duration and successful usage; rejected logging promises are reported without replacing the model result. `apps/api/src/ai/call-model.ts:156` -> `log`
- tested by `apps/api/test/call-model.test.ts:49` -> `callModel`, `apps/api/test/call-model.test.ts:180` -> `callModel file parts`, `apps/api/test/call-model.test.ts:264` -> `providersFromEnv`

## Connections
- Import admission/extraction and job extraction call the gateway: `apps/api/src/imports/process.ts:50` -> `callModel`, `apps/api/src/imports/process.ts:63` -> `callModel`, `apps/api/src/jobs/process.ts:13` -> `callModel` -> `apps/api/src/ai/call-model.ts:134` -> `callModel`.
- Enrichment callers: `apps/api/src/enrich/achievements.ts:47` -> `callModel`, `apps/api/src/enrich/brain-dump.ts:44` -> `callModel`, `apps/api/src/enrich/improve.ts:31` -> `callModel`, `apps/api/src/enrich/item-lines.ts:60` -> `callModel`, `apps/api/src/enrich/role-description.ts:64` -> `callModel`, `apps/api/src/enrich/role-facts.ts:18` -> `callModel`, `apps/api/src/enrich/score.ts:30` -> `callModel`, `apps/api/src/enrich/score.ts:81` -> `callModel`, `apps/api/src/enrich/skills.ts:41` -> `callModel` -> `apps/api/src/ai/call-model.ts:134` -> `callModel`.
- Tailoring callers: `apps/api/src/tailor/layout-pass.ts:58` -> `callModel`, `apps/api/src/tailor/letter.ts:47` -> `callModel`, `apps/api/src/tailor/letter.ts:54` -> `callModel`, `apps/api/src/tailor/questions.ts:110` -> `callModel`, `apps/api/src/tailor/score.ts:46` -> `callModel`, `apps/api/src/tailor/section-pass.ts:163` -> `callModel`, `apps/api/src/tailor/tone-examples.ts:34` -> `callModel`, `apps/api/src/tailor/translate.ts:68` -> `callModel` -> `apps/api/src/ai/call-model.ts:134` -> `callModel`.
- Request logging maps to the current authenticated RPC task allowlist: `apps/api/src/enrich/supabase-repo.ts:103` -> `log_ai_call` -> `supabase/migrations/20261109220000_enrich_item_lines.sql:22` -> `p_task not in`. A new task needs SQL support as well as a caller.
- Streaming shares request policy fields but makes its own fetch: `apps/api/src/ai/stream-model.ts:176` -> `providerRequestFields` -> `apps/api/src/ai/call-model.ts:96` -> `providerRequestFields`; `apps/api/src/ai/stream-model.ts:108` -> `deps.fetch`.
- Realtime voice uses a separate provider request: `apps/api/src/enrich/routes.ts:203` -> `createVoiceSession` -> `apps/api/src/ai/voice-session.ts:62` -> `deps.fetch`.

## Assumptions
- Schema validation establishes shape, not factual truth; feature-specific grounding must follow the parsed output. `apps/api/src/ai/call-model.ts:228` -> `schema.safeParse`
- Provider response bodies are not logged here; only status, fixed failure reasons and the failing schema path enter attempt logs. `apps/api/src/ai/call-model.ts:213` -> `HTTP`, `apps/api/src/ai/call-model.ts:230` -> `path`

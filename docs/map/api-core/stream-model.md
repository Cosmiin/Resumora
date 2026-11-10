---
id: api-core/stream-model
area: api-core
files: ["apps/api/src/ai/stream-model.ts","apps/api/src/ai/stream-model.test.ts"]
depends_on: ["api-core/call-model","shared/enrichment-focus","db/ai-log"]
contract: true
checked_hash: 1b480d76
cited: [1c096d, 68d1c4, 1faa3f, cb557e, d89fa6, 390a92, 4d86fe, 6fe178, 8b382f, caa1bb, b26248, 7ea947, 6af0a9, 0de3f2, c3d2e6, 265de4, 79af61, 01596c, cf7b4d, b2d383, 092f8b, 508ecf, 6d3223, 81cfca, d46923, 917c3f, c104c8, cf7b4d, 94e3f3, b2d383, 89b9a6, edecfe, 8bc536]
decisions: ["docs/decisions/0007-every-ai-call-goes-through-one-function.md"]
open: []
---
Stream text with fallback only before any output reaches the caller.

- First-text timeout defaults to 20 seconds; subsequent gaps are capped at 15 seconds or the shorter dependency timeout. `apps/api/src/ai/stream-model.ts:3` -> `FIRST_CHUNK_TIMEOUT_MS`, `apps/api/src/ai/stream-model.ts:58` -> `firstMs`
- SSE ignores comments, non-data lines and malformed JSON; DONE/stop mark completion while length/other finish reasons fail. `apps/api/src/ai/stream-model.ts:81` -> `readLine`, `apps/api/src/ai/stream-model.ts:95` -> `data.error`
- Keepalive input does not extend the deadline; only yielded text renews the gap timeout when reading resumes. `apps/api/src/ai/stream-model.ts:125` -> `deadline`, `apps/api/src/ai/stream-model.ts:139` -> `deadline`
- A successful stream needs text plus a completion marker. `apps/api/src/ai/stream-model.ts:149` -> `!yielded`
- Failure before text advances providers without retrying the same provider; failure after text throws AiStreamBrokenError. `apps/api/src/ai/stream-model.ts:61` -> `for (const provider`, `apps/api/src/ai/stream-model.ts:159` -> `await log`
- A signal already aborted before a provider attempt returns without logging or cleanup. Abort caught during an attempt logs an error and returns; cleanup cancels the reader, aborts fetch, and logs reader cancellation if no prior log exists. `apps/api/src/ai/stream-model.ts:62` -> `req.signal`, `apps/api/src/ai/stream-model.ts:155` -> `req.signal`, `apps/api/src/ai/stream-model.ts:161` -> `finally`
- tested by `apps/api/src/ai/stream-model.test.ts:52` -> `streamModel`

## Connections
- Summary rewrite snapshots first, constructs prompts, then streams: `apps/api/src/enrich/routes.ts:177` -> `snapshot`, `apps/api/src/enrich/routes.ts:178` -> `streamModel` -> `apps/api/src/ai/stream-model.ts:57` -> `streamModel`.
- Shared privacy fields: `apps/api/src/ai/stream-model.ts:176` -> `providerRequestFields` -> `apps/api/src/ai/call-model.ts:96` -> `providerRequestFields`.
- Prompt producer to request: `apps/api/src/enrich/routes.ts:181` -> `rewriteSummarySystemPrompt` and `apps/api/src/enrich/routes.ts:182` -> `rewriteSummaryUserMessage` -> `apps/api/src/ai/stream-model.ts:180` -> `req.system`, `apps/api/src/ai/stream-model.ts:181` -> `req.user`.
- Snapshot RPC used before streaming: `apps/api/src/cv/supabase-repo.ts:102` -> `snapshot_base_cv` -> `supabase/migrations/20261106030000_snapshot_skip_same.sql:5` -> `snapshot_base_cv`.

- Web summary URL reaches the rewrite handler: `apps/web/src/cv/enrich/SummaryTools.tsx:28` -> `/v1/enrich/rewrite-summary` -> `apps/api/src/enrich/routes.ts:173` -> `/rewrite-summary`; app mount `apps/api/src/app.ts:80` -> `/v1/enrich`.
- Summary prompt definitions are selected by the route: `apps/api/src/enrich/routes.ts:181` -> `rewriteSummarySystemPrompt` -> `apps/api/src/enrich/rewrite-prompts.ts:36` -> `rewriteSummarySystemPrompt`; `apps/api/src/enrich/routes.ts:182` -> `rewriteSummaryUserMessage` -> `apps/api/src/enrich/rewrite-prompts.ts:54` -> `rewriteSummaryUserMessage`.

## Assumptions
- This path emits raw text, not schema-validated JSON; callers must validate the final feature output. `apps/api/src/ai/stream-model.ts:102` -> `content`, `apps/api/src/enrich/routes.ts:186` -> `checkSummary`

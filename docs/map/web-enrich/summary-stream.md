---
id: web-enrich/summary-stream
area: web-enrich
files: ["apps/web/src/cv/enrich/SummaryTools.tsx","apps/web/src/cv/enrich/summary-skills.test.tsx"]
depends_on: ["web-enrich/summary","web-enrich/summary-review","web-enrich/stream","api-enrich/routes","api-enrich/rewrite","shared/enrichment-focus"]
contract: false
checked_hash: d7006c73
cited: [d46923, 18bf9f, aab291, 09ef5c, 38e3c3, 18182c, 609cd9, 74ed5e, c4d581, 7517bb, 1225ee, dc3d7c, 1316c6, 766ad8, 2782bc, d64d1c, 6b9e8c, 74c5a7, a8d161, d46923, 917c3f, 0de3f2, 4be711, 18bf9f, c4d581, b1b267]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Render streamed summary progress and distinguish failed, broken and empty runs.

- POST /v1/enrich/rewrite-summary sends `{}` and consumes start/delta/ready/dropped/error/done events instead of a JSON summary object; unmount aborts it. `apps/web/src/cv/enrich/SummaryTools.tsx:28` -> `streamRewrite`; `apps/web/src/cv/enrich/SummaryTools.tsx:32` -> `onEvent`; `apps/web/src/cv/enrich/SummaryTools.tsx:34` -> `controller.abort()`; `packages/shared/src/enrich-stream.ts:14` -> `RewriteEventSchemas`
- Start changes drafting to streaming; done/error finish the phase. Partial proposals remain stopped after failure, dropped proposals show their reason, and only ready proposals receive an acceptance button. `apps/web/src/cv/enrich/SummaryTools.tsx:29` -> `setPhase`; `apps/web/src/cv/enrich/SummaryTools.tsx:49` -> `finished`; `apps/web/src/cv/enrich/SummaryTools.tsx:57` -> `stopped`; `apps/web/src/cv/enrich/SummaryTools.tsx:60` -> `p.reason`; `apps/web/src/cv/enrich/SummaryTools.tsx:62` -> `p.state === "ready"`
- HTTP 502 ai_bad_answer, HTTP 503 ai_unavailable, SSE error and stream_broken all produce phase error. Copy is failed when there are no proposals and broken when any proposal exists; Try again restarts after another save wait. `apps/web/src/cv/enrich/enrich-api.ts:102` -> `errorOf`; `apps/web/src/cv/enrich/enrich-api.ts:124` -> `BROKEN`; `apps/web/src/cv/enrich/SummaryTools.tsx:31` -> `setPhase("error")`; `apps/web/src/cv/enrich/SummaryTools.tsx:95` -> `proposals.length > 0`; `apps/web/src/cv/enrich/SummaryTools.tsx:96` -> `onRestart`; `apps/web/src/cv/enrich/SummaryTools.tsx:171` -> `start()`
- A completed stream with no nondropped proposals shows nothing-to-use feedback; an error uses error feedback instead. `apps/web/src/cv/enrich/SummaryTools.tsx:51` -> `phase === "done"`; `apps/web/src/cv/enrich/SummaryTools.tsx:92` -> `nothing`; `apps/web/src/cv/enrich/SummaryTools.tsx:93` -> `phase === "error"`
- tested by `apps/web/src/cv/enrich/summary-skills.test.tsx:76` -> `describe`

## Connections

- Uses POST /v1/enrich/rewrite-summary with `{}`; the mounted server route reads saved content and emits schema-validated SSE events. `apps/web/src/cv/enrich/SummaryTools.tsx:28` -> `/v1/enrich/rewrite-summary`; `apps/api/src/enrich/routes.ts:173` -> `/rewrite-summary`; `apps/api/src/enrich/routes.ts:177` -> `snapshot`; `apps/api/src/enrich/routes.ts:169` -> `RewriteEventSchemas`
- Uses [summary-review](./summary-review.md): ready events permit review; Use dispatches the chosen text. `apps/web/src/cv/enrich/SummaryTools.tsx:32` -> `onEvent`; `apps/web/src/cv/enrich/SummaryTools.tsx:62` -> `p.state === "ready"`; `apps/web/src/cv/enrich/SummaryTools.tsx:38` -> `setSummary`

## Assumptions

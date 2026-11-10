---
id: web-enrich/stream
area: web-enrich
files: ["apps/web/src/cv/enrich/enrich-api.ts","apps/web/src/cv/enrich/stream-events.ts","apps/web/src/cv/enrich/stream-rewrite.test.ts"]
depends_on: ["web-enrich/client","web-enrich/summary-stream","web-enrich/summary-review","api-enrich/routes","api-enrich/rewrite","shared/enrichment-focus"]
contract: true
checked_hash: 80139f56
cited: [2da7f9, 2f5d07, 0766c8, 7517bb, cdfa50, 77e0f1, 6647e7, 2c950a, eb4e07, dae8f8, 1225ee, a6789f, 17336e, 282459, 1213b1, 4371eb, 77da9f, 326eec, 6ff2d9, 0ebf72, fc7bf3, 4e6e8c, 7320f2, bc70a7, fce614, de85e6, b218d7, d46923, 917c3f, 4be711, 6647e7, f33674, 0c2000, 50fe28, 57d3e6, dc3d7c, b8d79e, 33dd2f]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Parse summary SSE and retain only proposals that have reached an explicit ready state.

- Requests are authenticated POSTs advertising text/event-stream; initial fetch failures become error events, preserving ApiClientError codes or using network. `apps/web/src/cv/enrich/enrich-api.ts:95` -> `authedFetch`; `apps/web/src/cv/enrich/enrich-api.ts:97` -> `ApiClientError`
- Non-OK responses, including HTTP 502 ai_bad_answer and 503 ai_unavailable, become an error event through errorOf; no JSON success schema is applied to the whole stream. `apps/web/src/cv/enrich/enrich-api.ts:100` -> `!res.ok`; `apps/web/src/cv/enrich/enrich-api.ts:102` -> `errorOf`
- Frames combine data lines, parse JSON, and validate event-specific shared schemas; unknown event names, invalid JSON and schema-invalid frames are ignored. `apps/web/src/cv/enrich/enrich-api.ts:77` -> `name = value`; `apps/web/src/cv/enrich/enrich-api.ts:80` -> `Object.hasOwn`; `apps/web/src/cv/enrich/enrich-api.ts:88` -> `safeParse`
- Chunk boundaries are buffered and CRLF is normalized; the first done or error ends parsing. EOF without a terminal event and reader exceptions emit stream_broken. `apps/web/src/cv/enrich/enrich-api.ts:112` -> `buffer`; `apps/web/src/cv/enrich/enrich-api.ts:118` -> `return`; `apps/web/src/cv/enrich/enrich-api.ts:122` -> `BROKEN`; `apps/web/src/cv/enrich/enrich-api.ts:124` -> `BROKEN`
- Aborting suppresses subsequent callbacks through the signal check. `apps/web/src/cv/enrich/enrich-api.ts:132` -> `streamRewrite`; `apps/web/src/cv/enrich/enrich-api.ts:136` -> `!signal.aborted`
- Proposal keys combine run and event index; repeated starts are ignored, and a ready/used proposal suppresses another replacement for the same bullet. `apps/web/src/cv/enrich/stream-events.ts:23` -> `const key`; `apps/web/src/cv/enrich/stream-events.ts:28` -> `p.key === key`; `apps/web/src/cv/enrich/stream-events.ts:30` -> `settled(p)`
- Delta, dropped and nonduplicate ready updates apply only to streaming proposals. Ready-event duplicate removal runs before that state check: if another ready/used new-bullet proposal has the same text, the matching event-key proposal is removed even when already ready/used. Terminal events leave all proposals unchanged, so partial output never becomes ready merely because a stream ends. `apps/web/src/cv/enrich/stream-events.ts:22` -> `return list`; `apps/web/src/cv/enrich/stream-events.ts:24` -> `streaming`; `apps/web/src/cv/enrich/stream-events.ts:39` -> `repeat`; `apps/web/src/cv/enrich/stream-events.ts:40` -> `list.filter`
- Wire events are start `{index,replaces}`, delta/ready `{index,text}`, dropped `{index,reason}`, error `{code,message}`, done `{}`. `packages/shared/src/enrich-stream.ts:7` -> `StartEventSchema`; `packages/shared/src/enrich-stream.ts:8` -> `DeltaEventSchema`; `packages/shared/src/enrich-stream.ts:9` -> `ReadyEventSchema`; `packages/shared/src/enrich-stream.ts:10` -> `DroppedEventSchema`; `packages/shared/src/enrich-stream.ts:11` -> `ErrorEventSchema`; `packages/shared/src/enrich-stream.ts:12` -> `DoneEventSchema`
- tested by `apps/web/src/cv/enrich/stream-rewrite.test.ts:47` -> `describe`

## Connections

- Used by summary POST /v1/enrich/rewrite-summary with `{}`; the server serializes each shared-schema event. `apps/web/src/cv/enrich/SummaryTools.tsx:28` -> `/v1/enrich/rewrite-summary`; `apps/api/src/enrich/routes.ts:173` -> `/rewrite-summary`; `apps/api/src/enrich/routes.ts:169` -> `RewriteEventSchemas`; `apps/web/src/cv/enrich/enrich-api.ts:88` -> `RewriteEventSchemas`
- Uses server ready/dropped checks and terminal failures; provider stream interruption yields stream_broken and unavailable yields ai_unavailable inside SSE. `apps/api/src/enrich/rewrite.ts:68` -> `verdict`; `apps/api/src/enrich/rewrite.ts:79` -> `stream_broken`; `apps/api/src/enrich/rewrite.ts:81` -> `ai_unavailable`; `apps/web/src/cv/enrich/stream-events.ts:35` -> `case "ready"`; `apps/web/src/cv/enrich/SummaryTools.tsx:31` -> `setPhase("error")`

## Assumptions

- Ready means the server has checked the text; the browser validates event shape and state order rather than repeating factual checks. `apps/web/src/cv/enrich/stream-events.ts:41` -> `state: "ready"`; `apps/api/src/enrich/rewrite.ts:67` -> `check`

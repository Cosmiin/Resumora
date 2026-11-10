---
id: api-enrich/voice-route
area: api-enrich
files: ["apps/api/src/enrich/routes.ts","apps/api/src/enrich/routes.test.ts"]
depends_on: ["api-core/app","api-core/voice-session","shared/cv","shared/enrichment-score","db/voice-reservations","db/ai-log"]
contract: true
checked_hash: 20776aab
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Reserve a daily voice-session attempt before asking the provider for a transcription session.

- Missing voice configuration returns 503 ai_unavailable before a quota reservation. `apps/api/src/enrich/routes.ts:196` -> `!deps.voice`.
- The saved CV supplies locale; VOICE supplies model and daily quota, and reservation denial returns 429 voice_limit. `apps/api/src/enrich/routes.ts:197` -> `content.locale`; `apps/api/src/enrich/routes.ts:199` -> `VOICE.perDay`; `apps/api/src/enrich/routes.ts:200` -> `voice_limit`.
- Reservation precedes createVoiceSession; provider failure maps to 503 without refunding that attempt. `apps/api/src/enrich/routes.ts:199` -> `reserveVoiceSession`; `apps/api/src/enrich/routes.ts:203` -> `createVoiceSession`; `apps/api/src/enrich/routes.ts:205` -> `VoiceUnavailableError`.
- tested by `apps/api/src/ai/voice-session.test.ts:125` -> `uses the saved CV's language, and English when there is no CV`

## Connections

- Used by the browser voice URL, which parses VoiceSessionSchema. `apps/web/src/cv/enrich/enrich-api.ts:63` -> `/v1/enrich/voice-session`; `apps/api/src/enrich/routes.ts:194` -> `"/voice-session"`; `apps/web/src/cv/enrich/enrich-api.ts:63` -> `VoiceSessionSchema`.
- Uses shared/enrichment-score VOICE and api-core/voice-session for provider session creation. `apps/api/src/enrich/routes.ts:199` -> `VOICE.model`; `packages/shared/src/enrich.ts:288` -> `VOICE`; `apps/api/src/enrich/routes.ts:203` -> `createVoiceSession`; `apps/api/src/ai/voice-session.ts:56` -> `createVoiceSession`.
- Uses db/voice-reservations through reserve_voice_session RPC; the reservation records enrich_voice, also allowlisted for logging failures. `apps/api/src/enrich/routes.ts:199` -> `reserveVoiceSession`; `apps/api/src/enrich/supabase-repo.ts:88` -> `rpc("reserve_voice_session"`; `supabase/migrations/20261106020000_voice_reservation.sql:5` -> `reserve_voice_session`; `supabase/migrations/20261106020000_voice_reservation.sql:34` -> `enrich_voice`; `supabase/migrations/20261109220000_enrich_item_lines.sql:24` -> `enrich_voice`.

## Assumptions

- Identity and repository scoping come from parent authentication; the reservation represents an attempt, not successful transcription. `apps/api/src/app.ts:68` -> `verifyToken`; `apps/api/src/app.ts:80` -> `/v1/enrich`; `apps/api/src/enrich/routes.ts:195` -> `c.get("user")`; `apps/api/src/enrich/routes.ts:199` -> `deps.insightsRepo(user)`.

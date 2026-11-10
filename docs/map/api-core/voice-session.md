---
id: api-core/voice-session
area: api-core
files: ["apps/api/src/ai/voice-session.ts","apps/api/src/ai/voice-session.test.ts"]
depends_on: ["db/voice-reservations","db/ai-log","shared/enrichment-score","api-core/errors"]
contract: true
checked_hash: 5c22c867
decisions: ["docs/decisions/0007-every-ai-call-goes-through-one-function.md"]
open: []
---
Mint short-lived transcription credentials after reserving the user's voice quota.

- The OpenAI request creates a transcription session with server VAD, CV locale and the shared voice model. `apps/api/src/ai/voice-session.ts:62` -> `deps.fetch`, `apps/api/src/ai/voice-session.ts:68` -> `transcription`
- The requested key lifetime is ten seconds; the returned expiry is the provider's Unix-seconds value converted to ISO. `apps/api/src/ai/voice-session.ts:33` -> `VOICE_KEY_SECONDS`, `apps/api/src/ai/voice-session.ts:66` -> `expires_after`, `apps/api/src/ai/voice-session.ts:81` -> `expiresAt`
- Response validation requires string value and numeric expires_at; failures attempt an error log, suppress logging rejection and throw VoiceUnavailableError. `apps/api/src/ai/voice-session.ts:80` -> `body.value`, `apps/api/src/ai/voice-session.ts:85` -> `logCall`
- The route returns 503 when voice is absent, reads locale from the CV, then reserves quota before requesting a key. `apps/api/src/enrich/routes.ts:194` -> `/voice-session`, `apps/api/src/enrich/routes.ts:199` -> `reserveVoiceSession`
- Refused reservations yield 429; provider failure yields 503 and does not undo the successful quota reservation. `apps/api/src/enrich/routes.ts:199` -> `reserveVoiceSession`, `apps/api/src/enrich/routes.ts:205` -> `VoiceUnavailableError`
- tested by `apps/api/src/ai/voice-session.test.ts:28` -> `createVoiceSession`, `apps/api/src/ai/voice-session.test.ts:77` -> `POST /v1/enrich/voice-session`

## Connections
- Web POST reaches enrichment route under app mount: `apps/web/src/cv/enrich/enrich-api.ts:63` -> `/v1/enrich/voice-session` -> `apps/api/src/app.ts:80` -> `/v1/enrich` -> `apps/api/src/enrich/routes.ts:194` -> `/voice-session`.
- Route calls credential factory: `apps/api/src/enrich/routes.ts:203` -> `createVoiceSession` -> `apps/api/src/ai/voice-session.ts:56` -> `createVoiceSession`.
- Reservation RPC: `apps/api/src/enrich/routes.ts:199` -> `reserveVoiceSession` -> `apps/api/src/enrich/supabase-repo.ts:88` -> `reserve_voice_session` -> `supabase/migrations/20261106020000_voice_reservation.sql:5` -> `reserve_voice_session`.
- Error logging RPC: `apps/api/src/ai/voice-session.ts:85` -> `logCall` -> `apps/api/src/index.ts:53` -> `supabaseAiCallLogger` -> `apps/api/src/enrich/supabase-repo.ts:103` -> `log_ai_call` -> `supabase/migrations/20261109220000_enrich_item_lines.sql:7` -> `log_ai_call`.
- Browser obtains the returned key and uses it as a WebSocket subprotocol: `apps/web/src/cv/enrich/useVoice.ts:172` -> `clientSecret` -> `apps/api/src/ai/voice-session.ts:81` -> `clientSecret`; `apps/web/src/cv/enrich/realtime.ts:51` -> `WebSocket`.
- Shared model and quota: `apps/api/src/enrich/routes.ts:199` -> `VOICE.perDay` and `apps/api/src/ai/voice-session.ts:71` -> `VOICE.model` -> `packages/shared/src/enrich.ts:288` -> `VOICE`.

## Assumptions
- The full provider key stays in server dependencies; only the minted value is returned. `apps/api/src/ai/voice-session.ts:64` -> `deps.apiKey`, `apps/api/src/ai/voice-session.ts:81` -> `body.value`
- Quota enforcement is delegated to the authenticated database RPC; the API supplies the limit rather than the RPC fixing it internally. `apps/api/src/enrich/supabase-repo.ts:88` -> `p_limit`, `supabase/migrations/20261106020000_voice_reservation.sql:5` -> `p_limit`

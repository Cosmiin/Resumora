---
id: web-enrich/voice
area: web-enrich
files: ["apps/web/src/cv/enrich/useVoice.ts","apps/web/src/cv/enrich/answer-box.test.tsx"]
depends_on: ["web-enrich/client-sections","web-enrich/voice-recording","web-enrich/voice-transport","web-enrich/voice-capture","web-enrich/voice-ui","api-enrich/voice-route","api-core/voice-session","db/voice-reservations","shared/enrichment-score"]
contract: false
checked_hash: 0115760f
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Create a browser voice session before requesting microphone access.

- Voice support requires getUserMedia and WebSocket; unsupported browsers start unavailable. AudioContext support is checked later by capture and can fail separately. `apps/web/src/cv/enrich/useVoice.ts:39` -> `supported`; `apps/web/src/cv/enrich/useVoice.ts:78` -> `unavailable`; `apps/web/src/cv/enrich/mic.ts:53` -> `new AudioContext`
- Start requests POST /v1/enrich/voice-session before countdown or microphone permission; it sends no audio or locale to this endpoint and parses `{clientSecret,expiresAt,model}`. The hook uses only the transient credential. `apps/web/src/cv/enrich/useVoice.ts:172` -> `createVoiceSession`; `apps/web/src/cv/enrich/enrich-api.ts:55` -> `VoiceSessionSchema`; `apps/web/src/cv/enrich/enrich-api.ts:63` -> `/v1/enrich/voice-session`; `apps/web/src/cv/enrich/useVoice.ts:207` -> `getUserMedia`
- Server uses the saved CV locale, reserves a daily session before provider creation and returns 429 on exhausted quota. The upstream session has transcription model VOICE.model, locale language and server_vad, with VOICE_KEY_SECONDS=10 for starting a connection. `apps/api/src/enrich/routes.ts:197` -> `content.locale`; `apps/api/src/enrich/routes.ts:199` -> `reserveVoiceSession`; `apps/api/src/enrich/routes.ts:200` -> `429`; `apps/api/src/ai/voice-session.ts:33` -> `VOICE_KEY_SECONDS`; `apps/api/src/ai/voice-session.ts:66` -> `expires_after`; `apps/api/src/ai/voice-session.ts:71` -> `transcription`; `apps/api/src/ai/voice-session.ts:72` -> `server_vad`
- Any session-request 429 ends in limit; HTTP 503 ai_unavailable, HTTP 502 ai_bad_answer if received, malformed replies and network failure end idle/interrupted, allowing another attempt. No code-specific branch distinguishes 502 from 503. `apps/web/src/cv/enrich/useVoice.ts:173` -> `catch`; `apps/web/src/cv/enrich/useVoice.ts:175` -> `e.status === 429`
- Countdown and connection setup overlap; actual recording waits for countdown completion, opened transport and capture readiness. Any getUserMedia rejection produces denied. `apps/web/src/cv/enrich/useVoice.ts:179` -> `countdown`; `apps/web/src/cv/enrich/useVoice.ts:186` -> `!countdownDone`; `apps/web/src/cv/enrich/useVoice.ts:209` -> `end("denied")`; `apps/web/src/cv/enrich/useVoice.ts:221` -> `Promise.all`
- tested by `apps/web/src/cv/enrich/answer-box.test.tsx:97` -> `describe`

## Connections

- Uses the authenticated session route, which delegates provider creation to POST https://api.openai.com/v1/realtime/client_secrets; the browser subsequently sends audio directly to the WebSocket provider. `apps/web/src/cv/enrich/enrich-api.ts:63` -> `/v1/enrich/voice-session`; `apps/api/src/enrich/routes.ts:194` -> `/voice-session`; `apps/api/src/enrich/routes.ts:203` -> `createVoiceSession`; `apps/api/src/ai/voice-session.ts:62` -> `deps.fetch(ENDPOINT`; `apps/api/src/ai/voice-session.ts:34` -> `ENDPOINT`; `apps/web/src/cv/enrich/useVoice.ts:214` -> `openTranscription`; `apps/web/src/cv/enrich/realtime.ts:51` -> `new WebSocket`
- Uses reserveVoiceSession -> Supabase reserve_voice_session RPC, whose authenticated caller identity comes from auth.uid; failed provider creation occurs after the reservation. `apps/api/src/enrich/routes.ts:199` -> `reserveVoiceSession`; `apps/api/src/enrich/supabase-repo.ts:87` -> `reserveVoiceSession`; `apps/api/src/enrich/supabase-repo.ts:88` -> `rpc("reserve_voice_session"`; `supabase/migrations/20261106020000_voice_reservation.sql:5` -> `reserve_voice_session`; `supabase/migrations/20261106020000_voice_reservation.sql:12` -> `auth.uid()`; `apps/api/src/enrich/routes.ts:203` -> `createVoiceSession`

## Assumptions

- Session credentials stay in function-local state and go only to transport creation; the browser does not use returned expiry/model to reconnect or refresh. `apps/web/src/cv/enrich/useVoice.ts:172` -> `createVoiceSession`; `apps/web/src/cv/enrich/useVoice.ts:214` -> `openTranscription`

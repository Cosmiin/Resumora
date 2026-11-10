---
id: web-enrich/voice-recording
area: web-enrich
files: ["apps/web/src/cv/enrich/useVoice.ts","apps/web/src/cv/enrich/answer-box.test.tsx"]
depends_on: ["web-enrich/voice","web-enrich/voice-transport","web-enrich/voice-capture","web-enrich/answers","web-enrich/focus-answers","web-enrich/brain-dump","shared/cv","shared/enrichment-score","api-enrich/voice-route","api-core/voice-session"]
contract: false
checked_hash: 0115760f
cited: [cf39a7, cac511, 43d804, 35760f, 3589fe, 238b5c, cc960f, 8db9f0, 4892fc, e04f7f, 6b8f0e, 0838e2, 1407ac, 35387c, d9d7a8, 427cd0, 427cd0, 0713c9, e8a5ce, 35387c, d6daaa, c88bad, 6982ff, 46fd98, 372f05, f3ce8d, 9b09bb, 9c4c65, 5c0092, 7715e0, cac511, 43d804, 8a585f, f3410a, 88f8ce, 238b5c, 747d1a, d9d7a8, 0838e2, 6ab0b7]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Bound recording lifetime and deliver ordered final transcript pieces across interruptions.

- Only while recording does capture send audio. Stop flushes/stops capture and tracks before commit, then waits at most STOP_WAIT_MS=1500 for final words. `apps/web/src/cv/enrich/useVoice.ts:216` -> `l.recording`; `apps/web/src/cv/enrich/useVoice.ts:112` -> `stopMic`; `apps/web/src/cv/enrich/useVoice.ts:113` -> `commit`; `apps/web/src/cv/enrich/useVoice.ts:115` -> `STOP_WAIT_MS`; `apps/web/src/cv/enrich/useVoice.ts:46` -> `track.stop()`
- Recording caps use maxSeconds, defaulting to shared VOICE.maxSeconds=60; BrainDumpStep passes a literal 120 override. Shared VOICE.perDay=20 is enforced by the server reservation, independently of recording duration. `apps/web/src/cv/enrich/useVoice.ts:77` -> `VOICE.maxSeconds`; `apps/web/src/cv/enrich/useVoice.ts:193` -> `maxSeconds`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:62` -> `120`; `packages/shared/src/enrich.ts:288` -> `perDay: 20`; `apps/api/src/enrich/routes.ts:199` -> `VOICE.perDay`
- Incoming delta/final/failed/committed events are keyed by item ID. Finished pieces wait until earlier observed IDs finish; final drain can skip unfinished pieces. Non-Latin scripts are stripped from both partial and final text. `apps/web/src/cv/enrich/realtime.ts:35` -> `input_audio_transcription.delta`; `apps/web/src/cv/enrich/useVoice.ts:56` -> `l.order.push`; `apps/web/src/cv/enrich/useVoice.ts:63` -> `!l.done.has(id)`; `apps/web/src/cv/enrich/useVoice.ts:94` -> `drain(l, emit, true)`; `apps/web/src/cv/enrich/useVoice.ts:15` -> `Script=Latin`; `apps/web/src/cv/enrich/useVoice.ts:145` -> `latinOnly`
- A stream error or unexpected close while recording returns idle/interrupted, drains finished segments and clears partial words; a close during stopping is normal. Per-item transcription failures become empty completed pieces, permitting later finals to drain. `apps/web/src/cv/enrich/useVoice.ts:145` -> `: ""`; `apps/web/src/cv/enrich/useVoice.ts:151` -> `end("idle", true)`; `apps/web/src/cv/enrich/useVoice.ts:156` -> `l.stopping`; `apps/web/src/cv/enrich/useVoice.ts:94` -> `drain`; `apps/web/src/cv/enrich/useVoice.ts:99` -> `setPartialWords([])`
- Unmount closes microphone and transport; a microphone granted after cancellation is immediately cleaned up. `apps/web/src/cv/enrich/useVoice.ts:212` -> `closeAll(l)`; `apps/web/src/cv/enrich/useVoice.ts:234` -> `live.current`; `apps/web/src/cv/enrich/useVoice.ts:236` -> `closeAll(l)`
- Capture, transport and the session API use stand-ins; their implementations and the server reservation are not exercised. useVoice recording, transcript handling and cleanup through AnswerBox are tested by `apps/web/src/cv/enrich/answer-box.test.tsx:97` -> `describe`

## Connections

- Uses microphone encoding and final transcript callback; accepted words reach AnswerBox's local answer value and become saved notes only on later submission. `apps/web/src/cv/enrich/useVoice.ts:215` -> `startCapture`; `apps/web/src/cv/enrich/mic.ts:89` -> `startCapture`; `apps/web/src/cv/enrich/useVoice.ts:241` -> `onFinal`; `apps/web/src/cv/enrich/AnswerBox.tsx:75` -> `onFinal`; `apps/web/src/cv/enrich/useFocusSession.ts:460` -> `setNote`
- Uses [voice-transport](./voice-transport.md): Stop flushes microphone audio before committing the provider input buffer. `apps/web/src/cv/enrich/useVoice.ts:112` -> `stopMic`; `apps/web/src/cv/enrich/useVoice.ts:113` -> `commit`; `apps/web/src/cv/enrich/realtime.ts:83` -> `input_audio_buffer.commit`

## Assumptions

- Transcription language comes from the saved CV, not the locale argument to useVoice; the current shared Locale union is ro/en/fr/de/es/it, compatible with latinOnly filtering. Adding a non-Latin locale requires reconsidering that filter. `apps/api/src/enrich/routes.ts:197` -> `content.locale`; `apps/api/src/ai/voice-session.ts:71` -> `language: locale`; `apps/web/src/cv/enrich/useVoice.ts:77` -> `locale: Locale`; `packages/shared/src/cv.ts:181` -> `locale: z.enum`; `apps/web/src/cv/enrich/useVoice.ts:15` -> `Script=Latin`
- Ordering relies on provider item IDs arriving in intended speech order; the hook appends an ID on first observation, without sorting by a timestamp. `apps/web/src/cv/enrich/useVoice.ts:56` -> `l.order.push(itemId)`; `apps/web/src/cv/enrich/useVoice.ts:133` -> `track(l, e.itemId)`

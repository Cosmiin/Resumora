---
id: web-enrich/voice-transport
area: web-enrich
files: ["apps/web/src/cv/enrich/realtime.ts","apps/web/src/cv/enrich/voice-transport.test.ts"]
depends_on: ["web-enrich/voice","web-enrich/voice-recording","web-enrich/voice-capture"]
contract: false
checked_hash: 2a233a54
cited: [75cb99, 583675, e46b92, 1a9ff2, 27aef0, 97a77c, 8a585f, 73b8fc, 912d79, b8665f, 3c1221, 87286d, 0838e2]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Send browser audio directly over the transcription WebSocket and decode provider events.

- Browser connects directly to wss://api.openai.com/v1/realtime?intent=transcription; the ephemeral credential travels as a WebSocket subprotocol, not URL query data. `apps/web/src/cv/enrich/realtime.ts:6` -> `URL_TRANSCRIBE`; `apps/web/src/cv/enrich/realtime.ts:51` -> `new WebSocket`
- Browser sends JSON input_audio_buffer.append with base64 audio, and input_audio_buffer.commit when stopping. Transport queues outgoing messages until opened; malformed/unknown incoming messages are ignored. `apps/web/src/cv/enrich/realtime.ts:59` -> `ws.send`; `apps/web/src/cv/enrich/realtime.ts:63` -> `queue.splice`; `apps/web/src/cv/enrich/realtime.ts:69` -> `JSON.parse`; `apps/web/src/cv/enrich/realtime.ts:82` -> `input_audio_buffer.append`; `apps/web/src/cv/enrich/realtime.ts:83` -> `input_audio_buffer.commit`; `apps/web/src/cv/enrich/realtime.ts:46` -> `return null`
- tested by `apps/web/src/cv/enrich/voice-transport.test.ts:14` -> `describe`

## Connections

- Used by [voice-recording](./voice-recording.md): the hook opens this transport and supplies its event callback. `apps/web/src/cv/enrich/useVoice.ts:214` -> `openTranscription`; `apps/web/src/cv/enrich/realtime.ts:50` -> `openTranscription`

## Assumptions

- Provider item IDs must be usable for ordering: event conversion accepts a missing/non-string item_id as an empty string, while the hook tracks items by ID. `apps/web/src/cv/enrich/realtime.ts:33` -> `const itemId`; `apps/web/src/cv/enrich/useVoice.ts:56` -> `l.order.push(itemId)`

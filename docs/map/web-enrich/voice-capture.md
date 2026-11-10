---
id: web-enrich/voice-capture
area: web-enrich
files: ["apps/web/src/cv/enrich/mic.ts","apps/web/src/cv/enrich/voice-transport.test.ts"]
depends_on: ["web-enrich/voice-recording","web-enrich/voice-transport"]
contract: false
checked_hash: e2cb7102
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Capture microphone samples and convert them into bounded PCM16 audio chunks.

- Audio is PCM16 little-endian, mono 24 kHz, normally in 2400-sample chunks; cleanup emits a shorter final chunk when samples remain. Values clamp to [-1,1]. Sample-rate conversion retains interpolation position across callbacks. `apps/web/src/cv/enrich/mic.ts:6` -> `24_000`; `apps/web/src/cv/enrich/mic.ts:7` -> `RATE / 10`; `apps/web/src/cv/enrich/mic.ts:18` -> `Math.max`; `apps/web/src/cv/enrich/mic.ts:19` -> `setInt16`; `apps/web/src/cv/enrich/mic.ts:44` -> `pos -= last`; `apps/web/src/cv/enrich/mic.ts:102` -> `CHUNK`; `apps/web/src/cv/enrich/mic.ts:114` -> `pending.length`
- Capture tries a 24 kHz AudioContext, falls back to native rate, prefers AudioWorklet and falls back to ScriptProcessor. Its output is connected through a muted gain; cleanup flushes pending audio then closes the context. `apps/web/src/cv/enrich/mic.ts:53` -> `sampleRate: RATE`; `apps/web/src/cv/enrich/mic.ts:62` -> `new AudioContext()`; `apps/web/src/cv/enrich/mic.ts:67` -> `audioWorklet`; `apps/web/src/cv/enrich/mic.ts:80` -> `createScriptProcessor`; `apps/web/src/cv/enrich/mic.ts:107` -> `mute.gain.value = 0`; `apps/web/src/cv/enrich/mic.ts:114` -> `pending.length`
- tested by `apps/web/src/cv/enrich/voice-transport.test.ts:76` -> `describe`

## Connections

- Used by [voice-recording](./voice-recording.md): capture emits chunks through the hook's recording-only transport gate. `apps/web/src/cv/enrich/useVoice.ts:215` -> `startCapture`; `apps/web/src/cv/enrich/useVoice.ts:216` -> `l.recording`; `apps/web/src/cv/enrich/mic.ts:89` -> `startCapture`

## Assumptions

- Captured chunks are delivered synchronously to onChunk, including the final short chunk during cleanup; the caller must keep its transport usable until that flush finishes. `apps/web/src/cv/enrich/mic.ts:102` -> `onChunk`; `apps/web/src/cv/enrich/mic.ts:114` -> `onChunk`; `apps/web/src/cv/enrich/useVoice.ts:112` -> `stopMic`; `apps/web/src/cv/enrich/useVoice.ts:113` -> `commit`

---
id: web-enrich/voice-ui
area: web-enrich
files: ["apps/web/src/cv/enrich/VoiceControls.tsx","apps/web/src/cv/enrich/voice-look.test.tsx"]
depends_on: ["web-enrich/voice","web-enrich/voice-recording","web-enrich/answers"]
contract: false
checked_hash: 0f09dde2
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Render microphone availability, recording controls and accessible transcription status.

- Controls hide the mic only for denied/unavailable/limit and disable it while asking/stopping; countdown permits cancellation. VoiceStatus shows finishing and the last ten seconds as visible text outside any aria-live region; the live words block uses aria-live="polite" for announcements, and word animation respects reduced motion. `apps/web/src/cv/enrich/VoiceControls.tsx:27` -> `micAvailable`; `apps/web/src/cv/enrich/VoiceControls.tsx:50` -> `disabled`; `apps/web/src/cv/enrich/VoiceControls.tsx:54` -> `voice.stop`; `apps/web/src/cv/enrich/VoiceControls.tsx:99` -> `left <= 10`; `apps/web/src/cv/enrich/VoiceControls.tsx:103` -> `stopping`; `apps/web/src/cv/enrich/VoiceControls.tsx:105` -> `aria-live="polite"`; `apps/web/src/cv/enrich/VoiceControls.tsx:108` -> `reduceMotion`
- tested by `apps/web/src/cv/enrich/voice-look.test.tsx:26` -> `describe.each`

## Connections

- Used by AnswerBox, tailoring steering and job thoughts; changing transport or recording controls affects those flows too. `apps/web/src/cv/enrich/AnswerBox.tsx:66` -> `useVoice`; `apps/web/src/tailor/SteeringStep.tsx:16` -> `useVoice`; `apps/web/src/jobs/JobThoughts.tsx:26` -> `useVoice`; `apps/web/src/cv/enrich/useVoice.ts:77` -> `useVoice`; `apps/web/src/tailor/SteeringStep.tsx:21` -> `VoiceStatus`; `apps/web/src/jobs/JobThoughts.tsx:93` -> `VoiceStatus`; `apps/web/src/cv/enrich/VoiceControls.tsx:64` -> `VoiceStatus`
- Uses [voice-recording](./voice-recording.md): control availability reflects the hook state returned after recording or interruption. `apps/web/src/cv/enrich/VoiceControls.tsx:27` -> `voice.state`; `apps/web/src/cv/enrich/useVoice.ts:101` -> `setState(next)`

## Assumptions

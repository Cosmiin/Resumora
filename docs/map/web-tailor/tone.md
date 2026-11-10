---
id: web-tailor/tone
area: web-tailor
files: ["apps/web/src/tailor/ToneStep.tsx","apps/web/src/tailor/steering.test.tsx"]
depends_on: ["web-tailor/client-run","web-tailor/steering","shared/tailoring"]
contract: false
checked_hash: 00e1e106
cited: [6c8840, 051b8c, 50d3c6, 3c5b0c, 81d0fb, 020578, 205bd4, 97bae9, 6c1623, 81d0fb, 1bcb53, cc63ff, b7c0b3, b914a8, 3c5b0c]
decisions: []
open: []
---
Choose a tone using personal examples with fixed-text fallback.

- Cards iterate shared TONES: formal, neutral, confident, concise, warm, technical and executive. `apps/web/src/tailor/ToneStep.tsx:23` -> `TONES.map`; `packages/shared/src/tailor.ts:7` -> `TONES`
- Examples load on jobId change; rejected requests are ignored and a live flag prevents updates after cleanup. `apps/web/src/tailor/ToneStep.tsx:12` -> `useEffect`
- Each card falls back independently to translated fixed text when its example is absent. `apps/web/src/tailor/ToneStep.tsx:26` -> `examples[value]`
- Picking a card only calls onTone; moving on requires the separate Next button. `apps/web/src/tailor/ToneStep.tsx:24` -> `onTone`; `apps/web/src/tailor/ToneStep.tsx:30` -> `onNext`
- tested by `apps/web/src/tailor/steering.test.tsx:46` -> `it`

## Connections

- Used by SteeringStep, which owns the selected tone across its two screens. `apps/web/src/tailor/SteeringStep.tsx:45` -> `ToneStep`; `apps/web/src/tailor/ToneStep.tsx:9` -> `ToneStep`
- Uses tailor-tone.is-on and the global fm-steps indicator styling. `apps/web/src/tailor/ToneStep.tsx:24` -> `tailor-tone is-on`; `apps/web/src/styles/tailor.css:44` -> `.tailor-tone.is-on`; `apps/web/src/tailor/ToneStep.tsx:19` -> `fm-steps`; `apps/web/src/styles/focus.css:50` -> `.fm-steps`

## Assumptions

- Failure to produce examples does not invalidate tone selection: empty examples are sufficient to render every card. `apps/web/src/tailor/ToneStep.tsx:11` -> `useState`; `apps/web/src/tailor/ToneStep.tsx:26` -> `examples[value]`

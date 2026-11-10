---
id: web-enrich/answers
area: web-enrich
files: ["apps/web/src/cv/enrich/AnswerBox.tsx","apps/web/src/cv/enrich/answer-picks.test.tsx","apps/web/src/cv/enrich/answer-box.test.tsx"]
depends_on: ["web-enrich/voice","web-enrich/voice-recording","web-enrich/voice-ui","web-enrich/focus-answers","web-enrich/brain-dump","web-enrich/question-step","shared/cv","api-enrich/voice-route"]
contract: false
checked_hash: 39815d80
cited: [e57413, 45ada5, ac7aa4, 5beb38, 31acf2, 242d8f, ec9ccd, 3cf7dd, 526e09, 4934ea, 54e696, c53fd9, ec397b, e3ae04, 954682, aa5745, 372f05, 8942e6, 238b5c, 7242ca, 92a469, c53fd9, ef89e3, 917b94, a368cd, f3410a]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Compose picked, typed and spoken evidence without persisting it independently.

- Option toggling treats each option as a comma-space-bounded piece, even when an option contains comma-space; removing it preserves surrounding typed text. `apps/web/src/cv/enrich/AnswerBox.tsx:27` -> `SEP`; `apps/web/src/cv/enrich/AnswerBox.tsx:33` -> `startOk`; `apps/web/src/cv/enrich/AnswerBox.tsx:43` -> `togglePick`
- Final spoken text is appended after a picked option with comma-space, otherwise a space; a mutable latest ref accumulates rapid final segments before rerendering. `apps/web/src/cv/enrich/AnswerBox.tsx:55` -> `appendSpoken`; `apps/web/src/cv/enrich/AnswerBox.tsx:58` -> `afterOption`; `apps/web/src/cv/enrich/AnswerBox.tsx:77` -> `appendSpoken`; `apps/web/src/cv/enrich/AnswerBox.tsx:78` -> `latest.current = next`
- Via is the shared Note via element type; pick/type/voice are accumulated without duplicates. AnswerBox only invokes onChange and never dispatches a note itself. `apps/web/src/cv/enrich/AnswerBox.tsx:7` -> `Note["via"]`; `apps/web/src/cv/enrich/AnswerBox.tsx:62` -> `addVia`; `apps/web/src/cv/enrich/AnswerBox.tsx:79` -> `cur.onChange`; `apps/web/src/cv/enrich/AnswerBox.tsx:109` -> `"pick"`; `apps/web/src/cv/enrich/AnswerBox.tsx:126` -> `"type"`
- Session failures including 502/503 return voice to idle/interrupted with the mic available; permission denial and daily limit show separate messages, and unsupported voice hides the mic without a message here. `apps/web/src/cv/enrich/useVoice.ts:175` -> `end("idle", true)`; `apps/web/src/cv/enrich/AnswerBox.tsx:91` -> `const message`; `apps/web/src/cv/enrich/VoiceControls.tsx:27` -> `micAvailable`
- tested by `apps/web/src/cv/enrich/answer-picks.test.tsx:40` -> `describe`
- tested by `apps/web/src/cv/enrich/answer-box.test.tsx:97` -> `describe`

## Connections

- Uses useVoice and shared voice controls; final transcript text reaches the same onChange path as typing. `apps/web/src/cv/enrich/AnswerBox.tsx:66` -> `useVoice`; `apps/web/src/cv/enrich/useVoice.ts:77` -> `useVoice`; `apps/web/src/cv/enrich/AnswerBox.tsx:130` -> `VoiceStatus`; `apps/web/src/cv/enrich/VoiceControls.tsx:64` -> `VoiceStatus`

## Assumptions

- The owning flow must persist and limit answers: AnswerBox has no maxLength and only emits changes; focus-session submission trims/caps, while BrainDumpStep caps each change. `apps/web/src/cv/enrich/AnswerBox.tsx:126` -> `onChange`; `apps/web/src/cv/enrich/useFocusSession.ts:455` -> `slice(0, MAX_LONG_TEXT)`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:58` -> `slice(0, MAX_LONG_TEXT)`
- Locale labels answer/transcript content for accessibility; generated language is selected from the saved CV on the server. `apps/web/src/cv/enrich/AnswerBox.tsx:121` -> `lang={locale}`; `apps/api/src/enrich/routes.ts:197` -> `content.locale`

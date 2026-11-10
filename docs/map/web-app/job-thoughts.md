---
id: web-app/job-thoughts
area: web-app
files: ["apps/web/src/jobs/JobThoughts.tsx","apps/web/src/jobs/job-page.test.tsx"]
depends_on: ["web-app/job-saves","web-app/api-client","shared/jobs","web-enrich/voice","web-enrich/voice-ui"]
contract: false
checked_hash: 6575287d
decisions: []
open: []
---
Keep typed or dictated job thoughts visible while serializing blur saves.

- Incoming value refreshes local text only when there is no in-flight save, the textarea is unfocused and latest equals accepted. `apps/web/src/jobs/JobThoughts.tsx:20` -> `inFlight.current`
- Latest, accepted, inFlight and queued refs track text independently from rendering. A save during another save replaces queued with the latest differing text. `apps/web/src/jobs/JobThoughts.tsx:13` -> `latest`; `apps/web/src/jobs/JobThoughts.tsx:34` -> `inFlight.current !== null`
- The save loop skips already accepted text and advances accepted only after onSave succeeds. `apps/web/src/jobs/JobThoughts.tsx:42` -> `while`; `apps/web/src/jobs/JobThoughts.tsx:49` -> `await onSave`
- Failed saves preserve typed text and mark failed; version_conflict gets specific copy and other errors generic copy. `apps/web/src/jobs/JobThoughts.tsx:52` -> `catch`
- JobThoughts passes English to useVoice, but the hook ignores locale and the server selects the saved CV's language for the voice session. Recording, countdown, asking and stopping count as busy and notify the parent; saving itself is not included in this busy callback. `apps/web/src/jobs/JobThoughts.tsx:26` -> `locale: "en"`; `apps/web/src/cv/enrich/useVoice.ts:77` -> `maxSeconds = VOICE.maxSeconds`; `apps/api/src/enrich/routes.ts:197` -> `content.locale`; `apps/api/src/enrich/routes.ts:203` -> `createVoiceSession`; `apps/web/src/jobs/JobThoughts.tsx:30` -> `busy`
- Final transcript appends after trimmed trailing whitespace, separated by a space, and truncates to 2,000 characters. Typing has the same cap and native maxLength. `apps/web/src/jobs/JobThoughts.tsx:70` -> `slice(0, 2000)`; `apps/web/src/jobs/JobThoughts.tsx:85` -> `maxLength={2000}`
- Blur saves immediately unless voice is busy, in which case saving waits for busy to clear. Mic mousedown prevents losing textarea focus. `apps/web/src/jobs/JobThoughts.tsx:75` -> `saveAfterVoice.current`; `apps/web/src/jobs/JobThoughts.tsx:88` -> `onBlur`; `apps/web/src/jobs/JobThoughts.tsx:90` -> `preventDefault`
- Layout-effect cleanup stops busy voice before passive cleanup, and saves dirty text unless a previous save is still marked failed. `apps/web/src/jobs/JobThoughts.tsx:62` -> `useLayoutEffect`
- tested by `apps/web/src/jobs/job-page.test.tsx:71` -> `newest queued thoughts`
- tested by `apps/web/src/jobs/job-page.test.tsx:92` -> `does not retry failed thoughts`
## Connections
- Uses the parent's extraction/version save path: `apps/web/src/jobs/JobThoughts.tsx:49` -> `onSave(sent)`; `apps/web/src/jobs/JobPage.tsx:221` -> `saveDetails({ userThoughts })`; `apps/web/src/jobs/JobPage.tsx:108` -> `patchJob`
- Uses reusable voice controls: `apps/web/src/jobs/JobThoughts.tsx:89` -> `MicButton`; `apps/web/src/cv/enrich/VoiceControls.tsx:39` -> `MicButton`; `apps/web/src/jobs/JobThoughts.tsx:93` -> `VoiceStatus`; `apps/web/src/cv/enrich/VoiceControls.tsx:64` -> `VoiceStatus`
- Copied 2,000-character cap must track the shared PATCH schema: `apps/web/src/jobs/JobThoughts.tsx:85` -> `2000`; `packages/shared/src/jobs.ts:50` -> `max(2000)`
## Assumptions
- The parent must return a promise that rejects failed persistence; accepted advances on any resolved onSave result. `apps/web/src/jobs/JobThoughts.tsx:7` -> `Promise<unknown>`; `apps/web/src/jobs/JobThoughts.tsx:50` -> `accepted.current = sent`

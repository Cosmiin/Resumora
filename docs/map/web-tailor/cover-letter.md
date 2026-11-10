---
id: web-tailor/cover-letter
area: web-tailor
files: ["apps/web/src/tailor/CoverLetterTab.tsx","apps/web/src/tailor/cover-letter.test.tsx"]
depends_on: ["web-tailor/client-actions","web-tailor/letter-page","web-tailor/steering","shared/tailoring","api-tailor/letter","db/tailoring-repository"]
contract: false
checked_hash: c7e7dfe1
cited: [0a21be, 87ca05, 4018c9, d8e8e7, 00f5f3, ef6f1b, e0fb11, 713101, 877a2d, f2f039, efa877, 88bd2c, 0b932e, 7951b1, 494cc0, 9b69e3, 9bcc3a, 718c82, d0ddea, 9b69e3, e4122d, 7ac20c, c0e911, e5e9a6, c3a3f9, 1294f6, 08bf26, 82258d, 541103, 867669, 81a2ab, f2f039, fd8eee, 9b5df0, 326c04, ab0ddf, fd8eee, 3d90d9, f2f039, 9f45d4, 609fe6, ae7507, 88bd2c, b58033, 0d435a, 3d90d9]
decisions: []
open: []
---
Generate and autosave cover-letter text while keeping local tab edits.

- pickLetter accepts an override only when loadedAt equals the loaded CV's updatedAt; otherwise the row's coverLetter wins. `apps/web/src/tailor/CoverLetterTab.tsx:24` -> `override.loadedAt`
- Fields initialize from the supplied letter; job role/company fall back to empty strings. `apps/web/src/tailor/CoverLetterTab.tsx:29` -> `role`
- Autosave waits local SAVE_DELAY=800ms and serializes requests; a flush during an active save sets again and triggers another flush afterward. `apps/web/src/tailor/CoverLetterTab.tsx:8` -> `SAVE_DELAY`; `apps/web/src/tailor/CoverLetterTab.tsx:50` -> `saving.current.busy`; `apps/web/src/tailor/CoverLetterTab.tsx:62` -> `saving.current.again`
- Save reads latest field refs, trims manager/whyCompany, reports the saved letter, and shows error on failure. `apps/web/src/tailor/CoverLetterTab.tsx:53` -> `latest.current`
- Closing the tab flushes a pending timer; edits schedule saves only after a letter exists. `apps/web/src/tailor/CoverLetterTab.tsx:70` -> `flush`; `apps/web/src/tailor/CoverLetterTab.tsx:91` -> `letter`
- Generate cancels the pending autosave before calling AI, replaces body/flags on success, and does not await an already-running save; failure only sets the writing error, leaving recent edits from that cancelled timer unscheduled. `apps/web/src/tailor/CoverLetterTab.tsx:75` -> `clearTimeout`; `apps/web/src/tailor/CoverLetterTab.tsx:78` -> `writeLetter`; `apps/web/src/tailor/CoverLetterTab.tsx:84` -> `catch`
- Body maxLength=4000 mirrors shared CoverLetterSchema.shape.body.maxLength; there is no separate named shared limit constant. `apps/web/src/tailor/CoverLetterTab.tsx:94` -> `maxLength={4000}`; `packages/shared/src/tailor.ts:178` -> `max(4000)`
- Why-company maxLength and dictation slice both use 1000, mirroring API LetterBodySchema/LetterEditSchema limits; shared CoverLetterSchema.whyCompany has no length cap. `apps/web/src/tailor/CoverLetterTab.tsx:39` -> `slice(0, 1000)`; `apps/web/src/tailor/CoverLetterTab.tsx:105` -> `maxLength={1000}`; `apps/api/src/tailor/letter.ts:13` -> `optional(1000)`; `apps/api/src/tailor/letter.ts:17` -> `max(1000)`; `packages/shared/src/tailor.ts:180` -> `whyCompany`
- Manager maxLength=120 mirrors API generation/edit limits, not a shared constant; the shared field is only nullable string. `apps/web/src/tailor/CoverLetterTab.tsx:111` -> `maxLength={120}`; `apps/api/src/tailor/letter.ts:13` -> `optional(120)`; `apps/api/src/tailor/letter.ts:16` -> `max(120)`; `packages/shared/src/tailor.ts:179` -> `hiringManager`
- Writing disables body/side fields and hides the microphone; an existing letter requires an inline replacement confirmation. `apps/web/src/tailor/CoverLetterTab.tsx:95` -> `disabled`; `apps/web/src/tailor/CoverLetterTab.tsx:107` -> `mic`; `apps/web/src/tailor/CoverLetterTab.tsx:116` -> `confirming`
- Returned flag details remain displayed in local state; editing does not re-run those checks. `apps/web/src/tailor/CoverLetterTab.tsx:80` -> `setFlags`; `apps/web/src/tailor/CoverLetterTab.tsx:89` -> `edit`; `apps/web/src/tailor/CoverLetterTab.tsx:131` -> `flag.detail`
- tested by `apps/web/src/tailor/cover-letter.test.tsx:41` -> `describe`
- tested by `apps/web/src/tailor/cover-letter.test.tsx:84` -> `describe`

- The sidebar keeps why-company and manager fields without a job-note usage line, tested by `apps/web/src/tailor/cover-letter.test.tsx:42` -> `shows Write letter when there's no letter yet`.

## Connections

- Both AI generation and manual letter saves reach setCoverLetter, whose update filters only by id with no version comparison; concurrent letter writes are therefore not version-protected. `apps/web/src/tailor/CoverLetterTab.tsx:78` -> `writeLetter`; `apps/web/src/tailor/CoverLetterTab.tsx:55` -> `saveLetter`; `apps/api/src/tailor/letter.ts:81` -> `setCoverLetter`; `apps/api/src/tailor/letter.ts:97` -> `setCoverLetter`; `apps/api/src/tailor/supabase-repo.ts:148` -> `setCoverLetter`

- Uses saveLetter/writeLetter; these calls are unversioned, unlike CV content saves. `apps/web/src/tailor/CoverLetterTab.tsx:55` -> `saveLetter`; `apps/web/src/tailor/tailored-api.ts:60` -> `PUT`; `apps/web/src/tailor/CoverLetterTab.tsx:78` -> `writeLetter`; `apps/web/src/tailor/tailored-api.ts:53` -> `cover-letter`
- Uses global letter-tab responsive columns and letter-body textarea styling. `apps/web/src/tailor/CoverLetterTab.tsx:99` -> `letter-tab`; `apps/web/src/styles/tailor.css:120` -> `.letter-tab`; `apps/web/src/tailor/CoverLetterTab.tsx:94` -> `letter-body`; `apps/web/src/styles/tailor.css:127` -> `.letter-body`

## Assumptions

- Client serialization covers this mounted tab only; there is no version field protecting writes from other tabs or generation overlap. `apps/web/src/tailor/CoverLetterTab.tsx:47` -> `saving`; `apps/web/src/tailor/tailored-api.ts:60` -> `json: edit`

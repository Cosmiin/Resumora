---
id: web-tailor/flow-state
area: web-tailor
files: ["apps/web/src/tailor/flow-phase.ts","apps/web/src/tailor/tailor-flow.test.tsx"]
depends_on: ["shared/tailoring","web-tailor/flow","web-tailor/skills-review"]
contract: false
checked_hash: 501273b4
cited: [2b4ba6, ff86d9, c4d70c, 8a47f8, 792848, 2553d4, b49eab, 5f592d, 07ff65, c11c32, b49eab, 410db0, 4acdc6, 93a13e, 4c874e, 5745b5, f8cd16, 5fd7b4, 2e8d8f, f8cd16, bed506, b49eab, eda562, c5195b]
decisions: []
open: []
---
Define browser phases and remember the current run for each job.

- Phases include loading, steer, confirm, back, role, redo, asking, questions, working, review, roleDone, done, error and deleted; they are distinct from server run statuses. `apps/web/src/tailor/flow-phase.ts:5` -> `Phase`; `apps/web/src/tailor/flow-phase.ts:14` -> `asking`; `apps/web/src/tailor/flow-phase.ts:20` -> `roleDone`; `packages/shared/src/tailor.ts:192` -> `status`
- Back, role and redo phases carry the screen to resume; steering can optionally carry it. `apps/web/src/tailor/flow-phase.ts:8` -> `resume`
- Question drafts are indexed locally and can be undefined until reached. `apps/web/src/tailor/flow-phase.ts:16` -> `answers`
- The storage key is resumora.tailorRun.${jobId}; remember writes a non-null run id and removes the key otherwise. `apps/web/src/tailor/flow-phase.ts:26` -> `storageKey`
- Storage write errors are swallowed and read errors return null. `apps/web/src/tailor/flow-phase.ts:31` -> `catch`; `apps/web/src/tailor/flow-phase.ts:34` -> `catch`
- tested by `apps/web/src/tailor/tailor-flow.test.tsx:161` -> `it`

## Connections

- Only the run id under resumora.tailorRun.${jobId} survives reload: load fetches that run and enters its current server position; question drafts and review choices are not restored. `apps/web/src/tailor/flow-phase.ts:26` -> `storageKey`; `apps/web/src/tailor/TailorFlow.tsx:185` -> `enter`; `apps/web/src/tailor/TailorFlow.tsx:60` -> `enter`; `apps/web/src/tailor/TailorFlow.tsx:72` -> `answers`; `apps/web/src/tailor/SkillsReview.tsx:26` -> `useState`
- Used by re-tailoring before navigating to the flow. `apps/web/src/tailor/TailoredCvPage.tsx:117` -> `remember`; `apps/web/src/tailor/flow-phase.ts:27` -> `remember`

## Assumptions

- Mounted tabs have no storage-event synchronization: loading runs through the one-time effect, and remember/remembered only write/read the key; another tab changing the stored id does not replace the mounted run. `apps/web/src/tailor/TailorFlow.tsx:188` -> `useEffect`; `apps/web/src/tailor/TailorFlow.tsx:200` -> `load`; `apps/web/src/tailor/flow-phase.ts:27` -> `remember`; `apps/web/src/tailor/flow-phase.ts:33` -> `remembered`

- The storage key is scoped by job, not user; reading it still requires an authenticated API request and server job lookup. `apps/web/src/tailor/flow-phase.ts:26` -> `storageKey`; `apps/api/src/tailor/routes.ts:60` -> `getRun`; `apps/web/src/lib/api.ts:33` -> `getSession`

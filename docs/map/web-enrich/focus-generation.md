---
id: web-enrich/focus-generation
area: web-enrich
files: ["apps/web/src/cv/enrich/useFocusSession.ts","apps/web/src/cv/enrich/focus-session.test.tsx"]
depends_on: ["web-enrich/client-focus","web-enrich/focus-session","web-enrich/focus-answers","web-enrich/focus-acceptance","api-enrich/improve","api-enrich/brain-dump","shared/enrichment-focus","shared/enrichment-score","web-editor/autosave"]
contract: false
checked_hash: 6860a7f1
cited: [6ac664, fbbff0, 7f847e, fbcd70, 83af4c, 67ef76, c36d34, f7247c, 6016f2, f0d7d6, 7475e7, f79e31, 66cffc, c6fea3, ceb031, 25c211, 83af4c, 66cffc, d25d5a, f7247c, c6fea3, fbc523, f7247c, 16e356, 61f407, c36d34, 291349]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Generate graded single-bullet rewrites and brain-dump proposals after saving current content.

- Generation waits for save, recomputes the current fingerprint, then sends improve or brain dump. Exactly one retry follows a 409 not_saved, with another save wait. `apps/web/src/cv/enrich/useFocusSession.ts:227` -> `waitForSave`; `apps/web/src/cv/enrich/useFocusSession.ts:229` -> `retry < 2`; `apps/web/src/cv/enrich/useFocusSession.ts:233` -> `fingerprint`; `apps/web/src/cv/enrich/useFocusSession.ts:260` -> `not_saved`
- Improve response needsDetail returns the specific nextQuestion to the queue; otherwise proposal text and before/after grades are displayed. `apps/web/src/cv/enrich/useFocusSession.ts:240` -> `improveBullet`; `apps/web/src/cv/enrich/useFocusSession.ts:242` -> `needsDetail`; `apps/web/src/cv/enrich/useFocusSession.ts:245` -> `kind: "proposal"`
- Brain dump receives proposals plus roleBefore/roleAfterAll; empty answers-source or interrupted-question results resume the queue, while an empty free ramble exposes dumpEmpty. `apps/web/src/cv/enrich/useFocusSession.ts:249` -> `brainDump`; `apps/web/src/cv/enrich/useFocusSession.ts:253` -> `!answer.proposals.length`; `apps/web/src/cv/enrich/useFocusSession.ts:256` -> `dumpEmpty`
- Improve/brain-dump 502 ai_bad_answer and 503 ai_unavailable both become failed/unavailable; save failures and exhausted 409 retries become failed/saving. Retry repeats lastCall, preserving its source. These are JSON calls, so interrupted bodies take the same exception path, with no partial proposals. `apps/web/src/cv/enrich/useFocusSession.ts:268` -> `reason: saving`; `apps/web/src/cv/enrich/useFocusSession.ts:542` -> `s.lastCall`; `apps/web/src/cv/enrich/enrich-api.ts:39` -> `apiFetch`; `apps/web/src/cv/enrich/enrich-api.ts:43` -> `apiFetch`
- tested by `apps/web/src/cv/enrich/focus-session.test.tsx:79` -> `describe`
- tested by `apps/web/src/cv/enrich/focus-session.test.tsx:802` -> `describe`

## Connections

- Uses POST /v1/enrich/improve-bullet `{roleId,bulletId,fingerprint}` -> ImproveAnswer and /brain-dump `{roleId,fingerprint,source?}` -> BrainDumpAnswer. `apps/web/src/cv/enrich/useFocusSession.ts:240` -> `improveBullet`; `apps/web/src/cv/enrich/enrich-api.ts:39` -> `/v1/enrich/improve-bullet`; `apps/api/src/enrich/routes.ts:66` -> `/improve-bullet`; `apps/web/src/cv/enrich/useFocusSession.ts:249` -> `brainDump`; `apps/web/src/cv/enrich/enrich-api.ts:43` -> `/v1/enrich/brain-dump`; `apps/api/src/enrich/routes.ts:84` -> `/brain-dump`
- Uses the server brain-dump proposal cutoff: its hand-copied score >=40 mirrors band's goodStart boundary, with no exported numeric threshold constant. Changing that boundary requires changing the filter as well as display bands. `apps/web/src/cv/enrich/useFocusSession.ts:249` -> `brainDump`; `apps/api/src/enrich/brain-dump.ts:74` -> `b.score >= 40`; `packages/shared/src/enrich.ts:279` -> `40`
- Uses [focus-acceptance](./focus-acceptance.md): proposal generation records the text that acceptance must compare before replacement. `apps/web/src/cv/enrich/useFocusSession.ts:245` -> `kind: "proposal"`; `apps/web/src/cv/enrich/useFocusSession.ts:508` -> `s.callText`

## Assumptions

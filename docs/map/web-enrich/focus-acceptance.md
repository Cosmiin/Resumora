---
id: web-enrich/focus-acceptance
area: web-enrich
files: ["apps/web/src/cv/enrich/useFocusSession.ts","apps/web/src/cv/enrich/focus-session.test.tsx"]
depends_on: ["web-enrich/focus-session","web-enrich/focus-generation","web-enrich/focus-feedback","web-enrich/scores","shared/cv","shared/enrichment-score","web-editor/reducer"]
contract: false
checked_hash: 6860a7f1
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Apply accepted bullet proposals and wait for trustworthy score celebrations.

- Accept checks that the target exists and its text still equals callText; a changed bullet is regenerated once, then skipped if changed again. Only after this check does replaceBullet dispatch. `apps/web/src/cv/enrich/useFocusSession.ts:506` -> `role?.bullets.find`; `apps/web/src/cv/enrich/useFocusSession.ts:508` -> `s.callText`; `apps/web/src/cv/enrich/useFocusSession.ts:509` -> `s.rerun.has`; `apps/web/src/cv/enrich/useFocusSession.ts:514` -> `replaceBullet`
- Cached proposals celebrate immediately only if role score increases or the prior score was null; uncached acceptance waits for a changed matching fingerprint from background scoring. The wait times out after 15 seconds without manufacturing a score. `apps/web/src/cv/enrich/useFocusSession.ts:515` -> `!step.cached`; `apps/web/src/cv/enrich/useFocusSession.ts:519` -> `step.roleAfter <= step.roleBefore`; `apps/web/src/cv/enrich/useFocusSession.ts:350` -> `scorePrint`; `apps/web/src/cv/enrich/useFocusSession.ts:341` -> `15000`
- Brain-dump acceptance filters by selected proposal IDs, dispatches one addBullets, and waits for actual scoring rather than celebrating roleAfterAll. `apps/web/src/cv/enrich/useFocusSession.ts:530` -> `ids.includes`; `apps/web/src/cv/enrich/useFocusSession.ts:536` -> `source: "dump"`; `apps/web/src/cv/enrich/useFocusSession.ts:537` -> `addBullets`
- New scores celebrate only an increase (or first score); after adding bullets, the queue is rebuilt excluding completed IDs. `apps/web/src/cv/enrich/useFocusSession.ts:329` -> `buildQueue`; `apps/web/src/cv/enrich/useFocusSession.ts:332` -> `fresh.score > s.scoreBefore`
- tested by `apps/web/src/cv/enrich/focus-session.test.tsx:79` -> `describe`

## Connections

- Uses replaceBullet/addBullets across all scored lists; missing targets are ignored, additions receive new IDs and are capped by MAX_BULLETS. `apps/web/src/cv/enrich/useFocusSession.ts:514` -> `replaceBullet`; `apps/web/src/cv/edit/cvReducer.ts:303` -> `case "replaceBullet"`; `apps/web/src/cv/edit/cvReducer.ts:197` -> `index < 0`; `apps/web/src/cv/enrich/useFocusSession.ts:537` -> `addBullets`; `apps/web/src/cv/edit/cvReducer.ts:313` -> `MAX_BULLETS`; `apps/web/src/cv/edit/cvReducer.ts:314` -> `newId`

## Assumptions

- Acceptance protects the target bullet text, not the entire role fingerprint; cached role-score predictions therefore rely on unchanged surrounding content. `apps/web/src/cv/enrich/useFocusSession.ts:508` -> `bullet.text !== s.callText`; `apps/web/src/cv/enrich/useFocusSession.ts:515` -> `step.cached`
- Identity lookup assumes unique scored-item IDs; findScored takes the first matching item. `apps/web/src/cv/enrich/useFocusSession.ts:505` -> `findScored`; `packages/shared/src/cv.ts:279` -> `.find`

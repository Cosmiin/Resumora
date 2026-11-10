---
id: web-enrich/score-display
area: web-enrich
files: ["apps/web/src/cv/enrich/ScoreCard.tsx","apps/web/src/cv/enrich/ScorePill.tsx","apps/web/src/cv/enrich/RoleScoreList.tsx","apps/web/src/cv/enrich/tips.ts","apps/web/src/cv/enrich/score-card.test.tsx","apps/web/src/cv/enrich/scores.test.tsx"]
depends_on: ["web-enrich/scores","web-enrich/focus-session","shared/enrichment-score","shared/enrichment-checks","web-editor/role-editors","web-editor/overview","web-editor/section-tools","web-editor/reducer"]
contract: false
checked_hash: 0ef7b98e
cited: [44b6ad, ee14db, 560708, e2088d, 68ebb0, 4ba0b0, 9f42be, 7169bf, 83f818, 61f407, 7122d7, 5ed209, 7ce870, b64839, 8954d3, c00298, f22d2a, b9584a, b2c9a0, 444bc8, 9327b5, ffd0d0, d72cbe, 9c3dff, 81ee0c, 189e46, 444bc8, c544b4, 98614d, 4f9701, a3848b, 83f818, 61f407, 9525f7, ab085d, c84f3c, cda9c0, c88f16]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Render role scores, stale-result feedback, contextual tips and improvement entry points.

- ScoreCard shows old numeric results during rescoring/failure, marks them previous, and adds Try again on unavailable; no result shows scoring/no-bullets/unavailable instead. `apps/web/src/cv/enrich/ScoreCard.tsx:33` -> `shown`; `apps/web/src/cv/enrich/ScoreCard.tsx:35` -> `previous`; `apps/web/src/cv/enrich/ScoreCard.tsx:36` -> `retry`; `apps/web/src/cv/enrich/ScoreCard.tsx:61` -> `unavailable`
- Tips are at most two: model nextStep first, then the first shared ATS check; blank model tips use the issue translation. `apps/web/src/cv/enrich/ScoreCard.tsx:21` -> `nextStep`; `apps/web/src/cv/enrich/ScoreCard.tsx:23` -> `atsChecks`; `apps/web/src/cv/enrich/tips.ts:6` -> `tip.trim()`
- Band names come from shared band: clear at 75+, goodStart at 40+, needsWork below 40; clearCount independently uses 75. These are literal shared definitions, not exported numeric threshold constants. `apps/web/src/cv/enrich/ScoreCard.tsx:47` -> `band(n)`; `packages/shared/src/enrich.ts:278` -> `75`; `packages/shared/src/enrich.ts:279` -> `40`; `packages/shared/src/enrich.ts:284` -> `75`
- ScoreCard's hand-copied 80 selects standOut only with a missing specific impact; 80 equals WEIGHTS.contribution + clarity + specificity (35+25+20), not the clear-band boundary. Literal 100 suppresses improvement, matching the sum of all shared WEIGHTS; its <=2 bullet gate differs from the session's <=1 thin rule. `apps/web/src/cv/enrich/ScoreCard.tsx:75` -> `n >= 80`; `apps/web/src/cv/enrich/ScoreCard.tsx:97` -> `n !== 100`; `packages/shared/src/enrich.ts:7` -> `WEIGHTS`; `apps/web/src/cv/enrich/useFocusSession.ts:51` -> `length <= 1`
- ScorePill uses the same is-good styling for goodStart and needsWork; ScoreCard distinguishes needsWork with is-work. While scoring, the pill shows an ellipsis even if an old result exists. `apps/web/src/cv/enrich/ScorePill.tsx:7` -> `bandClass`; `apps/web/src/cv/enrich/ScoreCard.tsx:16` -> `bandClass`; `apps/web/src/cv/enrich/ScorePill.tsx:33` -> `text =`
- RoleScoreList separates roles from projects/volunteering, preserving input order within groups; rows default to scoring and route title focus through SCORED_LIST. `apps/web/src/cv/enrich/RoleScoreList.tsx:33` -> `scores.get`; `apps/web/src/cv/enrich/RoleScoreList.tsx:38` -> `onOpen(item.id, list)`; `apps/web/src/cv/enrich/RoleScoreList.tsx:53` -> `items.filter`
- tested by `apps/web/src/cv/enrich/score-card.test.tsx:69` -> `describe`; tested by `apps/web/src/cv/enrich/scores.test.tsx:205` -> `describe`

## Connections

- Used by the section panel and overview; actions open focus or retry score loading, not content mutation. `apps/web/src/cv/panel/SectionTools.tsx:81` -> `ScoreCard`; `apps/web/src/cv/enrich/ScoreCard.tsx:99` -> `onImprove`; `apps/web/src/cv/panel/Overview.tsx:109` -> `RoleScoreList`; `apps/web/src/cv/enrich/RoleScoreList.tsx:38` -> `onOpen`
- Used by role titles and weak-bullet tips; the adjacent editor hand-copies <75 and >=40, mirroring shared band/clearCount, so changing bands requires updating those markers too. `apps/web/src/cv/edit/sections/RoleItem.tsx:108` -> `ScorePill`; `apps/web/src/cv/enrich/ScorePill.tsx:40` -> `ScorePill`; `apps/web/src/cv/edit/sections/RoleItem.tsx:51` -> `score < 75`; `apps/web/src/cv/edit/sections/RoleItem.tsx:52` -> `score >= 40`; `packages/shared/src/enrich.ts:278` -> `75`; `packages/shared/src/enrich.ts:279` -> `40`
- Uses the exhaustive ScoredKind-to-list map: role -> experience, project -> projects, volunteering -> volunteering. `apps/web/src/cv/enrich/RoleScoreList.tsx:34` -> `SCORED_LIST[kind]`; `apps/web/src/cv/edit/lists.ts:20` -> `Record<ScoredKind, RoleList>`; `packages/shared/src/cv.ts:267` -> `ScoredKind`

## Assumptions

- Numeric grades and band inputs are already validated by the API client; these components render supplied results and do not regrade text. `apps/web/src/cv/enrich/ScoreCard.tsx:31` -> `score.result`; `apps/web/src/cv/enrich/enrich-api.ts:35` -> `RoleResultSchema`

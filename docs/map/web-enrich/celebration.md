---
id: web-enrich/celebration
area: web-enrich
files: ["apps/web/src/cv/enrich/CelebrateMoment.tsx","apps/web/src/cv/enrich/focus-mode.test.tsx"]
depends_on: ["web-enrich/focus-feedback","web-enrich/focus-acceptance","shared/enrichment-score"]
contract: false
checked_hash: 176f1b0a
cited: [4fac63, d26c8b, 2e2a5c, f38b7f, b64839, f10f1e, 9897f1, 56d52f, 10d58e, 9723d8, 6f664e]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Choose celebration copy and animate score increases with reduced-motion support.

- Celebration handles first score before perfect score, then clear-band improvement, then literal >=65 for almost; 65 is a UI-only cutoff with no shared numeric constant. Literal 100 mirrors total WEIGHTS, while clear uses shared band. `apps/web/src/cv/enrich/CelebrateMoment.tsx:17` -> `from === null`; `apps/web/src/cv/enrich/CelebrateMoment.tsx:18` -> `to === 100`; `apps/web/src/cv/enrich/CelebrateMoment.tsx:19` -> `band(to)`; `apps/web/src/cv/enrich/CelebrateMoment.tsx:20` -> `to >= 65`; `packages/shared/src/enrich.ts:7` -> `WEIGHTS`
- Reduced motion shows the final score immediately and omits confetti; otherwise the score animates over COUNT_MS=1400. `apps/web/src/cv/enrich/CelebrateMoment.tsx:7` -> `COUNT_MS`; `apps/web/src/cv/enrich/CelebrateMoment.tsx:27` -> `still ? to`; `apps/web/src/cv/enrich/CelebrateMoment.tsx:58` -> `!still`
- tested by `apps/web/src/cv/enrich/focus-mode.test.tsx:81` -> `describe`

## Connections

- Used by [focus-feedback](./focus-feedback.md) after a session emits celebrate; Next resumes the session. `apps/web/src/cv/enrich/FocusMode.tsx:329` -> `CelebrateMoment`; `apps/web/src/cv/enrich/CelebrateMoment.tsx:24` -> `CelebrateMoment`

## Assumptions

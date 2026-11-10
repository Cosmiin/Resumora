---
id: web-tailor/role-done
area: web-tailor
files: ["apps/web/src/tailor/role-done.ts","apps/web/src/tailor/role-done.test.tsx","apps/web/src/tailor/projects-step.test.tsx"]
depends_on: ["shared/match-score","shared/tailoring","web-tailor/client-section"]
contract: false
checked_hash: f66b11dd
cited: [5fac33, b69ba4, 11fb80, 0388be, 9afe5b, 8f98fe, ca9096, dc1c95, 3d9ef8, 31aab9, a5cb9e, 79dd9a, 4e577b, 221600, a570dd, 5fac33, 1e55ca, b70f98, 7a0c60]
decisions: []
open: []
---
Derive a role-completion message from saved scores and accepted text.

- nameOf resolves k: references directly and r<number> references by zero-based job requirement index. `apps/web/src/tailor/role-done.ts:10` -> `nameOf`
- newlyMet keeps labels now met but not previously met, with nonblank evidence found in normalized roleTexts. `apps/web/src/tailor/role-done.ts:25` -> `label.status`
- Names are unique and capped at local MAX_NAMED=2. `apps/web/src/tailor/role-done.ts:6` -> `MAX_NAMED`; `apps/web/src/tailor/role-done.ts:28` -> `names.includes`
- keptChanges excludes flagged proposals and explicit false decisions; unanswered inferred changes remain eligible. `apps/web/src/tailor/role-done.ts:35` -> `keptChanges`
- keptTexts concatenates original title/description/bullets plus kept proposal text, rather than reconstructing only final wording. `apps/web/src/tailor/role-done.ts:40` -> `keptTexts`
- Unchanged roles use nothing-changed text; increased score changes the title; no changes or no names suppresses the detail line. `apps/web/src/tailor/role-done.ts:58` -> `title`
- The button names the next role only within the same role step; crossing steps names the section, and no next section uses Finish. `apps/web/src/tailor/role-done.ts:65` -> `nextRole`
- tested by `apps/web/src/tailor/role-done.test.tsx:35` -> `describe`
- tested by `apps/web/src/tailor/projects-step.test.tsx:104` -> `it`

## Connections

- Used after acceptance to create roleDone phase copy. `apps/web/src/tailor/TailorFlow.tsx:114` -> `newlyMet`; `apps/web/src/tailor/role-done.ts:20` -> `newlyMet`; `apps/web/src/tailor/TailorFlow.tsx:113` -> `roleDone`; `apps/web/src/tailor/role-done.ts:56` -> `roleDone`
- Used by DoneScreen to resolve requirement labels. `apps/web/src/tailor/DoneScreen.tsx:19` -> `nameOf`; `apps/web/src/tailor/role-done.ts:10` -> `nameOf`

## Assumptions

- Evidence matching is case/whitespace-normalized substring matching across original and kept text; it does not prove causation of a score increase. `apps/web/src/tailor/role-done.ts:7` -> `norm`; `apps/web/src/tailor/role-done.ts:26` -> `text.includes`; `apps/web/src/tailor/role-done.ts:41` -> `role.title`

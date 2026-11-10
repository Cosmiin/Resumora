---
id: web-tailor/flow-redo
area: web-tailor
files: ["apps/web/src/tailor/TailorFlow.tsx","apps/web/src/tailor/redo.test.tsx","apps/web/src/tailor/role-review.test.tsx"]
depends_on: ["web-tailor/flow-state","web-tailor/client-run","web-tailor/client-section","web-tailor/answers","web-tailor/steering"]
contract: false
checked_hash: e08bddc5
cited: [b1595a, 744b34, f58bc9, fdd555, c99817, c16c6e, cab249, 9d0743, 7c8753, 3e42b6, b9afda, f58bc9, d725ba, 7c8753, 38df48, f4b22e, 8ebb18, ebca8b, c8df0c]
decisions: []
open: []
---
Revisit finished answers and restart steering without losing the return screen.

- Redo regenerates one role; if it is the current role, the result goes to ordinary review, otherwise to redo with a saved return phase. `apps/web/src/tailor/TailorFlow.tsx:127` -> `redo`
- Accepting an earlier redone role updates score and run, then restores review.resume. `apps/web/src/tailor/TailorFlow.tsx:139` -> `acceptRole`
- Opening current-role answers refetches the run before taking its currentRoleId. `apps/web/src/tailor/TailorFlow.tsx:150` -> `getRun`
- Opening steering first fetches stored steering; confirming changes calls changeSteering, remembers the returned run and enters it. `apps/web/src/tailor/TailorFlow.tsx:158` -> `getSteering`; `apps/web/src/tailor/TailorFlow.tsx:166` -> `changeSteering`
- Finished items are the prefix before currentRoleId until role steps are past, then the entire roleOrder. `apps/web/src/tailor/TailorFlow.tsx:205` -> `order`
- Backward navigation opens only from questions or review; non-role sections must precede the current step. `apps/web/src/tailor/TailorFlow.tsx:212` -> `settled`
- Finished non-role sections show read-only YourAnswers, while roles get an onUpdate callback invoking redo. `apps/web/src/tailor/TailorFlow.tsx:235` -> `YourAnswers`; `apps/web/src/tailor/TailorFlow.tsx:243` -> `onUpdate`
- tested by `apps/web/src/tailor/redo.test.tsx:58` -> `describe`
- tested by `apps/web/src/tailor/role-review.test.tsx:116` -> `it`

## Connections

- Opening answers after another tab advances can pair the freshly fetched currentRoleId with the previous role review stored in resume; closing restores those old proposals while track retains the new run position. `apps/web/src/tailor/TailorFlow.tsx:150` -> `track`; `apps/web/src/tailor/TailorFlow.tsx:151` -> `resume: review`; `apps/web/src/tailor/TailorFlow.tsx:243` -> `onClose`

- Uses the redo client and role acceptance client; their route contracts live in client-section. `apps/web/src/tailor/TailorFlow.tsx:130` -> `redoRole`; `apps/web/src/tailor/tailor-api.ts:74` -> `redoRole`
- Uses confirmation before replacing steering. `apps/web/src/tailor/TailorFlow.tsx:229` -> `SteerConfirm`; `apps/web/src/tailor/SteeringStep.tsx:92` -> `SteerConfirm`

## Assumptions

- The remembered resume phase is browser state; successful old-role acceptance does not rebuild that phase's drafts or proposals. `apps/web/src/tailor/TailorFlow.tsx:143` -> `setPhase(review.resume)`

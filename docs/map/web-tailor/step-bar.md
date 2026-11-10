---
id: web-tailor/step-bar
area: web-tailor
files: ["apps/web/src/tailor/StepBar.tsx","apps/web/src/tailor/tailor-flow.test.tsx","apps/web/src/tailor/redo.test.tsx"]
depends_on: ["web-tailor/flow","web-tailor/flow-redo"]
contract: false
checked_hash: ba7a5ad1
cited: [cd1767, 2fc0f2, f2f632, f2fba7, f39123, e39a75, 0fea3c, 7dc335, 6872e6, 174042, 13f25a, 1cd130, f7a352, f2fba7]
decisions: []
open: []
---
Render ordered progress and only the backward-navigation targets permitted by the flow.

- Null current sets the index to sections.length, marking every listed section done. `apps/web/src/tailor/StepBar.tsx:17` -> `index`
- Steering is shown as a completed clickable step only when onSteer exists. `apps/web/src/tailor/StepBar.tsx:20` -> `onSteer`
- Current section has aria-current=step; classes distinguish earlier and current positions. `apps/web/src/tailor/StepBar.tsx:21` -> `aria-current`
- A section becomes a button only when onOpen exists and open includes it. `apps/web/src/tailor/StepBar.tsx:23` -> `open.includes`
- The score is hidden without base; differing latest values use the base/latest message even if latest is lower. `apps/web/src/tailor/StepBar.tsx:28` -> `base !== null`
- tested by `apps/web/src/tailor/tailor-flow.test.tsx:150` -> `it`
- tested by `apps/web/src/tailor/redo.test.tsx:59` -> `it`

## Connections

- Uses the flow's settled-phase open list. `apps/web/src/tailor/TailorFlow.tsx:216` -> `open`; `apps/web/src/tailor/TailorFlow.tsx:302` -> `StepBar`; `apps/web/src/tailor/StepBar.tsx:16` -> `StepBar`
- Uses global tailor-steps is-done/is-current styling. `apps/web/src/tailor/StepBar.tsx:22` -> `is-done`; `apps/web/src/styles/tailor.css:17` -> `.tailor-steps li.is-done`; `apps/web/src/styles/tailor.css:18` -> `.tailor-steps li.is-current`

## Assumptions

- The component trusts the caller's open list and does not independently check whether a step has been saved. `apps/web/src/tailor/StepBar.tsx:23` -> `open.includes`

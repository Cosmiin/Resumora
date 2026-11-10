---
id: web-tailor/moment
area: web-tailor
files: ["apps/web/src/tailor/TailorMoment.tsx","apps/web/src/tailor/role-done.test.tsx","apps/web/src/tailor/done-screen.test.tsx"]
depends_on: ["web-enrich/celebration"]
contract: false
checked_hash: c2a1da50
decisions: []
open: []
---
Animate completion scores with reduced-motion handling and shared celebration styling.

- Reduced-motion preference is sampled once through a ref; start defaults from from, then to, then zero. `apps/web/src/tailor/TailorMoment.tsx:17` -> `still`
- The counter uses cubic easing over COUNT_MS=1400 and rounds the displayed value. `apps/web/src/tailor/TailorMoment.tsx:3` -> `COUNT_MS`; `apps/web/src/tailor/TailorMoment.tsx:29` -> `COUNT_MS`
- The effect focuses the optional button, skips animation for reduced motion or null target, and cancels its frame on cleanup. `apps/web/src/tailor/TailorMoment.tsx:23` -> `focus`; `apps/web/src/tailor/TailorMoment.tsx:34` -> `cancelAnimationFrame`
- Confetti appears only for non-reduced-motion increases with both scores non-null. `apps/web/src/tailor/TailorMoment.tsx:45` -> `to > from`
- Children select has-more layout; null shown score omits the numeric element, and a missing button omits navigation. `apps/web/src/tailor/TailorMoment.tsx:37` -> `has-more`
- tested by `apps/web/src/tailor/role-done.test.tsx:94` -> `it`
- tested by `apps/web/src/tailor/done-screen.test.tsx:36` -> `it`

## Connections

- Used by role completion and final DoneScreen. `apps/web/src/tailor/TailorFlow.tsx:254` -> `TailorMoment`; `apps/web/src/tailor/DoneScreen.tsx:51` -> `TailorMoment`; `apps/web/src/tailor/TailorMoment.tsx:16` -> `TailorMoment`
- Uses global fm-moment/fm-confetti animation and tailor-moment.has-more positioning. `apps/web/src/tailor/TailorMoment.tsx:38` -> `fm-moment`; `apps/web/src/styles/focus.css:126` -> `.fm-moment`; `apps/web/src/tailor/TailorMoment.tsx:45` -> `fm-confetti`; `apps/web/src/styles/focus.css:137` -> `.fm-confetti`; `apps/web/src/styles/tailor.css:105` -> `.tailor-moment.has-more`

## Assumptions

- The component expects browser animation APIs when motion is enabled; it guards matchMedia availability but invokes requestAnimationFrame directly. `apps/web/src/tailor/TailorMoment.tsx:10` -> `matchMedia`; `apps/web/src/tailor/TailorMoment.tsx:33` -> `requestAnimationFrame`

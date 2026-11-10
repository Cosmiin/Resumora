---
id: web-tailor/moment
area: web-tailor
files: ["apps/web/src/tailor/TailorMoment.tsx","apps/web/src/tailor/role-done.test.tsx","apps/web/src/tailor/done-screen.test.tsx"]
depends_on: ["web-enrich/celebration"]
contract: false
checked_hash: c2a1da50
cited: [038de0, db9f99, 95ccb9, 169414, 45dce9, 473e70, fe61b7, fb3e13, fe8f8b, 2d8f8f, 7120d0, b64399, 76646e, fe8f8b, 56f79d, d11953, 7eb0eb, 473e70, dfbdaa, d2fe18, 0a2f95, 71ef0a]
decisions: []
open: []
---
Animate completion scores with reduced-motion handling and shared celebration styling.

- Reduced-motion preference is sampled once through a ref; start defaults from from, then to, then zero. `apps/web/src/tailor/TailorMoment.tsx:17` -> `still`
- The counter uses cubic easing over COUNT_MS=1400 and rounds the displayed value. `apps/web/src/tailor/TailorMoment.tsx:3` -> `COUNT_MS`; `apps/web/src/tailor/TailorMoment.tsx:29` -> `COUNT_MS`
- The effect focuses the optional button, skips animation for reduced motion or null target, and cancels its frame on cleanup. `apps/web/src/tailor/TailorMoment.tsx:23` -> `focus`; `apps/web/src/tailor/TailorMoment.tsx:34` -> `cancelAnimationFrame`
- Confetti appears only for non-reduced-motion increases with both scores non-null. `apps/web/src/tailor/TailorMoment.tsx:45` -> `to > from`
- Truthy children select has-more layout; null shown score omits the numeric element, and a missing button omits only that button; DoneScreen supplies navigation through children. `apps/web/src/tailor/TailorMoment.tsx:37` -> `has-more`; `apps/web/src/tailor/TailorMoment.tsx:43` -> `button`; `apps/web/src/tailor/DoneScreen.tsx:51` -> `TailorMoment`; `apps/web/src/tailor/DoneScreen.tsx:63` -> `nav`
- tested by `apps/web/src/tailor/role-done.test.tsx:94` -> `it`
- tested by `apps/web/src/tailor/done-screen.test.tsx:36` -> `it`

## Connections

- Used by role completion and final DoneScreen. `apps/web/src/tailor/TailorFlow.tsx:254` -> `TailorMoment`; `apps/web/src/tailor/DoneScreen.tsx:51` -> `TailorMoment`; `apps/web/src/tailor/TailorMoment.tsx:16` -> `TailorMoment`
- Uses global fm-moment/fm-confetti animation and tailor-moment.has-more positioning. `apps/web/src/tailor/TailorMoment.tsx:38` -> `fm-moment`; `apps/web/src/styles/focus.css:126` -> `.fm-moment`; `apps/web/src/tailor/TailorMoment.tsx:45` -> `fm-confetti`; `apps/web/src/styles/focus.css:137` -> `.fm-confetti`; `apps/web/src/styles/tailor.css:105` -> `.tailor-moment.has-more`

## Assumptions

- The component expects browser animation APIs when motion is enabled; it guards matchMedia availability but invokes requestAnimationFrame directly. `apps/web/src/tailor/TailorMoment.tsx:10` -> `matchMedia`; `apps/web/src/tailor/TailorMoment.tsx:33` -> `requestAnimationFrame`

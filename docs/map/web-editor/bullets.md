---
id: web-editor/bullets
area: web-editor
files: ["apps/web/src/cv/edit/BulletList.tsx","apps/web/src/cv/edit/bullets.test.tsx"]
depends_on: ["web-editor/reducer","web-editor/page-fields","web-editor/focus","shared/cv"]
contract: false
checked_hash: 9abb831e
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Edit bullet lines with split/join keyboard behavior and optional enrichment markers.

- Composition events are ignored; plain Enter removes selected text, splits at the caret and schedules focus on the new bullet. `apps/web/src/cv/edit/BulletList.tsx:61` -> `isComposing`; `apps/web/src/cv/edit/BulletList.tsx:67` -> `end > start`
- Shift+Enter is left to the textarea; Backspace joins only at a collapsed caret at zero and only when a previous bullet exists. `apps/web/src/cv/edit/BulletList.tsx:63` -> `!e.shiftKey`; `apps/web/src/cv/edit/BulletList.tsx:73` -> `Backspace`
- Join caret position comes from the previous bullet's current DOM value; focus runs in requestAnimationFrame after the edit. `apps/web/src/cv/edit/BulletList.tsx:75` -> `readText`; `apps/web/src/cv/edit/BulletList.tsx:120` -> `focusLater`; `apps/web/src/cv/edit/BulletList.tsx:127` -> `const readText`
- Bullet rows are memoized and rebuild their owner only when the owner list or item ID changes. `apps/web/src/cv/edit/BulletList.tsx:35` -> `memo`; `apps/web/src/cv/edit/BulletList.tsx:47` -> `useMemo`
- Inline ImproveButton is rendered only for nonblank experience bullets, even though reducer bullet operations support other scored lists. `apps/web/src/cv/edit/BulletList.tsx:110` -> `ownerList === "experience"`
- Weak marks toggle a tip and carry aria-expanded/describedby; marks are supplied by bullet ID. `apps/web/src/cv/edit/BulletList.tsx:85` -> `mark &&`; `apps/web/src/cv/edit/BulletList.tsx:146` -> `marks?.get`
- tested by `apps/web/src/cv/edit/bullets.test.tsx:38` -> `describe("BulletList"`

## Connections

- Uses reducer splitting/joining and shared owner lookup: `apps/web/src/cv/edit/BulletList.tsx:71` -> `splitBullet`; `apps/web/src/cv/edit/cvReducer.ts:205` -> `case "splitBullet"`; `apps/web/src/cv/edit/BulletList.tsx:76` -> `joinBullet`; `apps/web/src/cv/edit/cvReducer.ts:215` -> `case "joinBullet"`
- Uses the web-enrich opener: `apps/web/src/cv/edit/BulletList.tsx:110` -> `ImproveButton`; `apps/web/src/cv/enrich/ImproveButton.tsx:5` -> `ImproveButton`
- Uses global .cv-bullets and .weak-mark/.weak-tip visibility rules: `apps/web/src/cv/edit/BulletList.tsx:133` -> `cv-bullets`; `apps/web/src/styles/cv-page.css:38` -> `.cv-bullets`; `apps/web/src/cv/edit/BulletList.tsx:89` -> `weak-mark`; `apps/web/src/styles/enrich.css:39` -> `.weak-mark`; `apps/web/src/cv/edit/BulletList.tsx:96` -> `weak-tip`; `apps/web/src/styles/enrich.css:43` -> `.weak-tip`; `apps/web/src/styles/enrich.css:44` -> `.weak-tip.is-open`

## Assumptions

- Bullet IDs must identify a single field within the list root because focus queries select the first match. `apps/web/src/cv/edit/BulletList.tsx:103` -> `fieldKey`; `apps/web/src/cv/edit/BulletList.tsx:128` -> `querySelector`
- Capacity enforcement belongs to the reducer; a requested split/add can be rejected even though the UI schedules focus. `apps/web/src/cv/edit/BulletList.tsx:71` -> `splitBullet`; `apps/web/src/cv/edit/cvReducer.ts:206` -> `if (full)`

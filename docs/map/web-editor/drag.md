---
id: web-editor/drag
area: web-editor
files: ["apps/web/src/cv/edit/DragList.tsx","apps/web/src/cv/edit/DragGrip.tsx","apps/web/src/cv/edit/drag.test.tsx"]
depends_on: []
contract: false
checked_hash: cb4ceeec
cited: [5eabc1, 89d0bd, 7e3b55, 496b38, 32c5c9, afeb09, ec231f, 545ae3, cad4af, 1cf4aa, 31b8a1, dfb6ea, 720c5c, c18c70, 4afe5e, 3429ed, a49cf1, a49cf1, e9e17c, a0c9d5, d3fa39, 977b18, bb2237, 25b255, dfb6ea, 68f8c6, 749f55, 0b8f06, 927695, 2a2b71, 07055a, da7b2f]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Reorder ID-bearing rows through pointer, touch and keyboard grips.

- Pointer movement starts at four pixels; touch uses a 250ms delay with five-pixel tolerance. `apps/web/src/cv/edit/DragList.tsx:69` -> `useSensors`
- Space picks up/drops a row; arrows move immediately within bounds; Escape moves it back to the original index and stops propagation. `apps/web/src/cv/edit/DragList.tsx:102` -> `e.key === " "`; `apps/web/src/cv/edit/DragList.tsx:111` -> `ArrowUp`; `apps/web/src/cv/edit/DragList.tsx:118` -> `Escape`
- After moving, a layout effect finds the matching data-grip anywhere in the document and restores focus. `apps/web/src/cv/edit/DragList.tsx:80` -> `useLayoutEffect`
- Blur drops a picked item unless a move is waiting to restore its focus. `apps/web/src/cv/edit/DragList.tsx:136` -> `onGripBlur`
- Pointer drop does nothing without a different valid target; valid IDs are translated to current array indices. `apps/web/src/cv/edit/DragList.tsx:141` -> `onDragEnd`
- Rows use dnd-kit transforms and pointer listeners but discard its attributes in favor of explicit grip labels and pressed state. `apps/web/src/cv/edit/DragList.tsx:41` -> `useSortable`; `apps/web/src/cv/edit/DragGrip.tsx:22` -> `pointer`; `apps/web/src/cv/edit/DragGrip.tsx:27` -> `aria-label`
- Keyboard move announcements use an assertive live region; the row wrapper class is configurable. `apps/web/src/cv/edit/DragList.tsx:101` -> `setMessage`; `apps/web/src/cv/edit/DragList.tsx:154` -> `aria-live="assertive"`; `apps/web/src/cv/edit/DragList.tsx:167` -> `rowClassName`
- tested by `apps/web/src/cv/edit/drag.test.tsx:42` -> `describe("reordering by keyboard"`

## Connections

- Used by role rows and overview section rows: `apps/web/src/cv/edit/sections/RolesEdit.tsx:36` -> `<DragList`; `apps/web/src/cv/panel/Overview.tsx:115` -> `<DragList`; `apps/web/src/cv/edit/DragList.tsx:68` -> `DragList`
- Uses global .drag-row/.is-dragging and .drag-grip visibility/touch rules: `apps/web/src/cv/edit/DragList.tsx:68` -> `"drag-row"`; `apps/web/src/styles/cv-page.css:145` -> `.drag-row`; `apps/web/src/cv/edit/DragList.tsx:46` -> `is-dragging`; `apps/web/src/styles/cv-page.css:146` -> `.drag-row.is-dragging`; `apps/web/src/cv/edit/DragGrip.tsx:25` -> `drag-grip`; `apps/web/src/styles/cv-page.css:147` -> `.drag-grip`; `apps/web/src/styles/cv-page.css:153` -> `.drag-grip`
- Uses global .sr-only to hide announcements visually, and panel .sec-row overrides the grip's absolute positioning: `apps/web/src/cv/edit/DragList.tsx:154` -> `sr-only`; `apps/web/src/styles/cv-page.css:144` -> `.sr-only`; `apps/web/src/cv/panel/Overview.tsx:119` -> `sec-row`; `apps/web/src/styles/panel.css:22` -> `.sec-row .drag-grip`

## Assumptions

- IDs must be unique among document grips for the global refocus loop to find the intended list. `apps/web/src/cv/edit/DragList.tsx:84` -> `document.querySelectorAll`; `apps/web/src/cv/edit/DragList.tsx:85` -> `el.dataset`
- The parent must apply onMove and pass the reordered items back; DragList does not mutate the array. `apps/web/src/cv/edit/DragList.tsx:116` -> `onMove(index, to)`; `apps/web/src/cv/edit/DragList.tsx:157` -> `items.map`

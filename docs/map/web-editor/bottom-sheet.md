---
id: web-editor/bottom-sheet
area: web-editor
files: ["apps/web/src/cv/panel/BottomSheet.tsx","apps/web/src/cv/panel/bottom-sheet.test.tsx"]
depends_on: []
contract: false
checked_hash: 95681691
cited: [ea03a1, b8547f, 0bbd16, 2dd3db, e17ca8, 3d5270, dbf88b, eb462c, 57887c, d3c650, 2132e3, 46d501, b8547f, b7b8d5, 162bfe, 2cb6f4, d0a74a, 39408f, a99d43, f5909e, 57887c, 7e2c0c, ae8b6e, 1df5b2, eb462c, 95191f, 9250d6]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Expose mobile helper-panel expansion through a two-state controlled sheet.

- The sheet is controlled by peek/full props rather than storing its own expansion state. `apps/web/src/cv/panel/BottomSheet.tsx:4` -> `SheetState`; `apps/web/src/cv/panel/BottomSheet.tsx:11` -> `BottomSheet`
- A pointer release changes state only when absolute vertical movement exceeds 40 pixels; upward opens and downward peeks. `apps/web/src/cv/panel/BottomSheet.tsx:8` -> `DRAG_DISTANCE`; `apps/web/src/cv/panel/BottomSheet.tsx:15` -> `release`
- The click following a recognized drag is suppressed so it does not immediately toggle the new state. `apps/web/src/cv/panel/BottomSheet.tsx:43` -> `onClick`
- Escape anywhere in the sheet requests peek; pointer cancellation clears the stored starting point. `apps/web/src/cv/panel/BottomSheet.tsx:28` -> `onKeyDown`; `apps/web/src/cv/panel/BottomSheet.tsx:42` -> `onPointerCancel`
- aria-expanded follows full state and children remain mounted in the sheet body for both states. `apps/web/src/cv/panel/BottomSheet.tsx:36` -> `aria-expanded`; `apps/web/src/cv/panel/BottomSheet.tsx:49` -> `children`
- tested by `apps/web/src/cv/panel/bottom-sheet.test.tsx:64` -> `describe("bottom sheet on phones"`

## Connections

- Used by Editor below its 899px media query; focusing the page returns the sheet to peek: `apps/web/src/cv/Editor.tsx:91` -> `899px`; `apps/web/src/cv/Editor.tsx:258` -> `<BottomSheet`; `apps/web/src/cv/panel/BottomSheet.tsx:11` -> `BottomSheet`; `apps/web/src/cv/Editor.tsx:231` -> `setSheet("peek")`
- Uses global .sheet/.peek/.full for fixed positioning and 176px/80vh height bounds: `apps/web/src/cv/panel/BottomSheet.tsx:27` -> `sheet`; `apps/web/src/styles/editor.css:93` -> `.sheet`; `apps/web/src/styles/editor.css:99` -> `.sheet.peek`; `apps/web/src/styles/editor.css:100` -> `.sheet.full`
- Uses global .sheet-grip touch behavior and .sheet-body overflow; stage padding prevents overlap at the document bottom: `apps/web/src/cv/panel/BottomSheet.tsx:34` -> `sheet-grip`; `apps/web/src/styles/editor.css:101` -> `touch-action: none`; `apps/web/src/cv/panel/BottomSheet.tsx:49` -> `sheet-body`; `apps/web/src/styles/editor.css:105` -> `overflow-y: auto`; `apps/web/src/styles/editor.css:108` -> `.editor-workspace:has(.sheet)`

## Assumptions

- The parent must reflect onStateChange into state for gestures and aria-expanded to update. `apps/web/src/cv/panel/BottomSheet.tsx:6` -> `onStateChange`; `apps/web/src/cv/panel/BottomSheet.tsx:36` -> `state ===`
- Gesture completion depends on the grip receiving pointerup/cancel; this component does not capture the pointer. `apps/web/src/cv/panel/BottomSheet.tsx:37` -> `onPointerDown`; `apps/web/src/cv/panel/BottomSheet.tsx:41` -> `onPointerUp`

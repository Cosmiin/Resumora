---
id: web-editor/focus
area: web-editor
files: ["apps/web/src/cv/edit/focus.ts","apps/web/src/cv/edit/useFocusAfterRender.ts","apps/web/src/cv/edit/useFocusSection.ts","apps/web/src/cv/edit/useOpenedSections.ts","apps/web/src/cv/edit/focus-keeps.test.tsx"]
depends_on: ["shared/categories"]
contract: false
checked_hash: 6e0f3201
cited: [fe4ba4, bb3642, 10a21e, 80b755, 7c2297, 13d297, 6cd555, da55bb, 9933a7, 8d407f, a47e16, 4226a1, 46cb77, bc6988, edc1be, 4f747a, ad1e9f, a1ba68, 7d41c8, dca685, 49da8f, 5bc1ca, 12e68b, 0eabfd, 4ee0b5, edc1be]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Track section focus and restore keyboard focus after structural edits.

- focusField searches inside a supplied root by CSS-escaped data-field; a missing target is a no-op and an omitted caret means end of text. `apps/web/src/cv/edit/focus.ts:2` -> `focusField`
- Selection errors are swallowed after focusing, allowing focus on fields without selection support. `apps/web/src/cv/edit/focus.ts:7` -> `el.focus`
- useFocusAfterRender stores one pending key and schedules its own render, so a focus request works even without a data edit. `apps/web/src/cv/edit/useFocusAfterRender.ts:12` -> `useEffect`; `apps/web/src/cv/edit/useFocusAfterRender.ts:18` -> `useCallback`
- Section tracking finds the closest data-section and data-item on focusin and reuses the previous state for an unchanged pair. `apps/web/src/cv/edit/useFocusSection.ts:20` -> `onFocusIn`
- Escape blurs the page field and clears focus unless a pressed drag grip owns the event; empty-space mousedown does the same. `apps/web/src/cv/edit/useFocusSection.ts:27` -> `onKeyDown`; `apps/web/src/cv/edit/useFocusSection.ts:32` -> `onMouseDown`
- The returned clear callback clears selection state without calling the internal leave function that also blurs. `apps/web/src/cv/edit/useFocusSection.ts:48` -> `return [focus`
- The opened-section set adds immutably and is only emptied by clear; it has no persistence call. `apps/web/src/cv/edit/useOpenedSections.ts:8` -> `useOpenedSections`
- tested by `apps/web/src/cv/edit/focus-keeps.test.tsx:26` -> `describe("sections stay`; `apps/web/src/cv/edit/focus-keeps.test.tsx:64` -> `describe("Escape`

## Connections

- Used by Editor to choose helper-panel context: `apps/web/src/cv/Editor.tsx:73` -> `useFocusSection`; `apps/web/src/cv/edit/useFocusSection.ts:10` -> `useFocusSection`; `apps/web/src/cv/Editor.tsx:200` -> `focus={sectionFocus}`
- Uses data-field emitted by PageField: `apps/web/src/cv/edit/focus.ts:4` -> `data-field`; `apps/web/src/cv/edit/PageField.tsx:77` -> `"data-field"`
- Uses data-section/data-item emitted by editable sections and role rows: `apps/web/src/cv/edit/useFocusSection.ts:22` -> `data-section`; `apps/web/src/cv/edit/EditablePage.tsx:99` -> `data-section`; `apps/web/src/cv/edit/useFocusSection.ts:24` -> `data-item`; `apps/web/src/cv/edit/sections/RoleItem.tsx:105` -> `data-item`
- DragGrip's pressed marker prevents section Escape handling from swallowing drag cancellation: `apps/web/src/cv/edit/useFocusSection.ts:29` -> `data-grip`; `apps/web/src/cv/edit/DragGrip.tsx:26` -> `data-grip`; `apps/web/src/cv/edit/DragGrip.tsx:29` -> `aria-pressed`

## Assumptions

- DOM section strings are cast to CategoryKey without validation, so renderers must emit recognized keys. `apps/web/src/cv/edit/useFocusSection.ts:25` -> `as CategoryKey`
- The browser must provide CSS.escape and focusable input/textarea targets. `apps/web/src/cv/edit/focus.ts:3` -> `HTMLInputElement`; `apps/web/src/cv/edit/focus.ts:4` -> `CSS.escape`

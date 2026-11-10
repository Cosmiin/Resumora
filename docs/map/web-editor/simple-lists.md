---
id: web-editor/simple-lists
area: web-editor
files: ["apps/web/src/cv/edit/sections/SimpleListEdit.tsx"]
depends_on: ["web-editor/reducer","web-editor/page-fields","web-editor/bullets","web-editor/drag","web-editor/focus","web-editor/section-controls"]
contract: false
checked_hash: b6a6c14f
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Render configured short lists and retain hidden enrichment items in the editor.

- CONFIG exhaustively covers the local SimpleList union: languages, certifications, awards, courses and publications. `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:15` -> `SimpleList`; `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:30` -> `CONFIG`
- Only courses, awards and publications qualify for line bullets and hide/show actions. `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:64` -> `hasLines`
- Rows coerce configured fields to strings and use the main text as their label, with a translated fallback. `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:78` -> `CONFIG[list]`; `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:105` -> `aria-label`
- A hidden row remains editable and receives is-hidden; toggling dispatches setItemHidden rather than removing data. `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:85` -> `const hidden`; `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:105` -> `is-hidden`
- Optional enrichment bullets render only when the existing bullets array is nonempty; this renderer supplies no add-bullet button. `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:143` -> `Array.isArray`
- Adding an item focuses the configured main field, which is title for publications and name for the other lists. `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:52` -> `field: "title"`; `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:164` -> `const add`
- Configured multiline descriptions use MAX_LONG_TEXT, while date fields commit via ItemDate. `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:97` -> `MAX_LONG_TEXT`; `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:110` -> `<ItemDate`

## Connections

- Used by the renderer registry's simple wrapper: `apps/web/src/cv/edit/sections/renderers.tsx:14` -> `SimpleListEdit`; `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:151` -> `SimpleListEdit`
- Uses reducer list-local hide/show updates: `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:87` -> `setItemHidden`; `apps/web/src/cv/edit/cvReducer.ts:324` -> `case "setItemHidden"`
- Uses global .cv-line.is-hidden and .cv-hide so hidden content dims while its show control remains legible: `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:105` -> `is-hidden`; `apps/web/src/styles/cv-page.css:188` -> `.cv-line.is-hidden`; `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:123` -> `cv-hide`; `apps/web/src/styles/cv-page.css:189` -> `.cv-hide`
- Uses global non-role .cv-item-dates sizing and .cv-item-details layout: `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:109` -> `cv-item-dates`; `apps/web/src/styles/cv-page.css:132` -> `.cv-line:not(.cv-role)`; `apps/web/src/styles/cv-page.css:133` -> `min-width: 9ch`; `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:130` -> `cv-item-details`; `apps/web/src/styles/cv-page.css:115` -> `.cv-item-details`

## Assumptions

- CONFIG field names must match actual item properties; the reducer refuses absent fields even though display falls back to an empty string. `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:79` -> `String(item[field]`; `apps/web/src/cv/edit/cvReducer.ts:188` -> `field in item`
- The component trusts its cast of an existing bullets array; complete bullet validation happens at the save boundary. `apps/web/src/cv/edit/sections/SimpleListEdit.tsx:144` -> `as Bullet[]`; `apps/web/src/cv/useAutosave.ts:175` -> `safeParse`

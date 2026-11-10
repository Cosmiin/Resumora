---
id: web-editor/section-controls
area: web-editor
files: ["apps/web/src/cv/edit/SectionHeading.tsx","apps/web/src/cv/edit/SectionMenu.tsx","apps/web/src/cv/edit/HiddenSections.tsx","apps/web/src/cv/edit/sections/AddButton.tsx","apps/web/src/cv/edit/sections/RemoveButton.tsx","apps/web/src/cv/edit/section-menu.test.tsx"]
depends_on: ["web-editor/reducer","web-editor/page-fields","shared/categories","web-editor/reducer-sections"]
contract: false
checked_hash: f56b1451
cited: [955f6b, e4c18d, f87754, 5badbf, d89814, f695e2, f4d013, 1d3b77, b0ec0a, 089659, 5f9f6c, f7600b, 75d711, 6530d0, ed5cc0, e1907d, 49673f, ab7f3d, 440d11, 5badbf, f1e984, 4cac98, 5c394a, c82a0b, 5d9d6a, afe9cf, 78da66, 5f9f6c, 575b4e, bf7ae3, f7600b, 9d48bf, 25b255, 4cac98, afe9cf, 494be2, e923e9, 6e2380, 955f6b]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Provide heading edits, section menus, hidden-section recovery and shared add/remove controls.

- A heading stores only the override; the shared category label is its placeholder and clearing text dispatches an empty override. `apps/web/src/cv/edit/SectionHeading.tsx:19` -> `CATEGORY`; `apps/web/src/cv/edit/SectionHeading.tsx:21` -> `setSectionTitle`; `apps/web/src/cv/edit/SectionHeading.tsx:30` -> `placeholder`
- Heading controls wrap the heading in cv-section-head only when after is supplied. `apps/web/src/cv/edit/SectionHeading.tsx:36` -> `return after`
- Opening a section menu focuses its first action and adds an outside-pointer listener; choosing an action closes first. `apps/web/src/cv/edit/SectionMenu.tsx:20` -> `useEffect`; `apps/web/src/cv/edit/SectionMenu.tsx:30` -> `choose`
- Escape closes and refocuses the opener; arrow keys wrap among menu items, whose tabIndex is -1. `apps/web/src/cv/edit/SectionMenu.tsx:34` -> `onKeyDown`; `apps/web/src/cv/edit/SectionMenu.tsx:62` -> `role="menuitem"`
- HiddenSections renders nothing for an empty list; otherwise it counts empty entries and invokes onShow for an individual key. `apps/web/src/cv/edit/HiddenSections.tsx:11` -> `sections.length`; `apps/web/src/cv/edit/HiddenSections.tsx:31` -> `onShow`
- AddButton and RemoveButton are ordinary focusable buttons without an internal capacity check or delete confirmation. `apps/web/src/cv/edit/sections/AddButton.tsx:4` -> `<button`; `apps/web/src/cv/edit/sections/RemoveButton.tsx:5` -> `<button`
- tested by `apps/web/src/cv/edit/section-menu.test.tsx:46` -> `describe("tailored CV section menu`

## Connections

- Used by EditablePage to dispatch delete and preserve a section-only undo snapshot: `apps/web/src/cv/edit/EditablePage.tsx:80` -> `<SectionMenu`; `apps/web/src/cv/edit/SectionMenu.tsx:13` -> `SectionMenu`; `apps/web/src/cv/edit/EditablePage.tsx:85` -> `setDeleted`; `apps/web/src/cv/edit/cvReducer.ts:291` -> `case "restoreSection"`
- Uses global .cv-label placeholder styling and .cv-section-head layout: `apps/web/src/cv/edit/SectionHeading.tsx:27` -> `cv-label`; `apps/web/src/styles/cv-page.css:69` -> `input.cv-label::placeholder`; `apps/web/src/cv/edit/SectionHeading.tsx:36` -> `cv-section-head`; `apps/web/src/styles/cv-page.css:164` -> `.cv-section-head`
- Uses global .section-menu/.section-menu-list and .hidden-sections: `apps/web/src/cv/edit/SectionMenu.tsx:54` -> `section-menu`; `apps/web/src/styles/cv-page.css:167` -> `.section-menu`; `apps/web/src/cv/edit/SectionMenu.tsx:60` -> `section-menu-list`; `apps/web/src/styles/cv-page.css:170` -> `.section-menu-list`; `apps/web/src/cv/edit/HiddenSections.tsx:16` -> `hidden-sections`; `apps/web/src/styles/cv-page.css:174` -> `.hidden-sections`
- Uses global .adder/.remover opacity rules; hover/focus reveals them and the later touch override keeps them visible without hover: `apps/web/src/cv/edit/sections/AddButton.tsx:4` -> `adder`; `apps/web/src/styles/cv-page.css:121` -> `.adder`; `apps/web/src/styles/cv-page.css:122` -> `:focus-within`; `apps/web/src/cv/edit/sections/RemoveButton.tsx:5` -> `remover`; `apps/web/src/styles/cv-page.css:124` -> `.remover`; `apps/web/src/styles/cv-page.css:153` -> `opacity: 0.55`
- Global print rules suppress section menus and hidden-section controls: `apps/web/src/cv/edit/SectionMenu.tsx:54` -> `section-menu`; `apps/web/src/cv/edit/HiddenSections.tsx:16` -> `hidden-sections`; `apps/web/src/styles/cv-page.css:184` -> `display: none`

## Assumptions

- Delete safety and visibility belong to the caller: this component directly invokes its supplied action. `apps/web/src/cv/edit/SectionMenu.tsx:51` -> `onDelete`; `apps/web/src/cv/edit/SectionMenu.tsx:32` -> `action()`
- Heading category/locale pairs must exist in the shared category table. `apps/web/src/cv/edit/SectionHeading.tsx:19` -> `CATEGORY[sectionKey].label[locale]`

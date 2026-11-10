---
id: web-editor/editable-page
area: web-editor
files: ["apps/web/src/cv/edit/EditablePage.tsx","apps/web/src/cv/edit/MissingBox.tsx","apps/web/src/cv/edit/sections/renderers.tsx","apps/web/src/cv/edit/sections/types.ts","apps/web/src/cv/edit/editable-page.test.tsx"]
depends_on: ["web-editor/reducer","web-editor/focus","web-editor/section-controls","web-editor/role-editors","web-editor/text-sections","web-editor/chips","web-editor/simple-lists","web-editor/templates","shared/categories","web-editor/reducer-sections"]
contract: false
checked_hash: 13a5f03b
cited: [a3f680, 53bf5d, b65070, 5f6cd3, 10a21e, 305c55, de1aef, d49478, 4b6813, 0debeb, 14c86a, cc70b8, 9935a2, d13cc2, 13f643, c1ea7f, 012901, 03ef67, 8d3034, eb30b7, a3516a, b48636, 63dfe2, ec10cf, 9f4719, 7a2284, 1cfd86, e8177e, 8d3034, ec516c, d096c1, f1e9cc, 0debeb, 05854c, 0587cf, a9f775, 56ef2c, 1b6cb9, 5f13ee, 38201e, c622e3, 5d3f02, 6431e2, e0bf30, c8b5a8]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Choose editable section bodies, preserve open empty sections and route section creation to its first field.

- HeaderEdit receives tailored and template so tailored photos follow the chosen slot without editing controls. `apps/web/src/cv/edit/EditablePage.tsx:93` -> `tailored={tailored}`
- Layout order is normalized; base mode uses sectionsOnCv while tailored mode initially counts only nonempty sections. `apps/web/src/cv/edit/EditablePage.tsx:59` -> `normalizeLayout`
- Sections on the page are added to the visit's opened set, keeping them editable after their contents are cleared. `apps/web/src/cv/edit/EditablePage.tsx:64` -> `useEffect`
- Adding a section dispatches addSection, records it as opened, then schedules its first field for focus after rendering; summary and skills only unhide existing content, without creating data. `apps/web/src/cv/edit/EditablePage.tsx:51` -> `dispatch`; `apps/web/src/cv/edit/useFocusAfterRender.ts:12` -> `useEffect`; `apps/web/src/cv/edit/cvReducer.ts:129` -> `return unhide(cv, key)`
- Hidden sections or missing renderers are skipped; base-mode missing flags render MissingBox instead of a section body. `apps/web/src/cv/edit/EditablePage.tsx:94` -> `layout.order.map`; `apps/web/src/cv/edit/EditablePage.tsx:109` -> `const level`
- MissingBox uses the shared category label and why text, with tip versus missing styling and an add callback. `apps/web/src/cv/edit/MissingBox.tsx:13` -> `CATEGORY`; `apps/web/src/cv/edit/MissingBox.tsx:16` -> `level`
- Only tailored mode renders section menus, hidden-section recovery and a single delete/undo snapshot. `apps/web/src/cv/edit/EditablePage.tsx:101` -> `SectionHeading`; `apps/web/src/cv/edit/EditablePage.tsx:116` -> `if (!tailored)`; `apps/web/src/cv/edit/EditablePage.tsx:126` -> `restoreSection`
- The renderer registry is Partial<Record<SectionKey, SectionRenderer>>, so new section keys are not compile-time required here; absent entries are skipped. `apps/web/src/cv/edit/sections/renderers.tsx:18` -> `Partial<Record`; `apps/web/src/cv/edit/EditablePage.tsx:96` -> `!Body`
- The same RolesEdit serves experience, volunteering and projects, but only experience receives scores/toolsRoleId from the registry. `apps/web/src/cv/edit/sections/renderers.tsx:21` -> `Experience`; `apps/web/src/cv/edit/sections/renderers.tsx:24` -> `Volunteering`; `apps/web/src/cv/edit/sections/renderers.tsx:33` -> `Projects`
- firstFieldKey encodes the page's data-field convention; interests targets the chip input and unknown keys return null. `apps/web/src/cv/edit/sections/renderers.tsx:46` -> `firstFieldKey`; `apps/web/src/cv/edit/sections/renderers.tsx:69` -> `case "interests"`
- SectionProps passes CV, dispatch and optional score/focused-role context to each body. `apps/web/src/cv/edit/sections/types.ts:6` -> `SectionProps`
- tested by `apps/web/src/cv/edit/editable-page.test.tsx:37` -> `describe("EditablePage"`

## Connections

- Used by Editor as its editing surface: `apps/web/src/cv/Editor.tsx:220` -> `<EditablePage`; `apps/web/src/cv/edit/EditablePage.tsx:43` -> `EditablePage`
- Uses shared visibility rules in tailored mode: `apps/web/src/cv/edit/EditablePage.tsx:97` -> `isSectionShown`; `packages/shared/src/flags.ts:39` -> `isSectionShown`
- Uses firstFieldKey in both page and panel additions: `apps/web/src/cv/edit/EditablePage.tsx:53` -> `firstFieldKey`; `apps/web/src/cv/panel/Overview.tsx:59` -> `firstFieldKey`; `apps/web/src/cv/edit/sections/renderers.tsx:46` -> `firstFieldKey`
- Uses global .cv-page-edit/.cv-section focus highlighting and .ghost/.tip/.note missing-state rules: `apps/web/src/cv/edit/EditablePage.tsx:92` -> `cv-page-edit`; `apps/web/src/styles/cv-page.css:104` -> `.cv-page-edit .cv-section`; `apps/web/src/styles/cv-page.css:105` -> `:focus-within`; `apps/web/src/cv/edit/MissingBox.tsx:16` -> `ghost`; `apps/web/src/styles/cv-page.css:126` -> `.ghost`; `apps/web/src/styles/cv-page.css:127` -> `.ghost.tip`; `apps/web/src/cv/edit/MissingBox.tsx:18` -> `note`; `apps/web/src/styles/cv-page.css:129` -> `.ghost .note`
- Uses global .section-toast for sticky undo: `apps/web/src/cv/edit/EditablePage.tsx:122` -> `section-toast`; `apps/web/src/styles/cv-page.css:181` -> `.section-toast`
- MissingBox's add button uses the global .btn rule from panel.css; changing that unscoped selector also styles unrelated elements reusing the class. `apps/web/src/cv/edit/MissingBox.tsx:19` -> `className="btn"`; `apps/web/src/styles/panel.css:38` -> `.btn`

## Assumptions

- Focus targets must agree with actual data-field names; missing targets are silently ignored. `apps/web/src/cv/edit/sections/renderers.tsx:55` -> `-title`; `apps/web/src/cv/edit/focus.ts:6` -> `if (!el)`
- The opened set is visit-local state supplied by the parent, not persisted CV content. `apps/web/src/cv/Editor.tsx:71` -> `useOpenedSections`; `apps/web/src/cv/edit/useOpenedSections.ts:9` -> `useState`

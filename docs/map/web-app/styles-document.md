---
id: web-app/styles-document
area: web-app
files: ["apps/web/src/styles/cv-page.css"]
depends_on: ["web-app/styles-base","web-app/styles-editor","web-editor/document","web-editor/page-fields","web-editor/drag","web-editor/section-controls"]
contract: false
checked_hash: 54d9408b
cited: [455be2, c8016f, b0123a, 116714, f6412c, 544633, 059bb1, deedf9, eea587, 0152a4, c4ac53, 9dccc2, 5ed9ca, 0fef56, cc9526, 575b4e, 8b8514, 05854c, 68f8c6, e9e17c, 489dd4, 49330f, 93fe6a, 5c394a, 5d9d6a, 78da66, 5f13ee, 459b7b, 328b5c, fd7d44, 059bb1, 1c359a, 5f9f6c, 575b4e, f7600b, 8b8514, e11db3, 0fef56, eea587, d096c1]
decisions: []
open: []
---
Style CV preview/editing markup and shared page controls across editor, import and tailoring.

- Base photo controls float at the header's top right; the saved photo is 96px wide, while upload/editing reserve 144px and reduce the name field's width accordingly. The remove X is a 20px round badge on the photo's corner. `apps/web/src/styles/cv-page.css:189` -> `.photo-field`; `apps/web/src/styles/cv-page.css:190` -> `.photo-field.is-saved`; `apps/web/src/styles/cv-page.css:193` -> `.photo-box`; `apps/web/src/styles/cv-page.css:197` -> `.photo-remove`; `apps/web/src/styles/cv-page.css:199` -> `.cv-name`; `apps/web/src/styles/cv-page.css:200` -> `.cv-name`
- .cv-page is centered, full width up to 680px, with A4 aspect ratio and document typography; at 720px and below its padding shrinks. `apps/web/src/styles/cv-page.css:2` -> `.cv-page`; `apps/web/src/styles/cv-page.css:46` -> `720px`
- CV inputs/textarea override global field chrome and width, use content sizing, and gain background/inset underline on focus. `apps/web/src/styles/cv-page.css:49` -> `:is(input, textarea)`; `apps/web/src/styles/cv-page.css:61` -> `field-sizing`; `apps/web/src/styles/cv-page.css:66` -> `:focus`
- When a photo floats inside the editable header, the name width reserves the 96px photo and its margin so they share a line. `apps/web/src/styles/cv-page.css:98` -> `.cv-header:has(> .cv-photo)`
- Chip removal buttons are hidden until chip hover or section focus-within; a global .date-hint is positioned absolutely below its parent. `apps/web/src/styles/cv-page.css:76` -> `visibility: hidden`; `apps/web/src/styles/cv-page.css:80` -> `.date-hint`
- At 560px or below, item heads wrap; dates stop flexing. `apps/web/src/styles/cv-page.css:110` -> `560px`
- Unprefixed .adder and .remover start transparent and appear on section hover/focus or their own keyboard focus. `apps/web/src/styles/cv-page.css:121` -> `.adder`; `apps/web/src/styles/cv-page.css:123` -> `.remover`
- Global .ghost styles missing-section boxes; .ghost.tip changes status colors and nested .note/.btn rules change layout/control size. `apps/web/src/styles/cv-page.css:126` -> `.ghost`
- Global .sr-only visually clips accessible text; .drag-row/.drag-grip handle dragged rows, hidden grips and pressed/focus states. `apps/web/src/styles/cv-page.css:144` -> `.sr-only`; `apps/web/src/styles/cv-page.css:145` -> `.drag-row`
- On non-hover devices, .adder, .remover and .drag-grip become partly visible, along with empty role descriptions. `apps/web/src/styles/cv-page.css:152` -> `hover: none`
- More-specific .cv-role .score-pill places scores statically in role headers despite enrichment's global absolute-positioned pill. `apps/web/src/styles/cv-page.css:162` -> `.cv-role .score-pill`; `apps/web/src/styles/enrich.css:3` -> `.score-pill`
- Global .section-menu, .hidden-sections and sticky .section-toast style section controls; .section-menu-list buttons override generic button chrome. `apps/web/src/styles/cv-page.css:168` -> `.section-menu`; `apps/web/src/styles/cv-page.css:171` -> `.section-menu-list`; `apps/web/src/styles/cv-page.css:175` -> `.hidden-sections`; `apps/web/src/styles/cv-page.css:181` -> `.section-toast`
- Print hides global .no-print plus section-menu/hidden-sections/toast with !important; hidden CV rows dim their contents but preserve the hide control. `apps/web/src/styles/cv-page.css:184` -> `@media print`; `apps/web/src/styles/cv-page.css:203` -> `.cv-line.is-hidden`
## Connections
- Used by document rendering, including import preview: `apps/web/src/cv/page/CvDocument.tsx:192` -> `cv-page`; `apps/web/src/styles/cv-page.css:2` -> `.cv-page`; `apps/web/src/imports/ImportScreen.tsx:133` -> `CvDocument`
- Shared edit controls depend on unprefixed names: `apps/web/src/cv/edit/sections/AddButton.tsx:4` -> `adder`; `apps/web/src/styles/cv-page.css:121` -> `.adder`; `apps/web/src/cv/edit/sections/RemoveButton.tsx:5` -> `remover`; `apps/web/src/styles/cv-page.css:123` -> `.remover`; `apps/web/src/cv/edit/DateField.tsx:66` -> `date-hint`; `apps/web/src/styles/cv-page.css:80` -> `.date-hint`
## Assumptions
- These selectors also affect document markup outside the editor; only explicitly qualified rules restrict themselves to .cv-page-edit. `apps/web/src/styles/cv-page.css:49` -> `.cv-page`; `apps/web/src/styles/cv-page.css:104` -> `.cv-page-edit`

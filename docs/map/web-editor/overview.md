---
id: web-editor/overview
area: web-editor
files: ["apps/web/src/cv/panel/HelperPanel.tsx","apps/web/src/cv/panel/Overview.tsx","apps/web/src/cv/panel/overview.test.tsx"]
depends_on: ["web-editor/reducer","web-editor/drag","web-editor/editable-page","web-editor/section-tools","shared/categories","shared/cv","web-editor/reducer-sections"]
contract: false
checked_hash: 0a36f5ab
cited: [0ca3ea, 38e066, dc18df, edaa1f, 6836ea, 6ce9d7, dfb6f3, 8ebb79, 6affff, 9bb0a5, b83696, c52d96, bc88bc, 091521, 0352ce, 189e46, d6e493, 189e46, 2c5960, 3e71b1, ff311b, 09d372, 41a9c4, ff9c7c, 27a71b, 5bfc74, b36a8d, b350f6, a17db3, 0b0c0b, 749f55, ecc25f, 92e0b8, b56fdc, b8348d, b95e73, 72d6fe, fb60fe, 85a196, 676162, 7bb40a, 0f7952, a12a1d, c0346b]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Switch the helper panel between contextual tools and an overview of missing, hidden and available sections.

- HelperPanel chooses tools whenever focus is non-null, otherwise overview; original wording and save gating are passed to tools. `apps/web/src/cv/panel/HelperPanel.tsx:35` -> `focus ?`
- Present sections combine reducer-recognized content with visit-local opened sections in normalized layout order. `apps/web/src/cv/panel/Overview.tsx:38` -> `normalizeLayout`
- Base mode suppresses missing flags for opened sections; tailored mode instead asks for empty sections currently shown. `apps/web/src/cv/panel/Overview.tsx:43` -> `shownEmptyFlags`
- Drag positions are translated from the visible list to saved-section indices; moves involving an opened-only empty section are ignored. `apps/web/src/cv/panel/Overview.tsx:49` -> `const move`
- Adding a standard section dispatches creation, opens it and focuses its first field; custom add dispatches addCustomSection and focuses its title. `apps/web/src/cv/panel/Overview.tsx:55` -> `const addSection`; `apps/web/src/cv/panel/Overview.tsx:62` -> `const addChosen`
- The add selector omits other and currently present sections, always permits a custom section and repairs a no-longer-valid choice. `apps/web/src/cv/panel/Overview.tsx:42` -> `addable`; `apps/web/src/cv/panel/Overview.tsx:46` -> `const chosen`; `apps/web/src/cv/panel/Overview.tsx:150` -> `value={CUSTOM}`
- The score list receives shared scoredItems across all scored kinds; opening a result focuses list-ID-title. `apps/web/src/cv/panel/Overview.tsx:108` -> `scores &&`
- Hidden sections remain in the section list and can be shown through toggleHidden. `apps/web/src/cv/panel/Overview.tsx:123` -> `layout.hidden`; `apps/web/src/cv/panel/Overview.tsx:134` -> `toggleHidden`
- tested by `apps/web/src/cv/panel/overview.test.tsx:38` -> `describe("helper panel overview"`

## Connections

- Used by Editor with page-derived focus and save gating: `apps/web/src/cv/Editor.tsx:197` -> `<HelperPanel`; `apps/web/src/cv/panel/HelperPanel.tsx:32` -> `HelperPanel`
- Uses shared scored enumeration and web-enrich RoleScoreList: `apps/web/src/cv/panel/Overview.tsx:109` -> `scoredItems`; `packages/shared/src/cv.ts:270` -> `scoredItems`; `apps/web/src/cv/panel/Overview.tsx:109` -> `RoleScoreList`; `apps/web/src/cv/enrich/RoleScoreList.tsx:51` -> `RoleScoreList`
- Uses global .panel for sticky positioning and .panel-overview for a constrained column: `apps/web/src/cv/panel/HelperPanel.tsx:34` -> `panel`; `apps/web/src/styles/editor.css:51` -> `.panel`; `apps/web/src/cv/panel/Overview.tsx:70` -> `panel-overview`; `apps/web/src/styles/panel.css:5` -> `.panel-overview`
- Uses global .flag/.tip/.pill and .all-good for missing-state presentation: `apps/web/src/cv/panel/Overview.tsx:88` -> `flag tip`; `apps/web/src/styles/panel.css:9` -> `.flag`; `apps/web/src/styles/panel.css:10` -> `.flag.tip`; `apps/web/src/cv/panel/Overview.tsx:89` -> `pill`; `apps/web/src/styles/panel.css:11` -> `.pill`; `apps/web/src/cv/panel/Overview.tsx:82` -> `all-good`; `apps/web/src/styles/panel.css:16` -> `.all-good`
- Uses global .sec-row/.name.off for section visibility and .add-sec for the add selector: `apps/web/src/cv/panel/Overview.tsx:119` -> `sec-row`; `apps/web/src/styles/panel.css:20` -> `.sec-row`; `apps/web/src/cv/panel/Overview.tsx:127` -> `name off`; `apps/web/src/styles/panel.css:24` -> `.name.off`; `apps/web/src/cv/panel/Overview.tsx:143` -> `add-sec`; `apps/web/src/styles/panel.css:32` -> `.add-sec`
- Visibility buttons and hint text use global .icon-btn and .fine rules; these unscoped selectors also affect unrelated elements reusing those classes. `apps/web/src/cv/panel/Overview.tsx:131` -> `icon-btn`; `apps/web/src/styles/panel.css:27` -> `.icon-btn`; `apps/web/src/cv/panel/Overview.tsx:76` -> `fine`; `apps/web/src/styles/panel.css:35` -> `.fine`

## Assumptions

- Panel focus must refer to a shared category; HelperPanel forwards it directly to SectionTools. `apps/web/src/cv/panel/HelperPanel.tsx:8` -> `CategoryKey`; `apps/web/src/cv/panel/HelperPanel.tsx:36` -> `focus={focus}`
- Section IDs in DragList are cast back to SectionKey; callers rely on present being derived from normalized layout keys. `apps/web/src/cv/panel/Overview.tsx:41` -> `layout.order`; `apps/web/src/cv/panel/Overview.tsx:122` -> `as SectionKey`

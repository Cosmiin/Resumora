---
id: web-editor/role-editors
area: web-editor
files: ["apps/web/src/cv/edit/sections/RolesEdit.tsx","apps/web/src/cv/edit/sections/RoleItem.tsx","apps/web/src/cv/edit/sections/EducationEdit.tsx","apps/web/src/cv/edit/roles.test.tsx"]
depends_on: ["web-editor/reducer","web-editor/bullets","web-editor/page-fields","web-editor/focus","web-editor/drag","web-editor/section-controls","web-editor/document","shared/cv"]
contract: false
checked_hash: d5e24bed
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Edit role-shaped lists and education with stable IDs, dates and row controls.

- RolesEdit handles experience, volunteering and projects using the supplied list; add focuses the generated title field and move dispatches list-local indices. `apps/web/src/cv/edit/sections/RolesEdit.tsx:24` -> `RolesEdit`; `apps/web/src/cv/edit/sections/RolesEdit.tsx:27` -> `const add`
- The display name falls back from title to company to a list-specific untitled label. `apps/web/src/cv/edit/sections/RoleItem.tsx:44` -> `roleName`
- Weak bullet marks require a ready score, include only scores below 75 and use the softer mark from 40 upward; marks appear only while toolsOpen. `apps/web/src/cv/edit/sections/RoleItem.tsx:49` -> `weakBullets`; `apps/web/src/cv/edit/sections/RoleItem.tsx:82` -> `toolsOpen`
- Typing present dispatches setCurrent; clicking the present label clears current and focuses endDate after render. `apps/web/src/cv/edit/sections/RoleItem.tsx:64` -> `onPresent`; `apps/web/src/cv/edit/sections/RoleItem.tsx:72` -> `reopenEnd`
- Projects substitute selected labels and show a URL field; descriptions use MAX_LONG_TEXT. `apps/web/src/cv/edit/sections/RoleItem.tsx:88` -> `PROJECT_LABELS`; `apps/web/src/cv/edit/sections/RoleItem.tsx:99` -> `MAX_LONG_TEXT`; `apps/web/src/cv/edit/sections/RoleItem.tsx:152` -> `list === "projects"`
- Score pills focus the role's title, which drives section/item tools through DOM focus. `apps/web/src/cv/edit/sections/RoleItem.tsx:84` -> `openRole`; `apps/web/src/cv/edit/sections/RoleItem.tsx:108` -> `ScorePill`
- Education uses degree as the main editable title and school as a detail; adding an item focuses degree. `apps/web/src/cv/edit/sections/EducationEdit.tsx:62` -> `field("degree"`; `apps/web/src/cv/edit/sections/EducationEdit.tsx:71` -> `field("school"`; `apps/web/src/cv/edit/sections/EducationEdit.tsx:85` -> `const add`
- Education notes are multiline but pass no explicit maxLength, so ItemField/PageField apply the standard text limit. `apps/web/src/cv/edit/sections/EducationEdit.tsx:35` -> `<ItemField`; `apps/web/src/cv/edit/sections/EducationEdit.tsx:77` -> `field("notes"`; `apps/web/src/cv/edit/PageField.tsx:42` -> `MAX_TEXT`
- tested by `apps/web/src/cv/edit/roles.test.tsx:43` -> `describe("roles on the page"`; `apps/web/src/cv/edit/roles.test.tsx:103` -> `describe("education on the page"`; `apps/web/src/cv/edit/roles.test.tsx:130` -> `describe("skills on the page"`

## Connections

- Used by the renderer registry for three scored lists and education: `apps/web/src/cv/edit/sections/renderers.tsx:22` -> `RolesEdit`; `apps/web/src/cv/edit/sections/renderers.tsx:28` -> `EducationEdit`; `apps/web/src/cv/edit/sections/RolesEdit.tsx:24` -> `RolesEdit`; `apps/web/src/cv/edit/sections/EducationEdit.tsx:82` -> `EducationEdit`
- Uses reducer setCurrent to clear endDate atomically: `apps/web/src/cv/edit/sections/RoleItem.tsx:65` -> `setCurrent`; `apps/web/src/cv/edit/cvReducer.ts:361` -> `case "setCurrent"`
- Uses global .cv-role-dates/.cv-present/.cv-role-desc rules, including hidden empty descriptions revealed on hover, focus or touch: `apps/web/src/cv/edit/sections/RoleItem.tsx:109` -> `cv-role-dates`; `apps/web/src/styles/cv-page.css:134` -> `.cv-role-dates`; `apps/web/src/cv/edit/sections/RoleItem.tsx:124` -> `cv-present`; `apps/web/src/styles/cv-page.css:137` -> `.cv-present`; `apps/web/src/cv/edit/sections/RoleItem.tsx:153` -> `cv-role-desc`; `apps/web/src/styles/cv-page.css:140` -> `.cv-role-desc.is-empty`; `apps/web/src/styles/cv-page.css:153` -> `.cv-role-desc`
- Uses global .cv-line/.cv-item-head/.cv-item-details for both role and education layout: `apps/web/src/cv/edit/sections/RoleItem.tsx:105` -> `cv-line`; `apps/web/src/cv/edit/sections/EducationEdit.tsx:60` -> `cv-line`; `apps/web/src/styles/cv-page.css:106` -> `.cv-line`; `apps/web/src/cv/edit/sections/RoleItem.tsx:106` -> `cv-item-head`; `apps/web/src/styles/cv-page.css:111` -> `flex-wrap`; `apps/web/src/cv/edit/sections/RoleItem.tsx:145` -> `cv-item-details`; `apps/web/src/styles/cv-page.css:115` -> `.cv-item-details`

## Assumptions

- The row accepts Experience with an optional URL and trusts callers to pair it with the matching RoleList. `apps/web/src/cv/edit/sections/RoleItem.tsx:22` -> `Experience`; `apps/web/src/cv/edit/sections/RoleItem.tsx:91` -> `list={list}`
- Scoring freshness is represented by score.state; weakBullets does not itself recalculate a text fingerprint. `apps/web/src/cv/edit/sections/RoleItem.tsx:50` -> `score?.state !== "ready"`

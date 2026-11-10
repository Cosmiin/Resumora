---
id: web-tailor/role-panel
area: web-tailor
files: ["apps/web/src/tailor/RolePanel.tsx","apps/web/src/tailor/role-context.test.tsx"]
depends_on: ["shared/cv","web-editor/document","web-tailor/role-done"]
contract: false
checked_hash: d1dcc748
decisions: []
open: []
---
Show source role context and resolve experience proposals back to roles.

- Role uses the experience item type; roleOf searches only experience ids and their bullet ids. `apps/web/src/tailor/RolePanel.tsx:7` -> `Role`; `apps/web/src/tailor/RolePanel.tsx:11` -> `cv.experience.find`
- roleMeta joins trimmed company and locale-formatted date range, omitting empty pieces. `apps/web/src/tailor/RolePanel.tsx:15` -> `formatRange`
- RoleHeading substitutes translated untitled text for blank titles. `apps/web/src/tailor/RolePanel.tsx:19` -> `role.title.trim`
- Unmatched bulletId displays the whole-role tag; a matching bullet sets both is-current class and aria-current. `apps/web/src/tailor/RolePanel.tsx:29` -> `pointed`; `apps/web/src/tailor/RolePanel.tsx:36` -> `is-current`
- Description is omitted when whitespace-only; the bullet list appears only when nonempty. `apps/web/src/tailor/RolePanel.tsx:34` -> `description.trim`
- tested by `apps/web/src/tailor/role-context.test.tsx:35` -> `it`

## Connections

- Used by contextual questions and RoleReview headings. `apps/web/src/tailor/QuestionCard.tsx:36` -> `RolePanel`; `apps/web/src/tailor/RolePanel.tsx:28` -> `RolePanel`; `apps/web/src/tailor/RoleReview.tsx:60` -> `RoleHeading`; `apps/web/src/tailor/RolePanel.tsx:17` -> `RoleHeading`
- Uses focus.css's fm-bullet.is-current highlight, importing that stylesheet itself. `apps/web/src/tailor/RolePanel.tsx:5` -> `focus.css`; `apps/web/src/tailor/RolePanel.tsx:36` -> `fm-bullet is-current`; `apps/web/src/styles/focus.css:26` -> `.fm-bullet.is-current`

## Assumptions

- A role outside experience can be displayed directly, but roleOf cannot resolve its proposal; callers needing projects use shared scored-item lookup instead. `apps/web/src/tailor/RolePanel.tsx:11` -> `cv.experience.find`; `apps/web/src/tailor/TailorFlow.tsx:34` -> `findScored`

---
id: web-app/import-headings
area: web-app
files: ["apps/web/src/imports/HeadingMap.tsx","apps/web/src/imports/imports.test.tsx"]
depends_on: ["shared/categories","shared/move-other","shared/imports","web-app/i18n","web-app/styles-import"]
contract: false
checked_hash: 506aead0
cited: [42ab45, 7dc995, 140364, 8bfbde, f52626, 47bff4, 158221, 88f60c, 198842, ede576, dbf046, 4d1320, 49b3a0, 6fb334, 193ad8, 28d6d7]
decisions: []
open: []
---
Connect original headings to current categories and movable Other sections.

- Empty heading input renders nothing. `apps/web/src/imports/HeadingMap.tsx:27` -> `return null`
- Other-heading matching trims and lowercases titles; custom sections named by any Other heading are excluded from the spare list. `apps/web/src/imports/HeadingMap.tsx:31` -> `norm`
- Each Other row first finds an untaken same-title custom section, otherwise consumes the next spare; taken IDs prevent repeated title matches. `apps/web/src/imports/HeadingMap.tsx:37` -> `!taken.has`
- Only rows with a matched custom entry receive a move selector. `apps/web/src/imports/HeadingMap.tsx:55` -> `entryFor`; `apps/web/src/imports/HeadingMap.tsx:61` -> `entry &&`
- Selectors keep an empty selected value and call onMove with entry ID, chosen target and heading index. `apps/web/src/imports/HeadingMap.tsx:64` -> `value=""`
- Summary counts as zero/one after trimming; achievements count nonblank text; skills total all three groups; Other counts its matched entry; remaining categories count the full section array. `apps/web/src/imports/HeadingMap.tsx:5` -> `switch (key)`
- Move targets come from MOVE_TARGETS and both current/target labels use content.locale. `apps/web/src/imports/HeadingMap.tsx:60` -> `label[locale]`; `apps/web/src/imports/HeadingMap.tsx:68` -> `MOVE_TARGETS`
- tested by `apps/web/src/imports/imports.test.tsx:343` -> `section with that heading`
- tested by `apps/web/src/imports/imports.test.tsx:378` -> `duplicate Other headings`
## Connections
- Used by summary and eventually the review's move handler: `apps/web/src/imports/ImportSummary.tsx:42` -> `onMove`; `apps/web/src/imports/HeadingMap.tsx:65` -> `onMove`; `apps/web/src/imports/ImportScreen.tsx:62` -> `function move`
## Assumptions
- Non-Other counts describe entire destination categories, not a per-heading allocation of items; multiple original headings for one category can display the same count. `apps/web/src/imports/HeadingMap.tsx:15` -> `content[key].length`; `apps/web/src/imports/HeadingMap.tsx:74` -> `itemCount`

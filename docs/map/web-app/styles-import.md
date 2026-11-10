---
id: web-app/styles-import
area: web-app
files: ["apps/web/src/styles/review.css"]
depends_on: ["web-app/styles-base","web-app/import-review","web-app/import-summary","web-app/import-headings"]
contract: false
checked_hash: df4c5288
decisions: []
open: []
---
Style the full-window import review, responsive summary and heading map.

- .import-screen fixes the review over the viewport at z-index 20 and suppresses its own focus outline. `apps/web/src/styles/review.css:2` -> `.import-screen`
- The import bar wraps; actions are pushed to the end and apply/action buttons have a 44px minimum height. `apps/web/src/styles/review.css:4` -> `.import-bar`; `apps/web/src/styles/review.css:7` -> `44px`
- .import-body is the scrollable flex region; page and side use different flex bases, with the side sticky at the top and capped at 460px. `apps/web/src/styles/review.css:8` -> `.import-body`; `apps/web/src/styles/review.css:11` -> `.import-side`
- Above 900px the body stops wrapping; at 900px and below the side becomes static, uncapped and full-basis with a top border. `apps/web/src/styles/review.css:37` -> `901px`; `apps/web/src/styles/review.css:41` -> `900px`
- .import-note uses warning tokens, whereas .import-note-flags later overrides its colors to the neutral surface. `apps/web/src/styles/review.css:18` -> `.import-note`; `apps/web/src/styles/review.css:36` -> `.import-note-flags`
- Global .map-wrap/.map-title/.map define the heading table; .orig/.cat/.n and tr.other are scoped beneath .map. Other rows get a distinct background and selects have a 32px minimum height. `apps/web/src/styles/review.css:26` -> `.map-wrap`; `apps/web/src/styles/review.css:31` -> `.map .orig`; `apps/web/src/styles/review.css:35` -> `.map select`
## Connections
- Used by ImportScreen's viewport dialog and side container: `apps/web/src/imports/ImportScreen.tsx:111` -> `import-screen`; `apps/web/src/styles/review.css:2` -> `.import-screen`; `apps/web/src/imports/ImportScreen.tsx:136` -> `import-side`; `apps/web/src/styles/review.css:11` -> `.import-side`
- HeadingMap relies on unprefixed table names: `apps/web/src/imports/HeadingMap.tsx:45` -> `className="map"`; `apps/web/src/styles/review.css:28` -> `.map`
## Assumptions
- The fixed overlay itself does not disable background navigation; the editor supplies inert separately. `apps/web/src/styles/review.css:2` -> `position: fixed`; `apps/web/src/cv/Editor.tsx:230` -> `inert`

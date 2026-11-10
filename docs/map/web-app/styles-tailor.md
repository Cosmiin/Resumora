---
id: web-app/styles-tailor
area: web-app
files: ["apps/web/src/styles/tailor.css"]
depends_on: ["web-app/styles-base","web-app/styles-focus","web-app/styles-document","web-tailor/flow","web-tailor/page","web-tailor/guided-review","web-tailor/cover-letter","web-tailor/export-menu"]
contract: false
checked_hash: e3a7683d
decisions: []
open: []
---
Style tailoring flows, translated documents, letters and guided review.

- .tailor-mode is a fixed, scrollable z-index-1000 frame with a centered 720px column; .is-wide expands it to 1080px. `apps/web/src/styles/tailor.css:3` -> `.tailor-mode`; `apps/web/src/styles/tailor.css:66` -> `.is-wide`
- Feature names generally use tailor-*/tailored-*, but letter-*, retailor-*, export-* and unprefixed .guide families are also global. `apps/web/src/styles/tailor.css:115` -> `.tailored-bar`; `apps/web/src/styles/tailor.css:120` -> `.letter-tab`; `apps/web/src/styles/tailor.css:142` -> `.retailor-sections`; `apps/web/src/styles/tailor.css:155` -> `.export-warning`; `apps/web/src/styles/tailor.css:171` -> `.guide`
- Changed/inferred/reverted rows have distinct backgrounds/edges; reverted text is struck through and pressed actions receive selected colors. `apps/web/src/styles/tailor.css:56` -> `.is-changed`; `apps/web/src/styles/tailor.css:63` -> `aria-pressed`
- .tailor-new highlights additions, .tailor-guess highlights inferences, and adjacent .tailor-tip appears only on guess-tag hover/focus. `apps/web/src/styles/tailor.css:95` -> `.tailor-new`; `apps/web/src/styles/tailor.css:99` -> `+ .tailor-tip`
- .tailor-moment provides a positioned parent for enrichment's fm-moment; .has-more converts that overlay to relative in-flow content. `apps/web/src/styles/tailor.css:102` -> `.tailor-moment`; `apps/web/src/styles/tailor.css:105` -> `.fm-moment`
- At 760px flow padding shrinks and the role/question split becomes one column; letter-tab separately collapses at 52rem. `apps/web/src/styles/tailor.css:107` -> `760px`; `apps/web/src/styles/tailor.css:121` -> `52rem`
- Print removes the letter sidebar, page borders/padding, change/inference backgrounds and redo control. `apps/web/src/styles/tailor.css:135` -> `@media print`; `apps/web/src/styles/tailor.css:138` -> `@media print`; `apps/web/src/styles/tailor.css:146` -> `@media print`
- Retailor checkboxes explicitly override global field width to 18px and prevent flex growth. `apps/web/src/styles/tailor.css:145` -> `width: 18px`
- .guide is a flex column with .guide-card ordered first and sticky; the page dims non-focus content while the focused CV mark gets a ring and 14rem scroll margin. `apps/web/src/styles/tailor.css:171` -> `.guide`; `apps/web/src/styles/tailor.css:173` -> `:not`; `apps/web/src/styles/tailor.css:175` -> `position: sticky`
- Hidden offered items dim only direct child elements other than .tailor-hide; bare subtitle/description text in LayoutReview stays undimmed. The .tailor-hide checkbox overrides global width. `apps/web/src/styles/tailor.css:181` -> `> :not(.tailor-hide)`; `apps/web/src/tailor/LayoutReview.tsx:97` -> `item.sub`; `apps/web/src/tailor/LayoutReview.tsx:98` -> `item.fields.description`; `apps/web/src/styles/tailor.css:183` -> `width: auto`
## Connections
- Imported by both tailoring page modules rather than main directly: `apps/web/src/tailor/TailorFlow.tsx:20` -> `tailor.css`; `apps/web/src/tailor/TailoredCvPage.tsx:19` -> `tailor.css`; `apps/web/src/styles/tailor.css:3` -> `.tailor-mode`
- GuidedReview uses the global guide layout around CvDocument: `apps/web/src/tailor/GuidedReview.tsx:98` -> `className="guide"`; `apps/web/src/styles/tailor.css:171` -> `.guide`; `apps/web/src/tailor/GuidedReview.tsx:100` -> `guide-card`; `apps/web/src/styles/tailor.css:175` -> `.guide-card`
- Celebration styles depend on focus.css: `apps/web/src/styles/tailor.css:105` -> `.fm-moment`; `apps/web/src/styles/focus.css:126` -> `.fm-moment`; `apps/web/src/tailor/TailorMoment.tsx:38` -> `fm-moment`
## Assumptions
- Guess tooltip visibility depends on adjacent sibling markup and guided dimming depends on .cv-mark-focus inside .cv-page. `apps/web/src/styles/tailor.css:99` -> `+ .tailor-tip`; `apps/web/src/styles/tailor.css:173` -> `.cv-mark-focus`

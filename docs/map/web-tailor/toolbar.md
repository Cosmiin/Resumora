---
id: web-tailor/toolbar
area: web-tailor
files: ["apps/web/src/tailor/TailorToolbar.tsx","apps/web/src/tailor/tailored-page.test.tsx"]
depends_on: ["web-editor/templates","web-tailor/page","shared/match-score"]
contract: false
checked_hash: a54525b8
decisions: []
open: []
---
Render CV/letter tabs, score summary and the template selector.

- Tabs are cv and letter buttons with role=tab and aria-selected, calling onTab on selection. `apps/web/src/tailor/TailorToolbar.tsx:97` -> `cv`
- Score band prefers latest over base; no band means no score block. `apps/web/src/tailor/TailorToolbar.tsx:93` -> `band`; `apps/web/src/tailor/TailorToolbar.tsx:103` -> `band`
- Missing totals render an em dash; the latest score text falls back to base. `apps/web/src/tailor/TailorToolbar.tsx:89` -> `total`; `apps/web/src/tailor/TailorToolbar.tsx:105` -> `latest ?? base`
- Template options come from TEMPLATES; change normalizes the selected id with getTemplate before notifying the parent. `apps/web/src/tailor/TailorToolbar.tsx:110` -> `getTemplate`
- Extra actions are passed as children after the template selector. `apps/web/src/tailor/TailorToolbar.tsx:114` -> `children`
- tested by `apps/web/src/tailor/tailored-page.test.tsx:91` -> `it`

## Connections

- Uses the shared web template registry with classic, modern and compact and classic fallback. `apps/web/src/tailor/TailorToolbar.tsx:111` -> `TEMPLATES`; `apps/web/src/cv/page/templates.ts:1` -> `TEMPLATES`; `apps/web/src/cv/page/templates.ts:10` -> `TEMPLATES[0]`
- Uses global tailored-bar and aria-selected tab styling. `apps/web/src/tailor/TailorToolbar.tsx:95` -> `tailored-bar`; `apps/web/src/styles/tailor.css:115` -> `.tailored-bar`; `apps/web/src/tailor/TailorToolbar.tsx:98` -> `aria-selected`; `apps/web/src/styles/tailor.css:117` -> `aria-selected`

## Assumptions

- Selection callbacks own persistence; this component changes no server data directly. `apps/web/src/tailor/TailorToolbar.tsx:110` -> `onTemplate`

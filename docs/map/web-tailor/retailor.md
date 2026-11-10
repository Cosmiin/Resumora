---
id: web-tailor/retailor
area: web-tailor
files: ["apps/web/src/tailor/RetailorDialog.tsx","apps/web/src/tailor/retailor.test.tsx","apps/web/src/tailor/section-review.test.tsx"]
depends_on: ["shared/tailoring","web-tailor/page","web-tailor/client-actions"]
contract: false
checked_hash: 6f386fca
decisions: []
open: []
---
Select sections for a new re-tailoring run.

- Selection starts empty and toggles a copied Set; Start is disabled until at least one section is picked. `apps/web/src/tailor/RetailorDialog.tsx:9` -> `new Set`; `apps/web/src/tailor/RetailorDialog.tsx:43` -> `picked.size`
- Start filters shared TAILOR_SECTIONS, preserving canonical order rather than click order. `apps/web/src/tailor/RetailorDialog.tsx:44` -> `TAILOR_SECTIONS.filter`
- Mount focuses the first checkbox; Tab/Shift-Tab wrap between controls. `apps/web/src/tailor/RetailorDialog.tsx:11` -> `focus`; `apps/web/src/tailor/RetailorDialog.tsx:20` -> `querySelectorAll`
- Escape, clicking the scrim itself and Cancel call onClose. `apps/web/src/tailor/RetailorDialog.tsx:18` -> `Escape`; `apps/web/src/tailor/RetailorDialog.tsx:28` -> `e.currentTarget`; `apps/web/src/tailor/RetailorDialog.tsx:42` -> `onClose`
- Busy disables Start but leaves section toggles and closing available; error is supplied by the parent. `apps/web/src/tailor/RetailorDialog.tsx:35` -> `onChange`; `apps/web/src/tailor/RetailorDialog.tsx:40` -> `error`
- tested by `apps/web/src/tailor/retailor.test.tsx:62` -> `it`
- tested by `apps/web/src/tailor/section-review.test.tsx:36` -> `it`

## Connections

- Used by the tailored page's startRetailor callback. `apps/web/src/tailor/TailoredCvPage.tsx:160` -> `RetailorDialog`; `apps/web/src/tailor/RetailorDialog.tsx:8` -> `RetailorDialog`
- Uses jobs.css modal classes and tailor.css checkbox sizing. `apps/web/src/tailor/RetailorDialog.tsx:28` -> `jobs-scrim`; `apps/web/src/styles/jobs.css:63` -> `.jobs-scrim`; `apps/web/src/tailor/RetailorDialog.tsx:29` -> `add-job-dialog`; `apps/web/src/styles/jobs.css:73` -> `.add-job-dialog`; `apps/web/src/tailor/RetailorDialog.tsx:32` -> `retailor-sections`; `apps/web/src/styles/tailor.css:145` -> `.retailor-sections`

## Assumptions

- Available sections come from the global list even when a document has no items; the server/shared run builder filters empty optional sections. `apps/web/src/tailor/RetailorDialog.tsx:33` -> `TAILOR_SECTIONS.map`; `packages/shared/src/tailor.ts:55` -> `TAILOR_SECTIONS.filter`
